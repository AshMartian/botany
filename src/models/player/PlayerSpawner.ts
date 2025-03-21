import {
  Vector3,
  AbstractMesh,
  Ray,
  Color3,
  MeshBuilder,
  Scene as BabylonScene,
  TargetCamera,
} from '@babylonjs/core';
import SharedPlayerState from '@/models/player/SharedPlayerState';
import WorldManager from '@/models/terrain/WorldManager';
import store from '@/store/store';
import storeVuex from '@/store/vuex';
import { validateTerrainCollisions } from '@/models/player/MoveHelper';

/**
 * Handles player spawning and teleportation functionality
 */
export default class PlayerSpawner {
  private scene: BabylonScene;
  private debugMode: boolean;

  constructor(scene: BabylonScene, debugMode = false) {
    this.scene = scene;
    this.debugMode = debugMode;
  }

  /**
   * Spawn player at specified global position
   */
  public async spawnPlayer(spawnGlobalPosition: Vector3): Promise<void> {
    const playerId = store.getPlayerId();
    const playerMesh = this.scene.getMeshByName('playerFoot_' + playerId);

    if (!playerMesh) {
      console.error('Player mesh not found');
      return;
    }

    // Use the unified positioning method with isInitialSpawn=true
    await this.positionPlayerOnTerrain(playerMesh, spawnGlobalPosition, true);

    // Validate terrain collisions to prevent crashes
    validateTerrainCollisions(this.scene);

    // Enable physics/controls after spawning
    if (window.playerController?.enableControls) {
      window.playerController.enableControls();
    }

    // Position camera for optimal debugging view
    if (this.scene.activeCamera) {
      this.scene.activeCamera.position = new Vector3(0, 200, -200);
      (this.scene.activeCamera as TargetCamera).setTarget(new Vector3(0, 0, 0));

      // Add axes for reference
      const size = 100;
      const axisX = MeshBuilder.CreateLines(
        'axisX',
        {
          points: [new Vector3(0, 0, 0), new Vector3(size, 0, 0)],
        },
        this.scene
      );
      axisX.color = new Color3(1, 0, 0);

      const axisY = MeshBuilder.CreateLines(
        'axisY',
        {
          points: [new Vector3(0, 0, 0), new Vector3(0, size, 0)],
        },
        this.scene
      );
      axisY.color = new Color3(0, 1, 0);

      const axisZ = MeshBuilder.CreateLines(
        'axisZ',
        {
          points: [new Vector3(0, 0, 0), new Vector3(0, 0, size)],
        },
        this.scene
      );
      axisZ.color = new Color3(0, 0, 1);
    }

    console.log('Player spawned successfully at global position:', spawnGlobalPosition.toString());
  }

  /**
   * Teleport player to a global position with proper loading
   */
  public async teleportToVirtualPosition(globalPos: Vector3): Promise<boolean> {
    const engine = this.scene.getEngine();
    engine.displayLoadingUI();

    try {
      const playerState = SharedPlayerState.getInstance();
      const playerMesh = playerState.findPlayerMesh();
      if (!playerMesh) {
        console.error('Cannot teleport: Player mesh not found');
        engine.hideLoadingUI();
        return false;
      }

      console.log('Teleporting to global position:', globalPos.toString());

      // Validate global position within world bounds
      const validGlobalPos = new Vector3(
        Math.max(0, Math.min(WorldManager.WORLD_WIDTH, globalPos.x)),
        globalPos.y,
        Math.max(0, Math.min(WorldManager.WORLD_HEIGHT, globalPos.z))
      );

      // Use the unified positioning method
      const success = await this.positionPlayerOnTerrain(playerMesh, validGlobalPos, false);

      // Ensure minimap is updated
      if (window.miniMap) {
        window.miniMap.show();
      }

      engine.hideLoadingUI();
      return success;
    } catch (error) {
      console.error('Teleportation failed:', error);

      // Make sure to unlock terrain manager even on error
      if (window.terrainManager) {
        window.terrainManager.lockForTeleport(false);
      }

      engine.hideLoadingUI();
      return false;
    }
  }

  /**
   * Unified method for positioning player on terrain
   * Used by both spawn and teleport functions
   */
  private async positionPlayerOnTerrain(
    playerMesh: AbstractMesh,
    globalPos: Vector3,
    isInitialSpawn = false
  ): Promise<boolean> {
    console.log(`Positioning player at global position: ${globalPos.toString()}`);

    // Set loading state
    storeVuex.commit('LOADING_TOGGLE', true);

    try {
      // STEP 1: Set the global player position in the world manager
      WorldManager.setGlobalPlayerPosition(globalPos);

      // STEP 2: Reset player to origin at safe height
      const safeHeight = 1000; // High enough to be above any terrain
      playerMesh.position = new Vector3(0, safeHeight, 0);
      console.log('Reset player to origin at safe height:', safeHeight);

      // STEP 3: Clear existing terrain chunks and lock manager
      if (window.terrainManager) {
        window.terrainManager.lockForTeleport(true);
        await window.terrainManager.clearAllChunks();

        // STEP 4: Calculate chunk coordinates
        const chunkX = Math.floor(globalPos.x / window.terrainManager.chunkSize);
        const chunkY = Math.floor(globalPos.z / window.terrainManager.chunkSize);

        // STEP 5: Load center chunk at highest resolution
        console.log('Loading center chunk at highest resolution');
        const centerChunk = await window.terrainManager.loadPriorityChunk(chunkX, chunkY);

        if (centerChunk && centerChunk.isFullyReady()) {
          // STEP 6: Raycast to find ground height
          const centerMesh = centerChunk.getMesh();
          if (centerMesh) {
            const rayStart = new Vector3(0, safeHeight, 0);
            const ray = new Ray(rayStart, Vector3.Down(), safeHeight * 2);

            // Try raycasting against the center chunk
            const hit = ray.intersectsMesh(centerMesh);

            if (hit.hit && hit.pickedPoint) {
              // Position player safely above ground
              const groundHeight = hit.pickedPoint.y;
              playerMesh.position.y = groundHeight + 2; // 2 units above ground
              console.log(`Positioned player at height ${playerMesh.position.y} above terrain`);
            } else {
              console.warn('Raycast failed to hit center chunk - using fallback height');
              playerMesh.position.y = 100; // Fallback height
            }
          }

          // STEP 7: Start loading surrounding chunks in background with appropriate LOD
          setTimeout(() => {
            if (window.terrainManager) {
              console.log('Loading surrounding chunks with appropriate LOD');
              window.terrainManager.loadSurroundingChunksAsync(chunkX, chunkY);

              // Unlock terrain manager after a delay
              setTimeout(() => {
                if (window.terrainManager) {
                  window.terrainManager.lockForTeleport(false);
                  window.terrainManager._hasInitialized = true;
                }
              }, 1000);
            }
          }, 300);
        } else {
          console.error('Failed to load center chunk - using fallback positioning');
          playerMesh.position.y = 100; // Fallback height

          // Unlock terrain manager
          setTimeout(() => {
            if (window.terrainManager) {
              window.terrainManager.lockForTeleport(false);
            }
          }, 500);
        }
      } else {
        console.error('Terrain manager not available');
        playerMesh.position.y = 100; // Fallback height
      }

      // Update and save position
      this.updateGlobalMapPosition(globalPos);
      this.savePlayerPosition(globalPos);

      // Enable player controls if not initial spawn (initial spawn handles this separately)
      if (!isInitialSpawn && window.playerController?.enableControls) {
        window.playerController.enableControls();
      }

      // Clear loading state
      storeVuex.commit('LOADING_TOGGLE', false);
      return true;
    } catch (error) {
      console.error('Failed to position player on terrain:', error);

      // Ensure terrain manager is unlocked on error
      if (window.terrainManager) {
        window.terrainManager.lockForTeleport(false);
      }

      // Use fallback height and clear loading state
      playerMesh.position.y = 100; // Fallback height
      storeVuex.commit('LOADING_TOGGLE', false);
      return false;
    }
  }

  /**
   * Get saved position from localStorage
   */
  public getSavedPosition(): Vector3 | null {
    const saved = localStorage.getItem('playerGlobalPosition');
    if (saved) {
      try {
        // Handle both formats - direct coordinates or with position property
        const parsedData = JSON.parse(saved);
        let x, z;

        if (parsedData.position) {
          // New format with timestamp
          x = parsedData.position.x;
          z = parsedData.position.z;
        } else {
          // Old format
          x = parsedData.x;
          z = parsedData.z;
        }

        // Validate coordinates
        if (isNaN(x) || isNaN(z) || x < 0 || x > 1 || z < 0 || z > 1) {
          console.warn('Invalid saved position coordinates, using defaults');
          return null;
        }

        // Convert normalized coordinates to virtual world coordinates
        const virtualX = x * WorldManager.WORLD_WIDTH;
        const virtualZ = z * WorldManager.WORLD_HEIGHT;

        console.log(
          'Loaded saved position:',
          `Normalized: (${x}, ${z})`,
          `Virtual: (${virtualX}, ${virtualZ})`
        );

        return new Vector3(virtualX, 100, virtualZ);
      } catch (e) {
        console.warn('Failed to parse saved position', e);
      }
    }
    return null;
  }

  /**
   * Update global map position
   */
  public updateGlobalMapPosition(globalPos: Vector3): void {
    // Convert global position to normalized globe coordinates (0-1 range)
    const normalizedX = globalPos.x / WorldManager.WORLD_WIDTH;
    const normalizedZ = globalPos.z / WorldManager.WORLD_HEIGHT;

    // Ensure values are within 0-1 range
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    // Store normalized coordinates for global map use
    store.setPlayerGlobalPosition({
      x: clampedX,
      z: clampedZ,
    });

    if (this.debugMode) {
      console.log(
        'Global map position:',
        `Normalized: (${clampedX.toFixed(4)}, ${clampedZ.toFixed(4)})`,
        `Global: (${globalPos.x.toFixed(2)}, ${globalPos.z.toFixed(2)})`
      );
    }
  }

  /**
   * Save player position to localStorage
   */
  private savePlayerPosition(globalPos: Vector3): void {
    const normalizedX = globalPos.x / WorldManager.WORLD_WIDTH;
    const normalizedZ = globalPos.z / WorldManager.WORLD_HEIGHT;

    // Ensure values are within 0-1 range
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    localStorage.setItem(
      'playerGlobalPosition',
      JSON.stringify({
        position: {
          x: clampedX,
          z: clampedZ,
        },
        timestamp: Date.now(),
      })
    );
  }
}

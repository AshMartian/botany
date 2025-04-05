import {
  Vector3,
  AbstractMesh,
  Ray,
  Color3,
  MeshBuilder,
  Scene as BabylonScene,
  TargetCamera,
} from '@babylonjs/core';
import SharedPlayerState from '@/models/playerOnline/SharedPlayerState';
import WorldManager from '@/models/terrain/WorldManager';
import { usePlayerStore } from '@/stores/playerStore';

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
    const store = usePlayerStore();
    const playerId = store.selfPlayerId;
    const playerMesh = this.scene.getMeshByName('playerFoot_' + playerId);

    if (!playerMesh) {
      console.error('Player mesh not found');
      return;
    }

    // Use the unified positioning method with isInitialSpawn=true
    await this.positionPlayerOnTerrain(playerMesh, spawnGlobalPosition, true);

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
        Math.max(0, Math.min(WorldManager.WORLD_WIDTH, globalPos.x)), // Corrected: X uses WORLD_WIDTH
        globalPos.y, // Keep Y as is for now
        Math.max(0, Math.min(WorldManager.WORLD_HEIGHT, globalPos.z)) // Corrected: Z uses WORLD_HEIGHT
      );
      if (!validGlobalPos.equals(globalPos)) {
        console.warn(`Teleport position clamped to world bounds: ${validGlobalPos.toString()}`);
      }

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
    console.log(
      `Positioning player at global: ${globalPos.toString()} (Initial Spawn: ${isInitialSpawn})`
    );
    const terrainManager = window.terrainManager; // Cache reference

    if (!terrainManager) {
      console.error('Terrain manager not available for positioning player.');
      playerMesh.position = new Vector3(0, 100, 0); // Fallback position
      return false;
    }

    try {
      // STEP 1: Set global player position in WorldManager
      WorldManager.setGlobalPlayerPosition(globalPos);

      // STEP 2: Reset player to origin (engine space) at a safe height
      const safeHeight = 1000;
      playerMesh.position = new Vector3(0, safeHeight, 0);
      console.log('Reset player to engine origin at safe height:', safeHeight);

      // STEP 3: Lock manager and clear existing terrain chunks
      terrainManager.lockForTeleport(true);
      await terrainManager.clearAllChunks();

      // STEP 4: Calculate target chunk coordinates
      const chunkX = Math.floor(globalPos.x / terrainManager.getChunkSize());
      const chunkY = Math.floor(globalPos.z / terrainManager.getChunkSize());
      const centerChunkKey = terrainManager.getChunkKey(chunkX, chunkY);

      // STEP 5: Load ONLY the center chunk first and wait for it to be fully ready
      console.log(`Loading center chunk ${centerChunkKey} with high priority...`);
      // Use the consolidated loadChunk method, passing true for high priority
      const centerChunk = await terrainManager.loadChunk(chunkX, chunkY);

      console.log('Finished loading center chunk attempt, proceeding with raycast check.');

      // STEP 6: Check if center chunk loaded successfully and is ready
      if (centerChunk) {
        // Check if chunk is not null (loadChunk returns null on failure)
        const centerMesh = centerChunk.getMesh();
        // Double-check readiness (though loadChunk should ensure it)
        if (centerMesh && centerChunk.isFullyReady()) {
          console.log(`Center chunk ${centerChunkKey} mesh found and ready. Performing raycast...`);

          // Log bounding info for diagnostics
          const boundingInfo = centerMesh.getBoundingInfo();
          console.log(
            `  Mesh Bounding Box Min (World): ${boundingInfo.boundingBox.minimumWorld.toString()}`
          );
          console.log(
            `  Mesh Bounding Box Max (World): ${boundingInfo.boundingBox.maximumWorld.toString()}`
          );
          console.log(`  Mesh Position (Engine): ${centerMesh.position.toString()}`);

          // Force world matrix computation just in case
          centerMesh.computeWorldMatrix(true);

          // Perform raycast from safe height downwards in engine space
          const rayStart = new Vector3(0, safeHeight, 0); // Ray starts at engine origin high up
          const ray = new Ray(rayStart, Vector3.Down(), safeHeight * 2);

          // Use intersectsMesh for direct check against the loaded chunk mesh
          const hit = ray.intersectsMesh(centerMesh);

          if (hit.hit && hit.pickedPoint) {
            const groundHeight = hit.pickedPoint.y;
            playerMesh.position.y = groundHeight + 2; // Position player slightly above ground
            console.log(
              `Raycast successful using intersectsMesh. Positioned player at engine height ${playerMesh.position.y}`
            );

            // STEP 7: Load surrounding chunks asynchronously AFTER successful placement
            setTimeout(() => {
              if (window.terrainManager) {
                console.log('Loading surrounding chunks asynchronously...');
                // Call the async version which uses the consolidated loadChunk internally
                window.terrainManager.loadSurroundingChunksAsync(chunkX, chunkY);

                // Unlock terrain manager and mark initialized AFTER starting background load
                window.terrainManager.lockForTeleport(false);
                // Mark as initialized - player is placed, background loading started
                window.terrainManager.hasInitialized = true;
                console.log('Terrain Manager unlocked and marked initialized.');
              }
            }, 100); // Small delay before starting background load

            this.updateGlobalMapPosition(globalPos);
            this.savePlayerPosition(globalPos);
            return true; // Successful placement
          } else {
            // Log failure reason
            console.warn(
              `Raycast using intersectsMesh failed to hit center chunk mesh (${centerMesh.name}). Hit result:`,
              hit
            );
            console.log(
              `  Mesh State: isReady=${centerMesh.isReady()}, isPickable=${centerMesh.isPickable}, checkCollisions=${centerMesh.checkCollisions}, vertices=${centerMesh.getTotalVertices()}`
            );
            if (centerMesh.material) {
              console.log(`  Material State: isReady=${centerMesh.material.isReady(centerMesh)}`);
            } else {
              console.log(`  Material State: No material found.`);
            }
            console.log(`  Ray Origin (Engine): ${rayStart.toString()}`);
          }
        } else {
          console.warn(
            `Center chunk ${centerChunkKey} loaded object exists, but mesh is null or chunk not fully ready.`
          );
        }
      } else {
        console.warn(`Center chunk ${centerChunkKey} failed to load (loadChunk returned null).`);
      }

      // If we fall through, placement failed
      console.warn('Using fallback height - center chunk load/raycast failed');
      playerMesh.position.y = 100; // Fallback height in engine space
      // Unlock manager here if placement failed before async load started
      terrainManager.lockForTeleport(false);
      // Don't mark as initialized if placement failed
      terrainManager.hasInitialized = false; // Explicitly set to false on failure

      // Update and save position even if we used fallback height
      this.updateGlobalMapPosition(globalPos);
      this.savePlayerPosition(globalPos);

      // Enable player controls if not initial spawn (even on failure?)
      if (!isInitialSpawn && window.playerController?.enableControls) {
        window.playerController.enableControls();
      }

      return false; // Indicate placement failed
    } catch (error) {
      console.error('Failed to position player on terrain:', error);
      if (terrainManager) {
        terrainManager.lockForTeleport(false); // Ensure unlock on error
        terrainManager.hasInitialized = false; // Ensure not initialized on error
      }
      playerMesh.position.y = 100; // Fallback height
      return false; // Indicate placement failed
    }
  }

  /**
   * Get ordered list of chunks to load based on distance from center
   * Note: This seems unused now, loadSurroundingChunks handles ordering. Keep or remove?
   * Keeping for now in case it's used elsewhere or for reference.
   */
  private getChunkLoadingOrder(centerX: number, centerY: number): Array<{ x: number; y: number }> {
    const chunks: Array<{ x: number; y: number; distance: number }> = [];
    const range = 2; // Load a 5x5 grid of chunks

    // Calculate distances for all chunks in range
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;

        // Skip invalid coordinates
        if (x < 0 || x >= 144 || y < 0 || y >= 72) continue;

        // Calculate distance from center chunk (manhattan distance)
        const distance = Math.abs(dx) + Math.abs(dy);
        chunks.push({ x, y, distance });
      }
    }

    // Sort by distance from center and map to just coordinates
    return chunks.sort((a, b) => a.distance - b.distance).map(({ x, y }) => ({ x, y }));
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

        if (
          parsedData.position &&
          typeof parsedData.position.x === 'number' &&
          typeof parsedData.position.z === 'number'
        ) {
          // New format with timestamp
          x = parsedData.position.x;
          z = parsedData.position.z;
        } else if (typeof parsedData.x === 'number' && typeof parsedData.z === 'number') {
          // Old format
          x = parsedData.x;
          z = parsedData.z;
        } else {
          throw new Error('Invalid saved position format');
        }

        // Validate coordinates are normalized (0-1 range)
        if (isNaN(x) || isNaN(z) || x < 0 || x > 1 || z < 0 || z > 1) {
          console.warn('Invalid saved normalized position coordinates, using defaults');
          localStorage.removeItem('playerGlobalPosition'); // Clear invalid data
          return null;
        }

        // Convert normalized coordinates to virtual world coordinates
        const virtualX = x * WorldManager.WORLD_WIDTH; // Use WIDTH for X
        const virtualZ = z * WorldManager.WORLD_HEIGHT; // Use HEIGHT for Z

        console.log(
          'Loaded saved position:',
          `Normalized: (${x.toFixed(4)}, ${z.toFixed(4)})`,
          `Virtual: (${virtualX.toFixed(2)}, ${virtualZ.toFixed(2)})`
        );

        // Return global position with a default Y (actual Y determined by raycast)
        return new Vector3(virtualX, 100, virtualZ);
      } catch (e) {
        console.warn('Failed to parse saved position, using defaults.', e);
        localStorage.removeItem('playerGlobalPosition'); // Clear invalid data
      }
    }
    console.log('No valid saved position found, using default spawn.');
    return null;
  }

  /**
   * Update global map position (stores normalized 0-1 coordinates)
   */
  public updateGlobalMapPosition(globalPos: Vector3): void {
    // Convert global position to normalized globe coordinates (0-1 range)
    const normalizedX = globalPos.x / WorldManager.WORLD_WIDTH; // Use WIDTH for X
    const normalizedZ = globalPos.z / WorldManager.WORLD_HEIGHT; // Use HEIGHT for Z

    // Ensure values are within 0-1 range
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    const store = usePlayerStore();

    // Store normalized coordinates for global map use
    store.setPlayerGlobalPosition({
      x: clampedX,
      z: clampedZ,
    });

    if (this.debugMode) {
      console.log(
        'Global map position updated:',
        `Normalized: (${clampedX.toFixed(4)}, ${clampedZ.toFixed(4)})`,
        `Global: (${globalPos.x.toFixed(2)}, ${globalPos.z.toFixed(2)})`
      );
    }
  }

  /**
   * Save player position to localStorage (stores normalized 0-1 coordinates)
   */
  private savePlayerPosition(globalPos: Vector3): void {
    const normalizedX = globalPos.x / WorldManager.WORLD_WIDTH; // Use WIDTH for X
    const normalizedZ = globalPos.z / WorldManager.WORLD_HEIGHT; // Use HEIGHT for Z

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
    if (this.debugMode) {
      console.log(`Saved position: Normalized (${clampedX.toFixed(4)}, ${clampedZ.toFixed(4)})`);
    }
  }

  /**
   * Check if player has terrain underneath and adjust height if needed
   * This is more of a safety check during gameplay, not for initial spawning.
   */
  public checkTerrainUnderPlayer(playerMesh: AbstractMesh): void {
    if (!playerMesh || !window.terrainManager || !window.terrainManager.hasInitialized) return;

    // Raycast downward from slightly above the player in engine space
    const rayStart = playerMesh.position.clone();
    rayStart.y += 1.0; // Start just above the player's feet position
    const rayLength = 20.0; // Check a reasonable distance below
    const ray = new Ray(rayStart, Vector3.Down(), rayLength);

    // Only pick terrain chunks
    const predicate = (mesh: AbstractMesh) => mesh.metadata?.isTerrainChunk === true;
    const hit = this.scene.pickWithRay(ray, predicate);

    if (hit && hit.pickedMesh && hit.pickedPoint) {
      const distanceToGround = playerMesh.position.y - hit.pickedPoint.y;

      // If player is significantly above ground (> 3 units) or slightly below (< -0.1 units), adjust.
      if (distanceToGround > 3.0 || distanceToGround < -0.1) {
        console.warn(
          `Player height adjustment needed. Current Y: ${playerMesh.position.y.toFixed(
            2
          )}, Ground Y: ${hit.pickedPoint.y.toFixed(2)}, Distance: ${distanceToGround.toFixed(2)}`
        );
        // Place player a small distance above ground
        playerMesh.position.y = hit.pickedPoint.y + 1.8; // Adjust target height slightly
      }
    } else {
      // No terrain found directly under player within rayLength
      console.warn(`No terrain found under player at ${playerMesh.position.toString()}!`);

      // Optional: Try to force load current chunk as an emergency measure
      // const globalPos = WorldManager.toGlobal(playerMesh.position);
      // const chunkX = Math.floor(globalPos.x / window.terrainManager.getChunkSize());
      // const chunkY = Math.floor(globalPos.z / window.terrainManager.getChunkSize());
      // window.terrainManager.loadPriorityChunk(chunkX, chunkY); // Fire and forget load
    }
  }
}

import {
  Color3,
  Engine,
  Vector3,
  Ray,
  AbstractMesh,
  RayHelper,
  Scene as BabylonScene,
  StandardMaterial,
  MeshBuilder,
} from "@babylonjs/core";
import WorldManager from "@/models/terrain/WorldManager";
import GameScene from "./scene/Scene";
import store from "@/store/store";
import storeVuex from "@/store/vuex";
import Audio from "@/models/sounds/Audio";
import ServerClient from "./ServerClient";
import PlayerSelf from "@/models/playerSelf/Player";
import Player from "@/models/player/Player";
import { v4 as uuidv4 } from "uuid";
import RegisterTagsExtension from "@/models/scene/TagsExtansion";
import Collisions from "@/models/mehanics/Collisions";
import Canvas from "@/models/scene/Canvas";
import Points from "@/models/mehanics/Points";
import DevMode from "@/models/scene/DevMode";
import TerrainChunk from "./terrain/TerrainChunk";
import Savepoint from "@/models/mehanics/Savepoint";
import BlendModes from "@/models/scene/BlendModes";
import Materials from "@/models/scene/Materials";
import OutLiner from "@/models/scene/OutLiner";
import Doors from "@/models/mehanics/Doors";
import Prefabs from "@/models/scene/Prefabs";
import TerrainManager from "@/models/terrain/TerrainManager";
import MiniMap from "@/models/terrain/MiniMap";
import GlobalMap from "@/models/terrain/GlobalMap";

export default class Game {
  private scene!: BabylonScene;
  private positionSaveInterval?: number;
  private debugMode = false;
  init() {
    const playerId = this.getPlayerId();
    const skinColor = Color3.Random();
    store.setPlayerId(playerId);
    store.addPlayer(playerId, skinColor);

    globalThis.assetContainers = [];
    const canvas = Canvas.setCanvas();
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
    });
    const sceneModel = new GameScene(engine);
    this.scene = sceneModel.babylonScene;

    sceneModel.load(async () => {
      new Audio();
      // Initialize environment first to ensure shadowGenerator is created
      sceneModel.setEnvironment();

      // Initialize with saved position if available
      const savedPosition = this.getSavedPosition();
      const spawnPosition = savedPosition || new Vector3(30, 0, 30);

      // Then initialize game classes and characters
      await this.setClassesGame(() => {
        const serverClient = new ServerClient(playerId);
        serverClient.init();

        store.subscribeAddPlayer((playerId: string) => {
          new Player(playerId);
        });
      });

      // Add position sanitizer and diagnostics
      this.setupPositionSanitizer();
      this.setupTerrainUpdates(); // Add terrain updates during movement
      this.logSceneInfo();
    });
  }

  async setClassesGame(callback: any) {
    RegisterTagsExtension();

    new DevMode();
    globalThis.collisions = new Collisions();

    // Initialize terrain system first
    window.terrainManager = new TerrainManager(window.scene!, 71, 3); // Increase render distance to 3

    // Default spawn position at origin
    const spawnPosition = new Vector3(30, 0, 30);

    try {
      // Re-enable terrain manager initialization
      await window.terrainManager.initialize(spawnPosition);

      // Now initialize player after terrain is ready
      PlayerSelf.init(() => {
        this.spawnPlayer(spawnPosition);
        callback();

        Savepoint.init();
        Materials.addCustomMaterial();
        BlendModes.init();
        OutLiner.init();
        new Doors();

        new Points(store.getPlayerId() || "");

        storeVuex.commit("LOADING_TOGGLE");
      });
    } catch (error) {
      console.error("Failed to load initial terrain:", error);
      // Fallback initialization
      PlayerSelf.init(() => {
        callback();
        Savepoint.init();
        Materials.addCustomMaterial();
        BlendModes.init();
        OutLiner.init();
        new Doors();

        new Points(store.getPlayerId() || "");

        storeVuex.commit("LOADING_TOGGLE");
      });
    }

    // Initialize mini map and global map
    window.miniMap = new MiniMap(window.scene!);
    window.globalMap = new GlobalMap(window.scene!);

    new Prefabs(() => {
      //Optimize.setMeshes(globalThis.scene.meshes)
    });
  }

  getPlayerId() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    let playerId = urlParams.get("playerId");

    if (!playerId) {
      playerId = "guest_" + uuidv4();
    }

    return playerId;
  }

  private async spawnPlayer(spawnPosition: Vector3) {
    const playerId = store.getPlayerId();
    const playerMesh = globalThis.scene.getMeshByName("playerFoot_" + playerId);

    if (!playerMesh) {
      console.error("Player mesh not found");
      return;
    }

    // Set loading state
    storeVuex.commit("LOADING_TOGGLE", true);

    // Initialize world coordinate system around spawn position
    WorldManager.initialize(spawnPosition);

    // Convert to engine coordinates (should be near origin)
    const enginePosition = WorldManager.toEngine(spawnPosition);

    // Position player higher above spawn point for reliable raycast
    playerMesh.position.x = enginePosition.x;
    playerMesh.position.z = enginePosition.z;
    playerMesh.position.y = 200; // Start higher but not too high

    console.log(
      "Initial spawn at engine position:",
      playerMesh.position.toString()
    );

    // Wait for terrain to be fully created
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if we can use the terrain manager
    if (window.terrainManager) {
      const virtualPos = WorldManager.toVirtual(playerMesh.position);
      const chunkX = Math.floor(virtualPos.x / window.terrainManager.chunkSize);
      const chunkY = Math.floor(virtualPos.z / window.terrainManager.chunkSize);

      console.log(`Looking for terrain in chunk (${chunkX}, ${chunkY})`);

      // Ensure the spawn chunk is loaded
      if (!window.terrainManager.hasChunk(chunkX, chunkY)) {
        console.log(`Loading spawn chunk: (${chunkX}, ${chunkY})`);
        await window.terrainManager.loadChunk(chunkX, chunkY);
      }
    }

    // Perform simplified raycast to find ground
    await this.performSimplifiedRaycast(playerMesh);

    // Enable physics/controls
    if (window.playerController?.enableControls) {
      window.playerController.enableControls();
    }

    // Clear loading state
    storeVuex.commit("LOADING_TOGGLE", false);

    // Start position persistence
    this.startPositionPersistence();
  }

  private async performSimplifiedRaycast(
    playerMesh: AbstractMesh
  ): Promise<void> {
    // Create multiple rays from different heights
    const rayOrigin = new Vector3(
      playerMesh.position.x,
      500,
      playerMesh.position.z
    );
    const rayDirection = new Vector3(0, -1, 0);
    const rayLength = 1000;

    console.log(
      "Casting ray from:",
      rayOrigin.toString(),
      "with length",
      rayLength
    );

    // Create ray visualization that stays visible longer
    const ray = new Ray(rayOrigin, rayDirection, rayLength);
    const rayHelper = new RayHelper(ray);
    rayHelper.show(this.scene, Color3.Red());
    // Use direct mesh intersection test for better reliability
    const terrainMeshes = this.scene.meshes.filter(
      (mesh) =>
        mesh.name.startsWith("terrain_chunk_") || mesh.name === "flat_terrain"
    );

    const hit = ray.intersectsMeshes(terrainMeshes);

    if (hit && hit.length > 0) {
      console.log(
        `Direct hit on ${
          hit[0].pickedMesh?.name
        } at ${hit[0].pickedPoint?.toString()}`
      );
      playerMesh.position.y = hit[0].pickedPoint!.y + 2;

      // Update global map position
      const virtualPos = WorldManager.toVirtual(hit[0].pickedPoint!);
      this.updateGlobalMapPosition(virtualPos);
    } else {
      // Try to find the closest terrain chunk to stand on
      console.warn("Ray did not hit terrain. Finding closest terrain...");
      const terrainMeshes = this.scene.meshes.filter((mesh) =>
        mesh.name.startsWith("terrain_chunk_")
      );

      if (terrainMeshes.length > 0) {
        // Sort by distance to player
        terrainMeshes.sort(
          (a, b) =>
            Vector3.Distance(
              a.position,
              new Vector3(playerMesh.position.x, 0, playerMesh.position.z)
            ) -
            Vector3.Distance(
              b.position,
              new Vector3(playerMesh.position.x, 0, playerMesh.position.z)
            )
        );

        // Use the closest terrain
        const closestTerrain = terrainMeshes[0];
        console.log(
          `Positioning player on closest terrain: ${closestTerrain.name}`
        );
        playerMesh.position = new Vector3(
          playerMesh.position.x,
          closestTerrain.position.y + 2,
          playerMesh.position.z
        );
      } else {
        // Last resort - create emergency ground
        playerMesh.position.y = 2;
        console.warn("No terrain chunks found. Emergency ground created.");
      }
    }

    // Keep ray visible for debugging
    setTimeout(() => rayHelper.dispose(), 10000);
  }

  private getSavedPosition(): Vector3 | null {
    const saved = localStorage.getItem("playerGlobalPosition");
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
          console.warn("Invalid saved position coordinates, using defaults");
          return null;
        }

        // Convert normalized coordinates to virtual world coordinates
        const virtualX = x * WorldManager.WORLD_WIDTH;
        const virtualZ = z * WorldManager.WORLD_HEIGHT;

        console.log(
          "Loaded saved position:",
          `Normalized: (${x}, ${z})`,
          `Virtual: (${virtualX}, ${virtualZ})`
        );

        return new Vector3(virtualX, 500, virtualZ);
      } catch (e) {
        console.warn("Failed to parse saved position", e);
      }
    }
    return null;
  }

  private startPositionPersistence(): void {
    // Clear existing interval
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
    }

    // Save position and update terrain every 5 seconds
    this.positionSaveInterval = window.setInterval(() => {
      const playerId = store.getPlayerId();
      const playerMesh = globalThis.scene.getMeshByName(
        "playerFoot_" + playerId
      );

      if (playerMesh) {
        // Get virtual position for persistence
        const virtualPos = WorldManager.toVirtual(playerMesh.position);
        this.updateGlobalMapPosition(virtualPos);

        // Update terrain chunks based on player position
        if (window.terrainManager) {
          window.terrainManager.updateChunks(playerMesh.position);
        }

        // Check if world needs to be shifted to maintain precision
        if (WorldManager.updateOrigin(playerMesh.position)) {
          console.log(
            "World origin shifted, player reset to:",
            playerMesh.position.toString()
          );
        }
      }
    }, 5000);
  }

  private updateGlobalMapPosition(virtualPos: Vector3): void {
    // Convert virtual position to normalized globe coordinates (0-1 range)
    const normalizedX = virtualPos.x / WorldManager.WORLD_WIDTH;
    const normalizedZ = virtualPos.z / WorldManager.WORLD_HEIGHT;

    // Ensure values are within 0-1 range
    const clampedX = Math.max(0, Math.min(1, normalizedX));
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    // Store normalized coordinates for global map use
    store.setPlayerGlobalPosition({
      x: clampedX,
      z: clampedZ,
    });

    if (window.store?.debug) {
      console.log(
        "Global map position:",
        `Normalized: (${clampedX.toFixed(4)}, ${clampedZ.toFixed(4)})`,
        `Virtual: (${virtualPos.x.toFixed(2)}, ${virtualPos.z.toFixed(2)})`
      );
    }
  }

  private setupPositionSanitizer(): void {
    // Check for non-finite positions in all critical components
    this.scene.onBeforeRenderObservable.add(() => {
      // Check player position
      const playerId = store.getPlayerId();
      const playerMesh = this.scene.getMeshByName("playerFoot_" + playerId);

      if (playerMesh) {
        // Fix any non-finite values
        if (
          !isFinite(playerMesh.position.x) ||
          !isFinite(playerMesh.position.y) ||
          !isFinite(playerMesh.position.z)
        ) {
          console.warn("Fixed non-finite player position");

          playerMesh.position.x = isFinite(playerMesh.position.x)
            ? playerMesh.position.x
            : 0;
          playerMesh.position.y = isFinite(playerMesh.position.y)
            ? playerMesh.position.y
            : 50;
          playerMesh.position.z = isFinite(playerMesh.position.z)
            ? playerMesh.position.z
            : 0;
        }
      }

      // Also check camera
      if (this.scene.activeCamera) {
        const camera = this.scene.activeCamera;
        if (
          !isFinite(camera.position.x) ||
          !isFinite(camera.position.y) ||
          !isFinite(camera.position.z)
        ) {
          console.warn("Fixed non-finite camera position");
          camera.position = new Vector3(
            isFinite(camera.position.x) ? camera.position.x : 0,
            isFinite(camera.position.y) ? camera.position.y : 50,
            isFinite(camera.position.z) ? camera.position.z : 0
          );
        }
      }
    });
  }

  private setupTerrainUpdates(): void {
    // Setup more frequent terrain updates during player movement
    let lastPosition = Vector3.Zero();
    let movementTimeout: number | null = null;

    this.scene.onBeforeRenderObservable.add(() => {
      const playerId = store.getPlayerId();
      const playerMesh = this.scene.getMeshByName("playerFoot_" + playerId);

      if (playerMesh) {
        // Check if player has moved significantly
        if (Vector3.Distance(playerMesh.position, lastPosition) > 5) {
          // Player has moved, update last position
          lastPosition = playerMesh.position.clone();

          // Update terrain immediately
          if (window.terrainManager) {
            window.terrainManager.updateChunks(playerMesh.position);
          }

          // Clear existing timeout
          if (movementTimeout !== null) {
            clearTimeout(movementTimeout);
          }

          // Set timeout to update terrain after movement stops
          movementTimeout = window.setTimeout(() => {
            if (window.terrainManager) {
              window.terrainManager.updateChunks(playerMesh.position);
            }
            movementTimeout = null;
          }, 500);
        }
      }
    });
  }

  private logSceneInfo(): void {
    // Log scene info less frequently and only when debug is enabled
    setInterval(() => {
      if (!this.debugMode) return;

      const playerId = store.getPlayerId();
      const playerMesh = this.scene.getMeshByName("playerFoot_" + playerId);

      if (playerMesh) {
        console.log("Player position:", playerMesh.position.toString());

        // Simplified terrain chunk logging
        const terrainMeshes = this.scene.meshes.filter((m) =>
          m.name.startsWith("terrain_chunk_")
        );

        console.log(`Active terrain chunks: ${terrainMeshes.length}`);
      }
    }, 10000); // Change to 10 seconds
  }

  public cleanup(): void {
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = undefined;
    }
  }
}

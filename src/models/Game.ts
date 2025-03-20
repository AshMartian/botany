import {
  Color3,
  Engine,
  Vector3,
  Ray,
  AbstractMesh,
  RayHelper,
  Scene as BabylonScene,
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
    });
  }

  async setClassesGame(callback: any) {
    RegisterTagsExtension();

    new DevMode();
    globalThis.collisions = new Collisions();

    // Initialize terrain system first
    window.terrainManager = new TerrainManager(window.scene!);

    // Default spawn position at origin
    const spawnPosition = new Vector3(30, 0, 30);

    try {
      // Wait for initial chunks around spawn point
      await window.terrainManager.initialize();

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

    // Position player at engine coordinates
    playerMesh.position.copyFrom(enginePosition);
    playerMesh.position.y = 10000; // Start much higher for reliable raycast

    console.log("Initial spawn at engine position:", enginePosition.toString());
    console.log("Virtual position:", spawnPosition.toString());

    // Debug position conversion
    WorldManager.debugPositionConversion(enginePosition);
    
    // Log chunk coordinates for debugging
    if (window.terrainManager) {
      const spawnChunk = WorldManager.getChunkCoordinates(
        WorldManager.toVirtual(enginePosition),
        window.terrainManager.chunkSize || 71
      );
      console.log("Spawn chunk coordinates:", spawnChunk);
      console.log("Active terrain chunks:", window.terrainManager.getActiveChunkCoordinates());
    }

    // Let engine settle before raycasting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Validate terrain manager
    if (!window.terrainManager) {
      console.error("TerrainManager not initialized!");
      playerMesh.position.y = 50; // Fallback height
      return;
    }

    // Force load chunks at spawn point first
    const spawnChunk = WorldManager.getChunkCoordinates(
      WorldManager.toVirtual(enginePosition),
      window.terrainManager.chunkSize || 71
    );
    console.log("Loading spawn chunk:", spawnChunk);
    await window.terrainManager.loadChunk(spawnChunk.x, spawnChunk.y);

    // Wait for chunk to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Perform precision raycast to find ground
    await this.performPrecisionRaycast(playerMesh);

    // Enable physics/controls
    if (window.playerController?.enableControls) {
      window.playerController.enableControls();
    }

    // Clear loading state
    storeVuex.commit("LOADING_TOGGLE", false);

    // Start position persistence
    this.startPositionPersistence();
  }

  private async performPrecisionRaycast(
    playerMesh: AbstractMesh
  ): Promise<void> {
    // Create ray starting from player position
    const rayOrigin = playerMesh.position.clone();
    rayOrigin.y = 10000; // Start high above terrain

    const rayLength = 12000;
    const ray = new Ray(rayOrigin, Vector3.Down(), rayLength);

    // Add ray visualization for debugging
    const rayHelper = new RayHelper(ray);
    rayHelper.show(this.scene, Color3.Red()); // Visualize the ray

    // Add debug logging for ray position and chunks
    console.log("Ray origin (engine):", rayOrigin.toString());
    console.log("Ray direction:", ray.direction.toString());
    console.log(
      "Active terrain chunks:",
      window.terrainManager
        ?.getActiveChunkCoordinates()
        .map((c) => `${c.x},${c.y}`)
    );

    // Ensure terrain is loaded at player position before raycasting
    if (window.terrainManager?.updateChunks) {
      window.terrainManager.updateChunks(
        new Vector3(rayOrigin.x, 0, rayOrigin.z)
      );
      // Wait longer for chunks to load
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Try multiple times with a more robust search pattern
    let hit = null;
    let attempts = 0;
    const maxAttempts = 40; // Increased attempts for better reliability
    const searchRadius = 100; // Meters around initial position

    while (attempts < maxAttempts && !hit?.pickedPoint) {
      // Get virtual position for chunk readiness check
      const virtualPos = WorldManager.toVirtual(ray.origin);

      // Only cast ray if chunk is confirmed ready
      if (
        window.terrainManager?.isChunkReady(
          Math.floor(virtualPos.x / (window.terrainManager.chunkSize || 71)),
          Math.floor(virtualPos.z / (window.terrainManager.chunkSize || 71))
        )
      ) {
        hit = globalThis.scene.pickWithRay(ray, undefined, false);

        if (hit?.pickedPoint) {
          // Found ground - position player slightly above it
          playerMesh.position.y = hit.pickedPoint.y + 20;

          // Update global map position
          const virtualPos = WorldManager.toVirtual(hit.pickedPoint);
          this.updateGlobalMapPosition(virtualPos);

          console.log("Found ground at height:", hit.pickedPoint.y);

          // Dispose ray helper after successful hit
          rayHelper.dispose();
          return;
        }
      }

      // Expand search in spiral pattern for better coverage
      const angle = (attempts * Math.PI) / 2;
      const distance = searchRadius * (Math.floor(attempts / 8) + 1); // Expand slower
      ray.origin.x = rayOrigin.x + Math.cos(angle) * distance;
      ray.origin.z = rayOrigin.z + Math.sin(angle) * distance;

      // Update ray helper to show new position
      // rayHelper.show(this.scene, BABYLON.GLTF2.Col.Red());

      // Wait longer for chunks to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Force terrain update at this position with higher priority
      if (window.terrainManager?.updateChunks) {
        window.terrainManager.updateChunks(
          new Vector3(ray.origin.x, 0, ray.origin.z)
        );
      }

      attempts++;
    }

    console.warn(
      "Terrain not found after multiple attempts, checking for fallbacks"
    );

    // Check all terrain meshes manually as fallback
    const terrainMeshes = this.scene.meshes.filter(
      (m: AbstractMesh) => m.name.startsWith("terrain_chunk_") && m.isEnabled()
    );

    if (terrainMeshes.length > 0) {
      console.warn("Raycast failed but terrain exists. Checking all meshes...");
      const groundY = Math.max(
        ...terrainMeshes.map((m: AbstractMesh) => m.position.y)
      );
      playerMesh.position.y = groundY + 200;
    } else {
      // Last resort fallback
      playerMesh.position.y = 500;
    }

    // Dispose ray helper
    rayHelper.dispose();

    // Request terrain chunks in a wider area as a last resort
    if (window.terrainManager?.updateChunks) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const pos = new Vector3(
            playerMesh.position.x + dx * 100,
            0,
            playerMesh.position.z + dz * 100
          );
          window.terrainManager.updateChunks(pos);
        }
      }
    }
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

    // Save position every 5 seconds
    this.positionSaveInterval = window.setInterval(() => {
      const playerId = store.getPlayerId();
      const playerMesh = globalThis.scene.getMeshByName(
        "playerFoot_" + playerId
      );
      if (playerMesh) {
        // Get virtual position for persistence
        const virtualPos = WorldManager.toVirtual(playerMesh.position);
        this.updateGlobalMapPosition(virtualPos);

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

  public cleanup(): void {
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = undefined;
    }
  }
}

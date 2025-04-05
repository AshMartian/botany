import {
  Color3,
  Engine,
  Vector3,
  Scene as BabylonScene,
  CannonJSPlugin,
  Quaternion,
  AbstractMesh, // Added AbstractMesh
  Mesh, // Added Mesh for instanceof check
  AssetContainer, // Added AssetContainer
} from '@babylonjs/core'; // Added Quaternion
import { usePlayerStore } from '@/stores/playerStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useBuildingStore } from '@/stores/buildingStore'; // <-- ADD THIS IMPORT
import PlayerSpawner from '@/models/playerOnline/PlayerSpawner';
import SharedPlayerState from '@/models/playerOnline/SharedPlayerState';
import WorldManager from '@/models/terrain/WorldManager';
import GameScene from './scene/Scene';
import Audio from '@/models/sounds/Audio';
// import ServerClient from './ServerClient';
import PlayerSelf from '@/models/playerSelf/Player';
// import Player from '@/models/player/Player';
import { v4 as uuidv4 } from 'uuid';
import RegisterTagsExtension from '@/models/scene/TagsExtansion';
import Collisions from '@/models/mehanics/Collisions';
import Canvas from '@/models/scene/Canvas';
import DevMode from '@/models/scene/DevMode';
import BlendModes from '@/models/scene/BlendModes';
import Materials from '@/models/scene/Materials';
import OutLiner from '@/models/scene/OutLiner';
import Doors from '@/models/mehanics/Doors';
import Prefabs from '@/models/scene/Prefabs';
import TerrainManager from '@/models/terrain/TerrainManager';
import MiniMap from '@/models/terrain/MiniMap';
import GlobalMap from '@/models/terrain/GlobalMap';
import BuildingPlacementService from '@/services/BuildingPlacementService'; // <-- ADD THIS IMPORT
import { PlacedBuildingData } from '@/stores/buildingStore'; // Import the type
// Import our new services
import crosshairService from '@/services/CrosshairService';
import regolithCollector from '@/services/RegolithCollector';
import * as CANNON from 'cannon';

window.CANNON = CANNON;

import { watch, WatchStopHandle } from 'vue'; // <-- Import watch and WatchStopHandle
// Add this outside the class for HMR access
let currentGameInstance: Game | null = null;

export default class Game {
  private scene: BabylonScene | undefined; // Allow undefined for cleanup
  private engine: Engine | undefined; // Allow undefined for cleanup
  private positionSaveInterval?: number;
  private playerSpawner!: PlayerSpawner;
  private debugMode = false;
  private debugVerboseLogging = false;
  private lastEngineDistanceCheckTime = 0;
  private buildingPlacementService: BuildingPlacementService | null = null; // <-- ADD THIS
  private buildingWatcher: WatchStopHandle | null = null; // <-- ADD THIS for watcher cleanup
  private debugKeyListener: ((e: KeyboardEvent) => void) | null = null;

  init() {
    // Apply safety patch to collision system
    // safetyPatchCollisionSystem();
    const store = usePlayerStore();

    const playerId = this.getPlayerId();
    const skinColor = Color3.Random();
    store.setPlayerId(playerId);
    store.addPlayer(playerId, skinColor);

    // --- Initialize Inventory and Building Stores ---
    const inventoryStore = useInventoryStore();
    inventoryStore.initializeInventory(playerId);

    const buildingStore = useBuildingStore(); // <-- GET BUILDING STORE INSTANCE
    buildingStore.initializeBuildingStore(); // <-- INITIALIZE IT (loads from DB)
    // --- End Store Initialization ---

    globalThis.assetContainers = [];
    const canvas = Canvas.setCanvas();
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
    });
    this.engine = engine;
    const sceneModel = new GameScene(engine);
    this.scene = sceneModel.babylonScene;

    // Ensure physics is enabled with proper gravity BEFORE any entities are created
    if (!this.scene.getPhysicsEngine()) {
      console.log('Initializing physics engine in Game.ts');
      this.scene.enablePhysics(new Vector3(0, -9.81, 0), new CannonJSPlugin());
    }

    // Create player spawner
    this.playerSpawner = new PlayerSpawner(this.scene, this.debugMode);

    // Setup debug keys for emergency recovery
    this.setupDebugKeys();

    // Make game instance available globally with teleport method
    window.game = {
      teleportToVirtualPosition: (position: Vector3) =>
        this.playerSpawner.teleportToVirtualPosition(position),
      cleanup: () => this.cleanup(),
    };

    sceneModel.load(async () => {
      // Initialize shared player state
      const playerState = SharedPlayerState.getInstance();
      playerState.setScene(this.scene!); // Use non-null assertion here as scene is set above
      new Audio();
      // Initialize environment first to ensure shadowGenerator is created
      sceneModel.setEnvironment();

      // Get saved position or use default
      const savedPosition = this.playerSpawner.getSavedPosition();
      const spawnPosition = savedPosition || new Vector3(30, 0, 30);

      await this.initializeGameComponents(spawnPosition, async () => {
        // --- Spawn Placed Buildings ---
        // This needs to happen *after* prefabs/assets might be loaded
        // and the scene is ready. Placing it here or in initializeGameComponents
        // might be suitable depending on asset loading strategy.
        await this.spawnPlacedBuildings(); // Make async and await
        // --- End Spawn ---
      });

      // Add position sanitizer and terrain validation
      this.startPositionPersistence();

      // Add regular terrain update check
      this.scene!.registerBeforeRender(() => {
        // Get current player position for terrain updates
        const store = usePlayerStore();
        if (!store.selfPlayerId) return;

        const playerMesh = this.scene!.getMeshByName('playerFoot_' + store.selfPlayerId);
        if (playerMesh && window.terrainManager) {
          // Update terrain chunks based on current player position
          window.terrainManager.updateChunks(playerMesh.position);
        }
      });
    });

    // Make this instance accessible for HMR cleanup
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentGameInstance = this;
  }

  async initializeGameComponents(spawnPosition: Vector3, callback: any) {
    if (!window.scene) {
      console.error('Scene not initialized');
      return;
    }

    RegisterTagsExtension();
    Prefabs.initialize(window.scene); // <-- INITIALIZE PREFABS
    new DevMode();
    globalThis.collisions = new Collisions();

    // Initialize terrain system first
    window.terrainManager = new TerrainManager(window.scene, 128, 4);

    console.log(
      'Using position for spawn:',
      spawnPosition !== new Vector3(30, 0, 30) ? 'Saved position' : 'Default position',
      spawnPosition.toString()
    );

    try {
      // Initialize terrain system first
      await window.terrainManager.initialize(spawnPosition);

      // Now initialize player after terrain is ready
      await new Promise<void>((resolve) => {
        PlayerSelf.init(async () => {
          // Use the player spawner to spawn the player
          await this.playerSpawner.spawnPlayer(spawnPosition);

          // Set up player shadows after player is fully loaded
          if (globalThis.environment) {
            globalThis.environment.setupPlayerShadows();
          }

          // Wait a frame to ensure all meshes are properly initialized
          this.scene?.executeWhenReady(async () => {
            // Added optional chaining
            // Initialize our crosshair system after player is loaded
            console.log('Initializing crosshair and regolith collection systems');
            try {
              await crosshairService.init();
              crosshairService.registerInteractionHandler(regolithCollector);
              console.log('Successfully initialized crosshair service');
            } catch (error) {
              console.error('Failed to initialize crosshair service:', error);
            }

            // --- Initialize Building Placement Service ---
            // --- VERIFIED: Initialized after scene is ready ---
            this.buildingPlacementService = new BuildingPlacementService(this.scene!); // Pass scene
            // --- End Initialization ---

            await callback(); // Call the callback which now includes spawnPlacedBuildings (make sure it's awaited)
            Materials.addCustomMaterial();
            BlendModes.init();
            OutLiner.init();

            // --- Setup Watcher for New Buildings ---
            // --- VERIFIED: Watcher logic seems correct ---
            const buildingStore = useBuildingStore();
            this.buildingWatcher = watch(
              () => [...buildingStore.placedBuildings], // Watch a copy to detect additions
              (newBuildings, oldBuildings) => {
                if (!oldBuildings) return; // Initial load case handled by spawnPlacedBuildings

                const newlyAdded = newBuildings.filter(
                  (newB) => !oldBuildings.some((oldB) => oldB.id === newB.id)
                );

                if (newlyAdded.length > 0) {
                  console.log(`[Watcher] Detected ${newlyAdded.length} new buildings to spawn.`);
                  newlyAdded.forEach((buildingData) => {
                    this.spawnSingleBuilding(buildingData); // Spawn each new building
                  });
                }
              }
            );
            new Doors();
            resolve();
          });
        });
      });
    } catch (error) {
      console.error('Failed to load initial terrain:', error);
      // Fallback initialization without terrain
      await new Promise<void>((resolve) => {
        PlayerSelf.init(async () => {
          await callback(); // Call the callback even on fallback (make sure it's awaited)
          Materials.addCustomMaterial();
          BlendModes.init();
          OutLiner.init();
          new Doors();
          resolve();
        });
      });
    }

    // Initialize mini map and global map after everything else
    if (window.scene) {
      window.miniMap = new MiniMap(window.scene);
      window.globalMap = new GlobalMap(window.scene);
    }

    // new Prefabs(() => { // Legacy constructor call removed
    //   //Optimize.setMeshes(globalThis.scene.meshes)
    // });
  }

  getPlayerId() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    let playerId = urlParams.get('playerId');

    if (!playerId) {
      playerId = 'guest_' + uuidv4();
    }

    return playerId;
  }

  private startPositionPersistence(): void {
    // Clear existing interval
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
    }

    // Save position every 5 seconds
    this.positionSaveInterval = window.setInterval(() => {
      const store = usePlayerStore();
      if (!store.selfPlayerId) return;
      const playerMesh = globalThis.scene?.getMeshByName('playerFoot_' + store.selfPlayerId); // Added optional chaining for safety during cleanup

      if (playerMesh) {
        // Save the virtual position only
        const virtualPos = WorldManager.toGlobal(playerMesh.position);
        this.playerSpawner.updateGlobalMapPosition(virtualPos);
      }
    }, 5000);
  }

  // --- ADD METHOD TO SPAWN SAVED BUILDINGS ---
  private async spawnPlacedBuildings(): Promise<void> {
    // Make async
    if (!this.scene) {
      console.error('Cannot spawn buildings, scene not ready.');
      return;
    }
    const buildingStore = useBuildingStore();
    const buildingsToSpawn = buildingStore.placedBuildings;

    console.log(`Attempting to spawn ${buildingsToSpawn.length} saved buildings...`);
    // Use Promise.all to wait for all initial buildings to attempt spawning
    await Promise.all(
      buildingsToSpawn.map((buildingData) => this.spawnSingleBuilding(buildingData))
    );
    console.log('Finished initial spawning of placed buildings.');
  }

  /**
   * Spawns a single building mesh based on its data.
   * Reusable for initial load and dynamic placement.
   * @param buildingData The data of the building to spawn.
   */
  private async spawnSingleBuilding(buildingData: PlacedBuildingData): Promise<void> {
    const buildingStore = useBuildingStore(); // Get store instance inside method
    console.log(
      `  - Spawning: ${buildingData.blueprintId} (ID: ${buildingData.id}) at ${JSON.stringify(buildingData.position)}`
    );

    // --- Find the blueprint definition ---
    const blueprint = buildingStore.availableBlueprints.find(
      (bp) => bp.id === buildingData.blueprintId
    );
    if (!blueprint) {
      console.warn(
        `  - Could not find blueprint definition for ${buildingData.blueprintId}. Skipping.`
      );
      return; // Skip this building
    }

    // --- Use Prefabs service to load and instantiate ---
    try {
      const container = await Prefabs.loadAssetContainer(blueprint.prefabPath); // Use the static method
      if (!container) {
        console.warn(`  - Prefab asset container not loaded: ${blueprint.prefabPath}`);
        return;
      }

      // Instantiate the mesh into the scene
      const instanceResult = container.instantiateModelsToScene(
        (name) => `placed_${buildingData.id}_${name}`, // Unique name for the instance
        false, // Don't clone materials unless needed
        { doNotInstantiate: false }
      );

      const instanceRoot = instanceResult?.rootNodes?.[0] as AbstractMesh; // Get the root node
      if (!instanceRoot) {
        console.warn(`  - Failed to instantiate prefab: ${blueprint.prefabPath}`);
        return;
      }

      // Set position and rotation from saved data
      instanceRoot.position = new Vector3(
        buildingData.position.x,
        buildingData.position.y,
        buildingData.position.z
      );
      // Ensure rotationQuaternion is initialized
      if (!instanceRoot.rotationQuaternion) {
        instanceRoot.rotationQuaternion = Quaternion.Identity();
      }
      instanceRoot.rotationQuaternion.copyFromFloats(
        buildingData.rotation.x,
        buildingData.rotation.y,
        buildingData.rotation.z,
        buildingData.rotation.w
      );

      // Add necessary components/scripts (collision, interaction, etc.)
      instanceRoot.checkCollisions = true; // Example: Enable collisions
      instanceRoot.metadata = {
        buildingId: buildingData.id,
        type: 'placedBuilding',
        blueprintId: buildingData.blueprintId,
      }; // Example metadata
      instanceRoot.setEnabled(true);

      // Add collision meshes to the global collision system
      // Ensure the root node itself is included if it has geometry/collision shape
      const meshesForCollision = instanceRoot.getChildMeshes(true); // Get all descendants
      if (instanceRoot instanceof Mesh && instanceRoot.geometry) {
        // <-- Check if root is Mesh and has geometry
        meshesForCollision.push(instanceRoot);
      }
      // --- VERIFIED: Collision appending logic ---
      globalThis.collisions?.appendCollisionByMeshes(meshesForCollision);

      console.log(`  - Successfully spawned: ${buildingData.id} (${blueprint.name})`);
    } catch (error) {
      console.error(`  - Error spawning building ${buildingData.id} (${blueprint.name}):`, error);
    }
  }
  // --- END SPAWN METHOD ---

  public cleanup(): void {
    console.log('🧹 Cleaning up game instance for HMR...');

    // 1. Clear intervals
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = undefined;
      console.log('   - Cleared position save interval');
    }

    // 2. Remove event listeners
    if (this.debugKeyListener) {
      window.removeEventListener('keydown', this.debugKeyListener);
      this.debugKeyListener = null;
      console.log('   - Removed debug key listener');
    }

    // --- Stop Building Watcher ---
    if (this.buildingWatcher) {
      this.buildingWatcher(); // Call the stop handle
      this.buildingWatcher = null;
      console.log('   - Stopped building watcher');
    }
    // Add removal for any other global listeners added by Game or its components

    // 3. Dispose Babylon Scene
    if (this.scene) {
      try {
        // Stop rendering loop associated with this scene
        this.engine?.stopRenderLoop(); // Ensure render loop tied to this engine/scene stops
        this.scene.dispose();
        crosshairService.dispose(); // Dispose crosshair service
        console.log('   - Disposed Babylon Scene');
      } catch (error) {
        console.error('   - Error disposing scene:', error);
      }
      this.scene = undefined; // Help GC
      // globalThis.scene = undefined; // Reset global - Be careful if other parts rely on this staying briefly
    }

    // 4. Dispose Babylon Engine
    if (this.engine) {
      try {
        this.engine.dispose();
        console.log('   - Disposed Babylon Engine');
      } catch (error) {
        console.error('   - Error disposing engine:', error);
      }
      this.engine = undefined; // Help GC
    }

    // 5. Clean up other components and globals (add dispose methods if they exist)
    // if (window.terrainManager?.dispose) window.terrainManager.dispose(); // Example
    window.terrainManager?.clearAllChunks();

    // --- Dispose Building Placement Service ---
    this.buildingPlacementService?.dispose();
    this.buildingPlacementService = null;
    console.log('   - Disposed Building Placement Service');
    // --- End Dispose ---
    window.terrainManager = undefined;
    window.miniMap = undefined; // Assuming MiniMap doesn't need explicit dispose
    window.globalMap = undefined; // Assuming GlobalMap doesn't need explicit dispose
    // globalThis.collisions = undefined; // Assuming Collisions doesn't need explicit dispose
    globalThis.environment = undefined; // If environment setup needs cleanup
    globalThis.assetContainers = []; // Reset asset containers
    window.game = undefined; // Remove global game reference

    // 6. Clear the HMR instance reference
    currentGameInstance = null;
    console.log('🧹 Game cleanup complete.');
  }

  /**
   * Setup debug keyboard shortcuts for emergency recovery
   */
  private setupDebugKeys(): void {
    // Define the listener function
    this.debugKeyListener = (e: KeyboardEvent) => {
      // Assign to this.debugKeyListener
      // Only in development
      if (import.meta.env.NODE_ENV !== 'production') {
        // Alt+R: Reset terrain system (emergency recovery)
        if (e.key === 'r' && e.altKey) {
          console.warn('🚨 EMERGENCY TERRAIN RESET 🚨');
          if (window.terrainManager) {
            window.terrainManager.clearAllChunks();

            const store = usePlayerStore();

            const playerMesh = this.scene?.getMeshByName('playerFoot_' + store.selfPlayerId); // Added optional chaining

            if (playerMesh) {
              const globalPos = WorldManager.toVirtual(playerMesh.position);
              setTimeout(() => {
                window.terrainManager?.initialize(globalPos); // Added optional chaining
              }, 500);
            }
          }
        }

        // Alt+D: Toggle debug information
        if (e.key === 'd' && e.altKey) {
          if (window.terrainManager) {
            const status = window.terrainManager.debugStatus();
            console.log('🔍 TERRAIN DEBUG:', status);
          }
        }

        // Alt+L: Toggle verbose logging
        if (e.key === 'l' && e.altKey) {
          if (window.terrainManager) {
            this.debugVerboseLogging = !this.debugVerboseLogging;
            window.terrainManager.setDebugVerbose(this.debugVerboseLogging);
          }
        }

        // Alt+B: Show world boundaries
        if (e.key === 'b' && e.altKey) {
          console.log('Showing world boundaries');
          if (window.terrainManager) {
            // Create physical boundary barriers
            if (typeof window.terrainManager.createWorldBoundaries === 'function') {
              window.terrainManager.createWorldBoundaries();
            }
            // Show visual boundary lines
            if (typeof window.terrainManager.showWorldBoundaries === 'function') {
              window.terrainManager.showWorldBoundaries();
            }
          }
        }
      }
    }; // End of listener function definition

    // Add the listener using the stored reference
    if (this.debugKeyListener) {
      // Check if listener is defined before adding
      window.addEventListener('keydown', this.debugKeyListener); // Use the stored listener
    }
  }
}

// Add Vite HMR hook (outside the class)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Dispose triggered for Game.ts');
    if (currentGameInstance) {
      currentGameInstance.cleanup();
    } else {
      console.warn('[HMR] No current game instance found to clean up.');
    }
  });
}

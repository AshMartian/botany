import { Color3, Engine, Vector3, Scene as BabylonScene, CannonJSPlugin } from '@babylonjs/core';
import { usePlayerStore } from '@/stores/playerStore';
import { useInventoryStore } from '@/stores/inventoryStore';
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
// Import our new services
import crosshairService from '@/services/CrosshairService';
import regolithCollector from '@/services/RegolithCollector';
import * as CANNON from 'cannon';

window.CANNON = CANNON;

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
  private debugKeyListener: ((e: KeyboardEvent) => void) | null = null;

  init() {
    // Apply safety patch to collision system
    // safetyPatchCollisionSystem();
    const store = usePlayerStore();

    const playerId = this.getPlayerId();
    const skinColor = Color3.Random();
    store.setPlayerId(playerId);
    store.addPlayer(playerId, skinColor);

    const inventoryStore = useInventoryStore();
    inventoryStore.initializeInventory(playerId);

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

      // Then initialize game classes and characters
      // await this.initializeGameComponents(spawnPosition, () => {
      // const serverClient = new ServerClient(playerId);
      // serverClient.init();

      // store.ad((playerId: string) => {
      //   new Player(playerId);
      // });
      // });

      this.initializeGameComponents(spawnPosition, () => {
        // Nothing for now
      });

      // Add position sanitizer and terrain validation
      this.startPositionPersistence();
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

            callback();
            Materials.addCustomMaterial();
            BlendModes.init();
            OutLiner.init();
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
          callback();
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

    new Prefabs(() => {
      //Optimize.setMeshes(globalThis.scene.meshes)
    });
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
    // Add removal for any other global listeners added by Game or its components

    // 3. Dispose Babylon Scene
    if (this.scene) {
      try {
        // Stop rendering loop associated with this scene
        this.engine?.stopRenderLoop(); // Ensure render loop tied to this engine/scene stops
        this.scene.dispose();
        console.log('   - Disposed Babylon Scene');
      } catch (error) {
        console.error('   - Error disposing scene:', error);
      }
      this.scene = undefined; // Help GC - Removed @ts-ignore
      // globalThis.scene = undefined; // Reset global
    }

    // 4. Dispose Babylon Engine
    if (this.engine) {
      try {
        this.engine.dispose();
        console.log('   - Disposed Babylon Engine');
      } catch (error) {
        console.error('   - Error disposing engine:', error);
      }
      this.engine = undefined; // Help GC - Removed @ts-ignore
    }

    // 5. Clean up other components and globals (add dispose methods if they exist)
    // if (window.terrainManager?.dispose) window.terrainManager.dispose(); // Example
    window.terrainManager = undefined;
    window.miniMap = undefined; // Assuming MiniMap doesn't need explicit dispose
    window.globalMap = undefined; // Assuming GlobalMap doesn't need explicit dispose
    // globalThis.collisions = undefined;
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

import { Color3, Engine, Vector3, Scene as BabylonScene } from '@babylonjs/core';
import PlayerSpawner from '@/models/player/PlayerSpawner';
import SharedPlayerState from '@/models/player/SharedPlayerState';
import WorldManager from '@/models/terrain/WorldManager';
import GameScene from './scene/Scene';
import store from '@/store/store';
import storeVuex from '@/store/vuex';
import Audio from '@/models/sounds/Audio';
import ServerClient from './ServerClient';
import PlayerSelf from '@/models/playerSelf/Player';
import Player from '@/models/player/Player';
import { v4 as uuidv4 } from 'uuid';
import RegisterTagsExtension from '@/models/scene/TagsExtansion';
import Collisions from '@/models/mehanics/Collisions';
import Canvas from '@/models/scene/Canvas';
import Points from '@/models/mehanics/Points';
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

export default class Game {
  private scene!: BabylonScene;
  private positionSaveInterval?: number;
  private playerSpawner!: PlayerSpawner;
  private debugMode = false;
  private debugVerboseLogging = false;
  private lastEngineDistanceCheckTime = 0;

  init() {
    // Apply safety patch to collision system
    // safetyPatchCollisionSystem();

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
      playerState.setScene(this.scene);
      new Audio();
      // Initialize environment first to ensure shadowGenerator is created
      sceneModel.setEnvironment();

      // Get saved position or use default
      const savedPosition = this.playerSpawner.getSavedPosition();
      const spawnPosition = savedPosition || new Vector3(30, 0, 30);

      // Then initialize game classes and characters
      await this.initializeGameComponents(spawnPosition, () => {
        const serverClient = new ServerClient(playerId);
        serverClient.init();

        store.subscribeAddPlayer((playerId: string) => {
          new Player(playerId);
        });
      });

      // Add position sanitizer and terrain validation
      this.startPositionPersistence();
    });
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
      await storeVuex.dispatch('inventory/initializeInventory');

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
          this.scene.executeWhenReady(async () => {
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
            new Points(store.getPlayerId() || '');
            storeVuex.commit('LOADING_TOGGLE');
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
          new Points(store.getPlayerId() || '');
          storeVuex.commit('LOADING_TOGGLE');
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
      const playerId = store.getPlayerId();
      const playerMesh = globalThis.scene.getMeshByName('playerFoot_' + playerId);

      if (playerMesh) {
        // Save the virtual position only
        const virtualPos = WorldManager.toGlobal(playerMesh.position);
        this.playerSpawner.updateGlobalMapPosition(virtualPos);
      }
    }, 5000);
  }

  public cleanup(): void {
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = undefined;
    }
  }

  /**
   * Setup debug keyboard shortcuts for emergency recovery
   */
  private setupDebugKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Only in development
      if (import.meta.env.NODE_ENV !== 'production') {
        // Alt+R: Reset terrain system (emergency recovery)
        if (e.key === 'r' && e.altKey) {
          console.warn('🚨 EMERGENCY TERRAIN RESET 🚨');
          if (window.terrainManager) {
            window.terrainManager.clearAllChunks();

            // Get current player position
            const playerId = store.getPlayerId();
            const playerMesh = this.scene.getMeshByName('playerFoot_' + playerId);

            if (playerMesh) {
              const globalPos = WorldManager.toVirtual(playerMesh.position);
              setTimeout(() => {
                window.terrainManager?.initialize(globalPos);
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
    });
  }
}

import { Color3, Engine, Vector3, Scene as BabylonScene } from '@babylonjs/core';
import { safetyPatchCollisionSystem, validateTerrainCollisions } from '@/models/player/MoveHelper';
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
import TerrainChunk from './terrain/TerrainChunk';
import Savepoint from '@/models/mehanics/Savepoint';
import BlendModes from '@/models/scene/BlendModes';
import Materials from '@/models/scene/Materials';
import OutLiner from '@/models/scene/OutLiner';
import Doors from '@/models/mehanics/Doors';
import Prefabs from '@/models/scene/Prefabs';
import TerrainManager from '@/models/terrain/TerrainManager';
import MiniMap from '@/models/terrain/MiniMap';
import GlobalMap from '@/models/terrain/GlobalMap';

export default class Game {
  private scene!: BabylonScene;
  private positionSaveInterval?: number;
  private playerSpawner!: PlayerSpawner;
  private debugMode = false;
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
      this.setupPositionSanitizer();
      this.startPositionPersistence();
    });
  }

  async initializeGameComponents(spawnPosition: Vector3, callback: any) {
    RegisterTagsExtension();

    new DevMode();
    globalThis.collisions = new Collisions();

    // Initialize terrain system first
    window.terrainManager = new TerrainManager(window.scene!, 128, 3); // Use 128 chunk size (power of 2)

    console.log(
      'Using position for spawn:',
      spawnPosition !== new Vector3(30, 0, 30) ? 'Saved position' : 'Default position',
      spawnPosition.toString()
    );

    try {
      // Re-enable terrain manager initialization
      await window.terrainManager.initialize(spawnPosition);

      // Now initialize player after terrain is ready
      PlayerSelf.init(async () => {
        // Use the player spawner to spawn the player
        await this.playerSpawner.spawnPlayer(spawnPosition);
        callback();

        Savepoint.init();
        Materials.addCustomMaterial();
        BlendModes.init();
        OutLiner.init();
        new Doors();

        new Points(store.getPlayerId() || '');

        storeVuex.commit('LOADING_TOGGLE');
      });
    } catch (error) {
      console.error('Failed to load initial terrain:', error);
      // Fallback initialization
      PlayerSelf.init(() => {
        callback();
        Savepoint.init();
        Materials.addCustomMaterial();
        BlendModes.init();
        OutLiner.init();
        new Doors();

        new Points(store.getPlayerId() || '');

        storeVuex.commit('LOADING_TOGGLE');
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

    // Save position and update terrain every 5 seconds
    this.positionSaveInterval = window.setInterval(() => {
      const playerId = store.getPlayerId();
      const playerMesh = globalThis.scene.getMeshByName('playerFoot_' + playerId);

      if (playerMesh) {
        // IMPORTANT CHANGE: Only reset position if player has moved significantly
        // This prevents the forced reset issue
        // const distanceFromOrigin = playerMesh.position.length();

        // if (distanceFromOrigin > 500) {
        //   // Only reset if really far from origin
        //   // Update the global position based on engine position changes
        //   const updatedGlobalPos = WorldManager.toGlobal(playerMesh.position);
        //   WorldManager.setGlobalPlayerPosition(updatedGlobalPos);

        //   // Reset player to origin while maintaining Y height
        //   const playerHeight = playerMesh.position.y;
        //   playerMesh.position = new Vector3(0, playerHeight, 0);

        //   console.log(
        //     'Player position reset to origin, global position updated to:',
        //     updatedGlobalPos.toString()
        //   );

        //   // After resetting position, wait before updating terrain
        //   setTimeout(() => {
        //     if (window.terrainManager) {
        //       window.terrainManager.updateChunks(Vector3.Zero());
        //     }
        //   }, 500);
        // } else {
        //   // Only update terrain if not teleporting
        if (window.terrainManager && !window.terrainManager.isTeleporting) {
          // Update terrain chunks based on player position
          window.terrainManager.updateChunks(playerMesh.position);
        }
        // }

        // Save the position regardless
        const virtualPos = WorldManager.toVirtual(playerMesh.position);
        this.playerSpawner.updateGlobalMapPosition(virtualPos);

        // Periodically validate terrain collisions
        validateTerrainCollisions(this.scene);
      }
    }, 5000);
  }

  private setupPositionSanitizer(): void {
    // Check for non-finite positions in all critical components
    this.scene.onBeforeRenderObservable.add(() => {
      // Check player position
      const playerId = store.getPlayerId();
      const playerMesh = this.scene.getMeshByName('playerFoot_' + playerId);

      if (playerMesh) {
        // Fix any non-finite values
        if (
          !isFinite(playerMesh.position.x) ||
          !isFinite(playerMesh.position.y) ||
          !isFinite(playerMesh.position.z)
        ) {
          console.warn('Fixed non-finite player position');

          playerMesh.position.x = isFinite(playerMesh.position.x) ? playerMesh.position.x : 0;
          playerMesh.position.y = isFinite(playerMesh.position.y) ? playerMesh.position.y : 50;
          playerMesh.position.z = isFinite(playerMesh.position.z) ? playerMesh.position.z : 0;
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
          console.warn('Fixed non-finite camera position');
          camera.position = new Vector3(
            isFinite(camera.position.x) ? camera.position.x : 0,
            isFinite(camera.position.y) ? camera.position.y : 50,
            isFinite(camera.position.z) ? camera.position.z : 0
          );
        }
      }
    });
  }

  public cleanup(): void {
    if (this.positionSaveInterval) {
      clearInterval(this.positionSaveInterval);
      this.positionSaveInterval = undefined;
    }
  }
}

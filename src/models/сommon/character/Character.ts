import {
  AbstractMesh,
  Mesh,
  Nullable,
  Observer,
  Scene,
  Color3,
  Color4,
  ParticleSystem,
  Vector3,
  Texture,
  PBRMaterial,
} from '@babylonjs/core';
import Animation from './Animation';
import ContainerManager from '@/models/scene/ContainerManager';
import Rotation from './Rotation';
import { usePlayerStore, Player } from '@/stores/playerStore';
import PlayerSound from '@/models/sounds/Player';

export default class Character {
  scene: Scene;
  mesh: AbstractMesh | undefined;
  meshFoot: Mesh;
  meshHead?: AbstractMesh;
  meshBody?: AbstractMesh;
  meshRoot?: AbstractMesh;
  playerId: string;
  meshBodyId: string;
  meshRootId: string;
  observer?: Nullable<Observer<Scene>>;
  animation?: Animation;
  rotation?: Rotation;
  offsetY: number;
  statePlayer: Player;
  particleSystem: ParticleSystem;
  //TODO: mb needed move to other class
  blockedOtherSounds: boolean;
  constructor(playerId: string) {
    this.scene = globalThis.scene;
    this.playerId = playerId;
    const store = usePlayerStore();
    this.statePlayer = store.getPlayer(playerId)!;
    this.meshFoot = this.scene.getMeshById('playerFoot_' + playerId) as Mesh;
    this.meshHead = this.scene.getMeshById('playerHead_' + playerId) as AbstractMesh;
    this.meshBodyId = 'characterBody_' + this.playerId;
    this.meshRootId = 'characterRoot_' + this.playerId;

    const boundingInfo = this.meshFoot.getBoundingInfo();
    this.offsetY = (boundingInfo.maximum.y - boundingInfo.minimum.y) / 2 + 0.13;
    this.particleSystem = new ParticleSystem('particles', 100, this.scene);
    this.blockedOtherSounds = false;

    this.createSmokeParticles();
  }

  load(callback: any) {
    const path = import.meta.env.VUE_APP_RESOURCES_PATH + 'graphics/characters/';
    const store = usePlayerStore();

    const player = store.getPlayer(this.playerId);
    if (!player) {
      console.error('Player not found in store');
      return;
    }
    const assetContainer = ContainerManager.getContainer(player.character, path);

    assetContainer.then((container) => {
      if (!container) {
        throw 'Not found container: ' + path + player.character;
      }

      const rootMesh = container.rootNodes[0];
      rootMesh.id = this.meshRootId;

      // First add the root mesh as a shadow caster
      if (globalThis.shadowGenerator) {
        globalThis.shadowGenerator.addShadowCaster(rootMesh.getChildMeshes()[0]);
        globalThis.shadowGenerator.getShadowMap()?.renderList?.push(rootMesh.getChildMeshes()[0]);
        console.log(`Added player root mesh ${this.meshRootId} as shadow caster`);
      }

      container.rootNodes[0].getChildMeshes().forEach((mesh) => {
        if (globalThis.shadowGenerator) {
          globalThis.shadowGenerator.addShadowCaster(mesh);
          globalThis.shadowGenerator.getShadowMap()?.renderList?.push(mesh);
          // Also make sure each mesh can cast shadows properly
          mesh.receiveShadows = true; // Player meshes don't need to receive their own shadows
        }

        if (mesh.name == 'Hair') {
          const material = new PBRMaterial('Hair_' + this.playerId, this.scene);
          const skinColor = player.skinColor;

          material.albedoColor = new Color3(skinColor.r, skinColor.g, skinColor.b);
          material.roughness = 1.0;
          mesh.material = material;
        }

        if (mesh.name == 'Body') {
          mesh.id = this.meshBodyId;
          mesh.name = this.meshBodyId;

          return;
        }

        mesh.id = mesh.id + '_' + this.playerId;
        mesh.name = mesh.name + '_' + this.playerId;
        mesh.outlineWidth = 0.005;
        mesh.outlineColor = new Color3(0, 0, 0);
        mesh.renderOutline = true;
      });

      container.animationGroups.forEach((animationGroup) => {
        animationGroup.name = animationGroup.name + '_' + this.playerId;
      });

      this.setMeshes();
      this.setAnimations();
      this.setSounds();

      this.observer = this.scene.onBeforeRenderObservable.add(() => {
        this.beforeRender();
      });

      // Log shadow casters after everything is set up
      this.logShadowCastersCount();

      // Ensure meshes are fully ready before callback
      if (this.meshHead && this.meshFoot && this.meshBody) {
        // Force compute world matrix and update bounds
        this.meshHead.computeWorldMatrix(true);
        this.meshFoot.computeWorldMatrix(true);
        this.meshBody.computeWorldMatrix(true);

        // Signal that character is fully loaded
        callback();
      } else {
        console.error('Character meshes not fully initialized');
      }
    });
  }

  setMeshes() {
    const meshBody = this.scene.getMeshById(this.meshBodyId);
    const meshRoot = this.scene.getMeshById(this.meshRootId);

    if (!meshBody) {
      throw 'Not found mesh Player Body';
    }

    if (!this.meshFoot) {
      throw 'Not found mesh Player Foot';
    }

    if (!meshRoot) {
      throw 'Not found mesh Root';
    }

    this.meshBody = meshBody;
    this.meshBody.checkCollisions = false;
    this.meshBody.rotationQuaternion = null;
    this.meshBody.resetLocalMatrix();
    this.meshBody.isVisible = false;

    this.meshRoot = meshRoot;
    this.meshRoot.checkCollisions = false;
    this.meshRoot.id = this.meshRoot.name;
    this.meshRoot.rotationQuaternion = null;
    this.meshRoot.resetLocalMatrix();

    this.meshRoot.getChildMeshes().forEach((mesh) => {
      mesh.id = mesh.name;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
    });
  }

  private setAnimations() {
    this.animation = new Animation(this.playerId);
    this.rotation = new Rotation(this.playerId);
  }

  private setSounds() {
    // const store = usePlayerStore();
    // const player = store.getPlayer(this.playerId);
    // const sound = new PlayerSound(this.playerId);
    // store.$onAction(
    //   ({
    //     name, // name of the action
    //     store, // store instance, same as `someStore`
    //     args, // array of parameters passed to the action
    //     after, // hook after the action returns or resolves
    //     onError, // hook if the action throws or rejects
    //   }) => {
    //     if (!player.move.isFlying) {
    //       if (type === 'isFlying') {
    //         sound.stopWalk();
    //         sound.stopSprint();
    //         this.blockedOtherSounds = true;
    //         sound.playJumpFinish();
    //         setTimeout(() => {
    //           this.blockedOtherSounds = false;
    //           this.playSoundByState(player, sound);
    //         }, 150);
    //         return;
    //       }
    //       this.playSoundByState(player, sound);
    //       return;
    //     }
    //     sound.stopWalk();
    //     sound.stopSprint();
    //     sound.stopJumpFinish();
    //   }
    // );
  }

  private playSoundByState(player: Player, sound: PlayerSound) {
    if (!this.blockedOtherSounds) {
      // Check if player is sprinting (either from keyboard or joystick)
      if (
        player.move.forward.sprint &&
        (player.move.speedType == 'Run' || player.move.speedType == 'Sprint')
      ) {
        sound.stopWalk();
        sound.playSprint();
        return;
      }

      if (player.move.speedType == 'Run') {
        sound.stopSprint();
        sound.playRun();
        return;
      }

      if (player.move.speedType == 'Sprint') {
        sound.stopWalk();
        sound.playSprint();
        return;
      }

      if (player.move.speedType == 'Idle') {
        sound.stopWalk();
        sound.stopSprint();
      }
    }
  }

  private createSmokeParticles() {
    this.particleSystem.particleTexture = new Texture(
      './resources/graphics/textures/smoke.png',
      this.scene
    );
    this.particleSystem.minEmitBox = new Vector3(-0.2, -0.1, -0.2); // Starting all from
    this.particleSystem.maxEmitBox = new Vector3(0.1, 0.1, 0.1); // To...
    this.particleSystem.colorDead = new Color4(0, 0, 0, 0);
    this.particleSystem.gravity = new Vector3(0, -3, 0);
    this.particleSystem.minSize = 0.03;
    this.particleSystem.maxSize = 0.1;
    this.particleSystem.minLifeTime = 0.1;
    this.particleSystem.maxLifeTime = 0.5;
    this.particleSystem.emitRate = 100;
    this.particleSystem.addSizeGradient(0, 0.1, 0.3); //size range at start of particle lifetime
    this.particleSystem.addSizeGradient(1.0, 1, 2); //size range at end of particle lifetime
    this.particleSystem.addColorGradient(0, new Color4(0.52, 0.3, 0.2, 0.2)); //color at start of particle lifetime
    this.particleSystem.addColorGradient(1, new Color4(1, 0.9, 0.9, 0)); //color at end of particle lifetime
    this.particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    const store = usePlayerStore();

    store.subscribe(store.selfPlayerId!, (type: string) => {
      if (type === 'isFlying') {
        if (!this.statePlayer.move.isFlying) {
          this.particleSystem.start();

          setTimeout(() => {
            this.particleSystem.stop();
          }, 300);
        }
      }
    });
  }

  private beforeRender() {
    if (this.meshRoot && this.meshFoot) {
      this.meshRoot.position.x = this.meshFoot.position.x;
      this.meshRoot.position.z = this.meshFoot.position.z;
      this.meshRoot.position.y = this.meshFoot.position.y - this.offsetY;

      if (this.particleSystem.isAlive()) {
        this.particleSystem.emitter = new Vector3(
          this.meshFoot.position.x,
          this.meshFoot.position.y - this.offsetY,
          this.meshFoot.position.z
        );
      }
    }
  }

  private logShadowCastersCount() {
    if (globalThis.shadowGenerator) {
      const shadowMap = globalThis.shadowGenerator.getShadowMap();
      if (shadowMap && shadowMap.renderList) {
        console.log(`Shadow generator now has ${shadowMap.renderList.length} shadow casters`);

        // Force shadow generator to update
        globalThis.shadowGenerator.forceBackFacesOnly = false;
        if (shadowMap) {
          shadowMap.refreshRate = 1; // Update every frame
        }

        // Ensure player meshes cast shadows but don't receive them
        this.scene.meshes.forEach((mesh) => {
          if (
            mesh.name.includes('player_') ||
            mesh.name.includes('playerFoot_') ||
            mesh.name.includes('characterRoot_') ||
            mesh.name.includes('_' + this.playerId)
          ) {
            mesh.receiveShadows = false;
          }
        });
      }
    }
  }

  dispose() {
    this.rotation?.dispose();
    this.animation?.dispose();

    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
    }

    this.scene.getMeshById('characterRoot_' + this.playerId)?.dispose();
  }
}

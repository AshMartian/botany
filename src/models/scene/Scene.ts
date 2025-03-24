import {
  Engine,
  RollingAverage,
  Scene as BabylonScene,
  SceneLoader,
  SceneOptimizer,
  SceneOptimizerOptions,
  ArcRotateCamera,
  Vector3,
} from '@babylonjs/core';

import Environment from '@/models/scene/Environment';

export default class GameScene {
  babylonScene: BabylonScene;
  engine: Engine;

  constructor(engine: Engine) {
    this.babylonScene = new BabylonScene(engine);
    globalThis.scene = this.babylonScene;
    this.engine = engine;

    // Create default camera
    this.createDefaultCamera();

    const rollingAverage = new RollingAverage(60);

    globalThis.scene.onBeforeRenderObservable.add(() => {
      rollingAverage.add(globalThis.scene.getAnimationRatio());
      globalThis.average = rollingAverage.average;
    });
  }

  private createDefaultCamera(): void {
    // Create and position a default camera
    const camera = new ArcRotateCamera(
      'defaultCamera',
      -Math.PI / 2,
      Math.PI / 2.5,
      15,
      Vector3.Zero(),
      this.babylonScene
    );

    // Position camera above terrain
    camera.position = new Vector3(0, 50, -20);
    camera.attachControl(this.engine.getRenderingCanvas(), true);
    camera.minZ = 0.1;
    camera.speed = 0.5;

    // Set as active camera
    this.babylonScene.activeCamera = camera;

    // Enable debug layer for development
    this.babylonScene.debugLayer.show();
  }

  async load(callbackLoad: () => void) {
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    SceneLoader.CleanBoneMatrixWeights = true;
    SceneLoader.ShowLoadingScreen = false;

    // For Mars terrain, we'll use procedural generation instead of loading a static map
    // But we'll keep the option to load a map for other levels
    // if (storeVuex.state.levelId === 1) {
    try {
      callbackLoad();
      const divFps = document.getElementById('fps_counter') as HTMLElement;
      this.optimize();

      this.engine.runRenderLoop(() => {
        this.babylonScene.render();
        divFps.innerHTML = this.engine.getFps().toFixed() + ' fps';
      });
    } catch (e) {
      console.error(e);
    }
    // }
    // If we wanted to have a static map for other levels, we could uncomment the following code
    // else {
    //   const fileName = 'map.babylon';
    //   const filePath =
    //     import.meta.env.VUE_APP_RESOURCES_PATH + 'graphics/level_' + storeVuex.state.levelId + '/';

    //   const timestamp = 1;
    //   const filePathWithTimestamp = fileName + '?timestamp=' + timestamp;

    //   SceneLoader.Append(
    //     filePath,
    //     filePathWithTimestamp,
    //     this.babylonScene,
    //     () => {
    //       try {
    //         callbackLoad();
    //         const divFps = document.getElementById('fps_counter') as HTMLElement;
    //         this.optimize();

    //         this.engine.runRenderLoop(() => {
    //           this.babylonScene.render();
    //           divFps.innerHTML = this.engine.getFps().toFixed() + ' fps';
    //         });
    //       } catch (e) {
    //         console.error(e);
    //       }
    //     },
    //     null,
    //     (scene, message, error) => {
    //       console.error(error, message);
    //     }
    //   );
    // }
  }

  private optimize() {
    const scene = globalThis.scene;
    scene.autoClearDepthAndStencil = false;
    scene.disablePhysicsEngine();
    scene.skipPointerMovePicking = true;

    const options = new SceneOptimizerOptions(60);
    const optimizer = new SceneOptimizer(scene, options);
    optimizer.start();
  }

  setEnvironment() {
    const environment = new Environment();
    environment.setupHDR();
    environment.setupGlow();
    environment.setupSSAO();
    environment.setupFog();
    environment.setupLightAndShadow();
    environment.setupLightPoints();
  }
}

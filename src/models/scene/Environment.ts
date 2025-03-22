import {
  CubeTexture,
  GlowLayer,
  Matrix,
  Tools,
  Scene,
  Color3,
  DirectionalLight,
  ShadowGenerator,
  SSAORenderingPipeline,
  Texture,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color4,
} from '@babylonjs/core';

import storeVuex from '@/store/vuex';
import { Environment as EnvironmentSettings } from '@/store/vuex/types';
import LightPoints from '@/models/scene/LightPoints';
// Sky import removed as it's not used

export default class Environment {
  shadowGenerator: ShadowGenerator | null;
  scene: Scene;
  settings: EnvironmentSettings;

  constructor() {
    this.scene = globalThis.scene;
    this.shadowGenerator = null;
    this.settings = storeVuex.state.settings.environment;
  }

  setupHDR() {
    const url = process.env.VUE_APP_RESOURCES_PATH + 'graphics/textures/environment.env';
    const hdrTexture = CubeTexture.CreateFromPrefilteredData(url, this.scene);
    const hdrRotation = this.settings.hdr.rotation;

    hdrTexture.setReflectionTextureMatrix(Matrix.RotationY(Tools.ToRadians(hdrRotation)));

    hdrTexture.gammaSpace = this.settings.hdr.gammaSpace;
    this.scene.environmentTexture = hdrTexture;
    this.scene.environmentIntensity = this.settings.hdr.intensity;
  }

  setupGlow() {
    const gl = new GlowLayer('glow', this.scene, {
      mainTextureFixedSize: this.settings.glow.mainTextureFixedSize,
      blurKernelSize: this.settings.glow.blurKernelSize,
    });

    gl.intensity = this.settings.glow.intensity;
  }

  setupFog() {
    // Mars-like dusty orange/reddish atmosphere
    const marsAtmosphereColor = new Color3(0.54, 0.39, 0.29); //color(prophoto-rgb 0.54 0.39 0.29)

    this.scene.fogColor = marsAtmosphereColor;
    this.scene.fogDensity = 0.005; // Much less dense for better visibility in gameplay
    this.scene.fogMode = this.settings.fog.mode;
    this.scene.fogEnabled = true;
    this.scene.clearColor = new Color4(0.54, 0.39, 0.29);

    // For linear fog mode (if used)
    this.scene.fogStart = 200;
    this.scene.fogEnd = 800;

    // Update the settings for persistence
    this.settings.fog.color = {
      r: marsAtmosphereColor.r,
      g: marsAtmosphereColor.g,
      b: marsAtmosphereColor.b,
    };

    console.log('Mars atmosphere fog configured:', this.scene.fogColor.toString());
  }

  setupLightAndShadow() {
    // Create light if not found
    let light = this.scene.getLightById('MainDirectionLight') as DirectionalLight;

    if (!light) {
      // Create new directional light with proper settings for dramatic shadows
      light = new DirectionalLight('MainDirectionLight', new Vector3(-1, -2, -1), this.scene);
      light.position = new Vector3(100, 150, 100); // Position higher for better shadow coverage
      light.intensity = 1.2; // Brighter light
      console.warn('Created new directional light - was missing from scene');
    } else {
      // Update existing light for better shadows
      light.direction = new Vector3(-1, -2, -1);
      light.position = new Vector3(100, 150, 100);
      light.intensity = 1.2;
    }

    // Now safely set properties
    light.intensity = 1.2;
    light.shadowEnabled = true;
    light.shadowMinZ = 1;
    light.shadowMaxZ = 500;

    // IMPORTANT FIX: Set up shadow auto-calculation
    light.autoUpdateExtends = true;
    light.autoCalcShadowZBounds = true;

    // Create a higher resolution shadow map (4096 for better detail)
    const shadowGenerator = new ShadowGenerator(4096, light);

    // Configure shadow quality - increase resolution and quality
    shadowGenerator.useExponentialShadowMap = true;
    shadowGenerator.usePoissonSampling = true;
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    shadowGenerator.bias = 0.0005; // Adjusted for better shadow quality
    shadowGenerator.normalBias = 0.02; // Prevent self-shadowing

    // Force the shadow generator to update its transforms
    shadowGenerator.forceBackFacesOnly = false;
    shadowGenerator.depthScale = 50; // IMPORTANT FIX: Reduced for better shadow precision
    shadowGenerator.transparencyShadow = true;

    // IMPORTANT: Add debug callback to ensure light direction stays consistent
    this.scene.onBeforeRenderObservable.add(() => {
      if (shadowGenerator && light) {
        // Force light direction to stay consistent
        light.direction = new Vector3(-1, -2, -1).normalize();

        // Log shadow information occasionally for debugging
        if (Math.random() < 0.001) {
          // Log approx once every 1000 frames
          console.log('Shadow map active:', shadowGenerator.getShadowMap() != null);
          console.log('Shadow casters:', shadowGenerator.getShadowMap()?.renderList?.length || 0);
        }
      }
    });

    // Register all terrain chunks as shadow receivers
    console.log('Registering terrain chunks for shadows...');
    let terrainCount = 0;
    this.scene.meshes.forEach((mesh) => {
      if (mesh.name.startsWith('terrain_chunk_')) {
        console.log(`Adding shadow receiver: ${mesh.name}`);
        mesh.receiveShadows = true;
        terrainCount++;
      }
    });
    console.log(`Added ${terrainCount} terrain chunks to shadow system`);

    // Store shadow generator for later access
    this.shadowGenerator = shadowGenerator;
    globalThis.shadowGenerator = shadowGenerator;
    globalThis.environment = this;
    globalThis.terrainMaterials = {};

    // Add useful debugging methods
    globalThis.visualizeShadowMap = () => this.visualizeShadowMap();
    globalThis.toggleShadowMap = () => {
      // Toggle shadow map visualization
      const existing = this.scene.getMeshByName('shadowVisualizer');
      if (existing) {
        existing.dispose();
        console.log('Shadow visualizer removed');
      } else {
        this.visualizeShadowMap();
      }
    };
    globalThis.findLargeShadowCasters = () => this.findLargeShadowCasters();

    console.log('Shadow system configured with light direction:', light.direction.toString());
  }

  setupSSAO() {
    const ssaoRatio = {
      ssaoRatio: 0.5, // Коэффициент разрешения SSAO
      combineRatio: 1.0, // Коэффициент разрешения итогового изображения
    };

    const ssao = new SSAORenderingPipeline('ssao', this.scene, ssaoRatio);
    ssao.fallOff = 0.1;
    ssao.area = 1;
    ssao.radius = 0.0001;
    ssao.totalStrength = 1.0;
    ssao.base = 0.5;

    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
      'ssao',
      this.scene.activeCamera
    );
  }

  setupLightPoints() {
    const lightPoints = new LightPoints();
    lightPoints.setupLights();
  }

  setupSkybox() {
    // Create much larger skybox that covers the entire play area
    const skybox = MeshBuilder.CreateBox('skyBox', { size: 900 }, this.scene);
    const skyboxMaterial = new StandardMaterial('skyBoxMaterial', this.scene);
    skyboxMaterial.backFaceCulling = false;

    // Use a Mars-like skybox texture
    skyboxMaterial.reflectionTexture = new CubeTexture(
      '/resources/graphics/textures/skybox',
      this.scene
    );
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.disableLighting = true;
    skybox.material = skyboxMaterial;

    // Add a slight tint to match fog color
    skyboxMaterial.diffuseColor = new Color3(0.65, 0.56, 0.35);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);

    // Ensure skybox is not pickable and has correct rendering group
    skybox.isPickable = false;
    skybox.renderingGroupId = 0;
    skybox.infiniteDistance = true; // This makes it always appear distant regardless of position

    // Add an observer to make the skybox follow the active camera
    this.scene.onBeforeRenderObservable.add(() => {
      if (this.scene.activeCamera) {
        skybox.position = this.scene.activeCamera.position.clone();
      }
    });

    console.log('Skybox created with size 2000');
  }

  public setupPlayerShadows() {
    if (this.shadowGenerator) {
      // Find all player meshes in the scene
      const playerMeshes = this.scene.meshes.filter(
        (mesh) =>
          mesh.name.includes('player_') ||
          mesh.name.includes('playerFoot_') ||
          mesh.name.includes('characterRoot_')
      );

      console.log(`Setting up shadows for ${playerMeshes.length} player meshes`);

      // Add them to shadow generator
      playerMeshes.forEach((mesh) => {
        this.shadowGenerator?.addShadowCaster(mesh);

        // Make sure player meshes don't receive shadows (prevents self-shadowing artifacts)
        mesh.receiveShadows = false;

        // Process child meshes
        if (mesh.getChildMeshes) {
          mesh.getChildMeshes().forEach((childMesh) => {
            this.shadowGenerator?.addShadowCaster(childMesh);
            childMesh.receiveShadows = false;
          });
        }
      });

      // Ensure terrain gets all the shadows
      this.scene.meshes
        .filter((mesh) => mesh.name.startsWith('terrain_chunk_'))
        .forEach((terrainMesh) => {
          terrainMesh.receiveShadows = true;
        });
    }
  }

  visualizeShadowMap() {
    if (this.shadowGenerator) {
      const plane = MeshBuilder.CreatePlane(
        'shadowVisualizer',
        { width: 10, height: 5 },
        this.scene
      );
      plane.position = new Vector3(0, 10, 0);

      const material = new StandardMaterial('shadowVisMaterial', this.scene);
      material.diffuseTexture = this.shadowGenerator.getShadowMap();
      // material.diffuseTexture?.hasAlpha = false;
      material.backFaceCulling = false;
      plane.material = material;

      console.log('Shadow map visualization created - press F to focus on it');
      return plane;
    }
  }

  findLargeShadowCasters() {
    if (this.shadowGenerator) {
      const shadowMap = this.shadowGenerator.getShadowMap();
      if (shadowMap && shadowMap.renderList) {
        console.log('Checking shadow casters...');
        shadowMap.renderList.forEach((mesh) => {
          // Check for unusually large meshes
          if (mesh.getBoundingInfo) {
            const bounds = mesh.getBoundingInfo();
            const size = bounds.boundingBox.extendSize;
            const maxDimension = Math.max(size.x, size.y, size.z);

            if (maxDimension > 50) {
              console.warn(`Large shadow caster found: ${mesh.name}, size: ${maxDimension}`);

              // Optional: Highlight it for debugging
              mesh.showBoundingBox = true;

              // Optional: Remove it from shadow casters if it's the skybox or similar
              if (mesh.name.includes('skyBox') || mesh.name.includes('sky')) {
                console.log(`Removing ${mesh.name} from shadow casters`);
                this.shadowGenerator?.removeShadowCaster(mesh);
              }
            }
          }
        });
      }
    }
  }

  setupSky() {
    // Sky.init();
  }
}

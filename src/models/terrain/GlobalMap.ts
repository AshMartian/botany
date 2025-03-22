import {
  Scene as BabylonScene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  CubeTexture,
  Vector3,
  ArcRotateCamera,
  Color3,
  PickingInfo,
  HemisphericLight,
  Matrix,
  Observer,
  Nullable,
  Camera,
} from '@babylonjs/core';
import SharedPlayerState from '@/models/player/SharedPlayerState';
import WorldManager from './WorldManager';
import { AdvancedDynamicTexture, Control, Button, TextBlock } from '@babylonjs/gui';

// Global declarations are now in global.d.ts

export default class GlobalMap {
  private scene: BabylonScene;
  private advancedTexture: AdvancedDynamicTexture | null = null;
  private mapContainer: Control | null = null;
  private globeMesh: Mesh | null = null;
  private originalCamera: ArcRotateCamera | null = null;
  private mapCamera: ArcRotateCamera | null = null;
  private isOpen = false;
  private mapLight: HemisphericLight | null = null;
  private targetMarker: Mesh | null = null;
  private mapSkybox: Mesh | null = null;
  private renderObserver: Nullable<Observer<BabylonScene>> = null;
  private cameraObserver: Nullable<Observer<Camera>> = null;

  private longitudeOffset = 0; // Positive values shift east, negative west
  private latitudeOffset = 0; // Positive values shift north, negative south
  private markerRadiusOffset = 0; // Adjust height above surface
  private playerCoordinatesText: TextBlock | null = null;
  private targetCoordinatesText: TextBlock | null = null;

  /**
   * Converts normalized world coordinates to a point on the globe surface
   */
  private worldToGlobePosition(
    normalizedX: number,
    normalizedZ: number,
    heightOffset = 0
  ): Vector3 {
    // Convert to spherical coordinates with offsets
    const longitude = normalizedX * 2 * Math.PI - Math.PI + this.longitudeOffset;
    const latitude = normalizedZ * Math.PI - Math.PI / 2 + this.latitudeOffset;

    // Calculate position on globe surface
    const radius = 2.55 + this.markerRadiusOffset + heightOffset; // Base radius with adjustments
    const x = radius * Math.cos(latitude) * Math.cos(longitude);
    const y = radius * Math.sin(latitude);
    const z = radius * Math.cos(latitude) * Math.sin(longitude);

    return new Vector3(x, y, z);
  }

  /**
   * Converts a point on the globe surface to normalized world coordinates
   */
  private globeToWorldPosition(globePoint: Vector3): { normalizedX: number; normalizedZ: number } {
    // Normalize the point to get direction from center
    const direction = globePoint.normalize();

    // Calculate longitude and latitude
    const longitude = Math.atan2(direction.z, direction.x) - this.longitudeOffset;
    const latitude = Math.asin(direction.y) - this.latitudeOffset;

    // Convert to normalized 0-1 range
    const normalizedX = (longitude + Math.PI) / (2 * Math.PI);
    const normalizedZ = (latitude + Math.PI / 2) / Math.PI;

    return { normalizedX, normalizedZ };
  }

  /**
   * Format coordinates into sector/chunk format
   */
  private formatAsSector(x: number, z: number): string {
    // Calculate sector - assuming 1000 units per sector
    const sectorSize = 1000;
    const sectorX = Math.floor(x / sectorSize);
    const sectorZ = Math.floor(z / sectorSize);

    return `Sector ${sectorX}_${sectorZ} (${Math.round(x)}, ${Math.round(z)})`;
  }

  constructor(scene: BabylonScene) {
    this.scene = scene;

    // Listen for 'M' key press to toggle the map
    window.addEventListener('keydown', (event) => {
      if (event.key === 'm' || event.key === 'M') {
        this.toggleGlobalMap();
      }
    });
  }

  public async open(): Promise<void> {
    await this.openGlobalMap();
    this.isOpen = true;
  }

  private async toggleGlobalMap(): Promise<void> {
    if (this.isOpen) {
      this.closeGlobalMap();
      // Show mini map when global map closes
      if (window.miniMap) {
        window.miniMap.show();
      }
      this.isOpen = false;
    } else {
      await this.openGlobalMap();
      // Hide mini map when global map opens
      if (window.miniMap) {
        window.miniMap.hide();
      }
      this.isOpen = true;
    }
  }

  private async openGlobalMap(): Promise<void> {
    // Store the original camera
    this.originalCamera = this.scene.activeCamera as ArcRotateCamera;

    // Create the globe mesh first so we can reference it
    await this.createGlobeMesh();

    // Get player position before setting up camera
    const playerState = SharedPlayerState.getInstance();
    const normalizedPos = playerState.getNormalizedPosition();

    // Default camera angles
    let alpha = Math.PI / 2;
    let beta = Math.PI / 2;

    // Calculate camera angle to look at player position
    if (normalizedPos) {
      // Convert normalized coordinates to longitude and latitude
      const longitude = normalizedPos.x * 2 * Math.PI - Math.PI + this.longitudeOffset;
      const latitude = normalizedPos.z * Math.PI - Math.PI / 2 + this.latitudeOffset;

      // Set camera angles to look at player position
      // We need to offset by PI to position camera opposite to the point
      alpha = longitude + Math.PI;
      beta = Math.PI - latitude;

      console.log(
        'GlobalMap: Focusing camera at:',
        `Player normalized: (${normalizedPos.x.toFixed(4)}, ${normalizedPos.z.toFixed(4)})`,
        `Camera angles: alpha=${alpha.toFixed(4)}, beta=${beta.toFixed(4)}`
      );
    }

    // Create a new camera for the globe view with calculated angles
    this.mapCamera = new ArcRotateCamera(
      'mapCamera',
      alpha, // Calculated horizontal angle
      beta, // Calculated vertical angle
      8, // Start a bit closer to see the player
      Vector3.Zero(),
      this.scene
    );

    this.mapCamera.minZ = 0.05;
    this.mapCamera.wheelPrecision = 20;
    this.mapCamera.lowerRadiusLimit = 4;
    this.mapCamera.upperRadiusLimit = 25;

    // Add slight animation to focus
    this.mapCamera.useFramingBehavior = true;

    this.mapCamera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
    this.scene.activeCamera = this.mapCamera;

    // Create the skybox
    this.createSkybox();

    // Create UI for the global map
    this.createGlobalMapUI();
  }

  private async createGlobeMesh(): Promise<void> {
    // Create a sphere to represent Mars with higher quality
    this.globeMesh = MeshBuilder.CreateSphere(
      'marsSphere',
      { diameter: 5, segments: 200 }, // Increased segments for more detail
      this.scene
    );

    this.globeMesh.applyDisplacementMap(
      '/resources/images/mars/mars_2k_topo.jpg',
      0,
      0.3, // Height scale
      undefined,
      undefined,
      undefined,
      true // force update
    );

    // Create material with Mars texture
    const marsMaterial = new StandardMaterial('marsMaterial', this.scene);
    marsMaterial.diffuseTexture = new Texture(
      '/resources/images/mars/mars_2k_color.jpg',
      this.scene,
      false, // NoMipmap
      false,
      Texture.TRILINEAR_SAMPLINGMODE
    );

    // Add ambient light to ensure the entire globe is visible
    const ambientLight = new HemisphericLight('mapLight', new Vector3(0, 1, 0), this.scene);
    ambientLight.intensity = 0.8;
    ambientLight.diffuse = new Color3(1, 1, 1);
    ambientLight.groundColor = new Color3(0.5, 0.5, 0.5);

    // Store light reference for disposal
    this.mapLight = ambientLight;

    // Update globe material settings
    marsMaterial.diffuseTexture.hasAlpha = false;
    marsMaterial.diffuseColor = new Color3(0.5, 0.3, 0.2); // Fallback color
    marsMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
    marsMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1); // Add some self-illumination

    // Add heightmap (topography) texture
    marsMaterial.bumpTexture = new Texture(
      '/resources/images/mars/mars_2k_normal.jpg',
      this.scene,
      false,
      false
    );
    marsMaterial.bumpTexture.level = 0.8; // Adjust the intensity of the bump effect

    this.globeMesh.material = marsMaterial;

    // Add a marker for the player's position
    await this.addPlayerMarker();

    // Add a target marker that follows mouse position
    this.addTargetMarker();

    // Add click event for teleportation - make this more robust
    this.globeMesh.isPickable = true;

    // Remove any existing click handlers
    // this.scene.onPointerDown = null;

    // Add a new click handler
    this.scene.onPointerDown = (evt, pickInfo) => {
      if (pickInfo.hit && pickInfo.pickedMesh === this.globeMesh && pickInfo.pickedPoint) {
        this.teleportPlayerToLocation(pickInfo);
      }
    };
  }

  private async teleportPlayerToLocation(pickInfo: PickingInfo): Promise<void> {
    if (!this.globeMesh || !pickInfo.pickedPoint) {
      console.error('GlobalMap: Invalid pick info for teleportation');
      return;
    }

    // Close the map first to restore normal view
    this.closeGlobalMap();
    this.isOpen = false;

    // Show mini map again
    if (window.miniMap) {
      window.miniMap.show();
    }

    // Use helper method to convert globe point to world position
    const worldPos = this.globeToWorldPosition(pickInfo.pickedPoint);

    // Convert to virtual coordinates - IMPORTANT: Use proper coordinate mapping
    // Z and X are intentionally assigned as shown to match Mars coordinate system
    const virtualX = worldPos.normalizedX * WorldManager.WORLD_WIDTH; // X in Mars system
    const virtualZ = worldPos.normalizedZ * WorldManager.WORLD_HEIGHT; // Z in Mars system

    console.log(
      'GlobalMap: Teleport calculated:',
      `Virtual: (${virtualX.toFixed(2)}, ${virtualZ.toFixed(2)})`,
      `Normalized: (${worldPos.normalizedX.toFixed(4)}, ${worldPos.normalizedZ.toFixed(4)})`,
      `From point: ${pickInfo.pickedPoint.toString()}`
    );

    // Use the global game instance's teleport method
    if (window.game && window.game.teleportToVirtualPosition) {
      const success = await window.game.teleportToVirtualPosition(
        new Vector3(virtualX, 0, virtualZ)
      );

      if (!success) {
        console.warn('GlobalMap: Teleportation failed - saving for retry');
        // Store target for retry
        localStorage.setItem(
          'pendingTeleport',
          JSON.stringify({
            x: virtualX,
            z: virtualZ,
            timestamp: Date.now(),
          })
        );
      }
    } else {
      console.error('GlobalMap: Game instance not available for teleport');
    }
  }

  private async addPlayerMarker(): Promise<void> {
    if (!this.globeMesh) return;

    // Use SharedPlayerState instead of direct mesh finding
    const playerState = SharedPlayerState.getInstance();
    const normalizedPos = playerState.getNormalizedPosition();

    if (!normalizedPos) {
      console.error('GlobalMap: Cannot determine player position for marker');
      return;
    }

    console.log(
      'GlobalMap: Player position:',
      `Normalized: (${normalizedPos.x.toFixed(4)}, ${normalizedPos.z.toFixed(4)})`,
      `Virtual: ${playerState.getVirtualPosition()?.toString() || 'unknown'}`
    );

    // Use the helper method to convert world to globe position
    const markerPosition = this.worldToGlobePosition(normalizedPos.x, normalizedPos.z);

    // Create a bright, visible player marker
    const marker = MeshBuilder.CreateSphere(
      'playerMarker',
      { diameter: 0.2 }, // Make it larger for visibility
      this.scene
    );
    marker.position = markerPosition;

    // Make it stand out with high visibility
    const markerMaterial = new StandardMaterial('markerMaterial', this.scene);
    markerMaterial.diffuseColor = new Color3(1, 0, 0); // Bright red
    markerMaterial.emissiveColor = new Color3(1, 0, 0); // Make it glow
    markerMaterial.specularColor = new Color3(1, 1, 1);
    marker.material = markerMaterial;

    console.log('GlobalMap: Created player marker at:', marker.position.toString());
  }

  private createGlobalMapUI(): void {
    // Create fullscreen UI
    this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('GlobalMapUI');

    // Create close button
    const closeButton = Button.CreateSimpleButton('closeButton', 'Close Map');
    closeButton.width = '150px';
    closeButton.height = '40px';
    closeButton.color = 'white';
    closeButton.background = 'red';
    closeButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeButton.top = '10px';
    closeButton.left = '-160px'; // Position from right edge
    closeButton.onPointerClickObservable.add(() => {
      this.closeGlobalMap();
      this.isOpen = false;
    });

    this.advancedTexture.addControl(closeButton);

    // Add instructions
    const instructions = new TextBlock(
      'instructions',
      'Drag to rotate the globe\nScroll to zoom in/out\nClick on a location to teleport'
    );
    instructions.width = '300px';
    instructions.height = '100px';
    instructions.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    instructions.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    instructions.left = '10px';
    instructions.top = '-110px'; // Position from bottom
    instructions.color = 'white';
    instructions.fontFamily = 'Arial';
    instructions.fontSize = 14;

    this.advancedTexture.addControl(instructions);

    // Add player coordinates display
    this.playerCoordinatesText = new TextBlock('playerCoords', 'Current: Unknown');
    this.playerCoordinatesText.width = '300px';
    this.playerCoordinatesText.height = '40px';
    this.playerCoordinatesText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.playerCoordinatesText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.playerCoordinatesText.top = '10px';
    this.playerCoordinatesText.color = 'white';
    this.playerCoordinatesText.fontFamily = 'Arial';
    this.playerCoordinatesText.fontSize = 14;
    this.advancedTexture.addControl(this.playerCoordinatesText);

    // Add target coordinates display
    this.targetCoordinatesText = new TextBlock('targetCoords', 'Target: None');
    this.targetCoordinatesText.width = '400px'; // Wider to accommodate longer text
    this.targetCoordinatesText.height = '40px';
    this.targetCoordinatesText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER; // Center horizontally
    this.targetCoordinatesText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // Top of screen
    this.targetCoordinatesText.top = '30px'; // 20px from the top
    this.targetCoordinatesText.color = 'lime';
    this.targetCoordinatesText.fontFamily = 'Arial';
    this.targetCoordinatesText.fontSize = 16; // Slightly larger
    this.targetCoordinatesText.outlineWidth = 1; // Add outline for better visibility
    this.targetCoordinatesText.outlineColor = 'black';
    this.advancedTexture.addControl(this.targetCoordinatesText);

    // Initial update of player coordinates
    this.updatePlayerCoordinates();
  }

  /**
   * Updates the player coordinates text
   */
  private updatePlayerCoordinates(): void {
    if (!this.playerCoordinatesText) return;

    const playerState = SharedPlayerState.getInstance();
    const virtualPos = playerState.getVirtualPosition();

    if (virtualPos) {
      const coordText = this.formatAsSector(virtualPos.x, virtualPos.z);
      this.playerCoordinatesText.text = `Current: ${coordText}`;
    } else {
      this.playerCoordinatesText.text = 'Current: Unknown';
    }
  }

  /**
   * Updates the target coordinates text
   */
  private updateTargetCoordinates(globalPoint: Vector3): void {
    if (!this.targetCoordinatesText) return;

    const worldPos = this.globeToWorldPosition(globalPoint);
    const virtualX = worldPos.normalizedX * WorldManager.WORLD_WIDTH;
    const virtualZ = worldPos.normalizedZ * WorldManager.WORLD_HEIGHT;

    const coordText = this.formatAsSector(virtualX, virtualZ);
    this.targetCoordinatesText.text = `Target: ${coordText}`;
  }

  private closeGlobalMap(): void {
    // Clean up observers first
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    if (this.cameraObserver && this.mapCamera) {
      this.mapCamera.onViewMatrixChangedObservable.remove(this.cameraObserver);
      this.cameraObserver = null;
    }

    // Reset pointer events
    this.scene.onPointerDown = () => {
      // Do nothing
    };

    // Release camera controls
    if (this.mapCamera) {
      this.mapCamera.detachControl();
    }

    // Restore original camera
    if (this.originalCamera) {
      this.scene.activeCamera = this.originalCamera;
      if (this.originalCamera instanceof ArcRotateCamera) {
        this.originalCamera.attachControl(true);
      }
    }

    // Remove the globe mesh
    if (this.globeMesh) {
      this.globeMesh.dispose();
      this.globeMesh = null;

      // Also dispose the player marker
      const marker = this.scene.getMeshByName('playerMarker');
      if (marker) marker.dispose();
    }

    // Dispose target marker
    if (this.targetMarker) {
      this.targetMarker.dispose();
      this.targetMarker = null;
    }

    // Dispose light
    if (this.mapLight) {
      this.mapLight.dispose();
      this.mapLight = null;
    }

    // Dispose skybox
    if (this.mapSkybox) {
      this.mapSkybox.dispose();
      this.mapSkybox = null;
    }

    // Remove the UI
    if (this.advancedTexture) {
      console.log('Disposing GlobalMap UI');
      this.advancedTexture.dispose();
      this.advancedTexture = null;
    }

    this.playerCoordinatesText = null;
    this.targetCoordinatesText = null;
  }
  private createSkybox(): void {
    // Create the skybox
    this.mapSkybox = MeshBuilder.CreateBox('mapSkyBox', { size: 200.0 }, this.scene); // Reduced size

    // Create skybox material
    const skyboxMaterial = new StandardMaterial('mapSkyBoxMaterial', this.scene);
    skyboxMaterial.backFaceCulling = false;

    // Correct the path - remove the extra "skybox" at the end
    skyboxMaterial.reflectionTexture = new CubeTexture(
      '/resources/graphics/textures/skybox/skybox', // skybox/skybox is correct, it's a folder called skybox with images named skybox_nx.jpg, etc. inside
      this.scene
    );
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skyboxMaterial.disableLighting = true;
    skyboxMaterial.fogEnabled = false;

    // Apply the material to the skybox mesh
    this.mapSkybox.material = skyboxMaterial;

    // Make sure the skybox is rendered behind everything else
    this.mapSkybox.infiniteDistance = true;

    // This is crucial for visibility - ensure it's rendered first
    this.mapSkybox.renderingGroupId = 0;
  }

  private addTargetMarker(): void {
    // Create a more visible target marker
    const targetMarker = MeshBuilder.CreateSphere('targetMarker', { diameter: 0.25 }, this.scene); // Larger diameter
    const markerMaterial = new StandardMaterial('targetMarkerMaterial', this.scene);
    markerMaterial.diffuseColor = new Color3(0, 1, 0);
    markerMaterial.emissiveColor = new Color3(0, 1, 0);
    markerMaterial.alpha = 0.8; // Slightly transparent but still very visible
    targetMarker.material = markerMaterial;
    targetMarker.isPickable = false; // Ensure it doesn't interfere with globe picking
    targetMarker.position = new Vector3(0, 0, 0);

    // Store reference
    this.targetMarker = targetMarker;

    // Update target position on camera movement
    const updateTargetPosition = () => {
      if (!this.isOpen || !this.globeMesh || !this.mapCamera) return;

      // Get the center of the screen
      const engine = this.scene.getEngine();
      const centerX = engine.getRenderWidth() / 2;
      const centerY = engine.getRenderHeight() / 2;

      // Cast ray from camera to globe using screen center
      const ray = this.scene.createPickingRay(centerX, centerY, Matrix.Identity(), this.mapCamera);

      const hit = this.scene.pickWithRay(ray);
      if (hit && hit.hit && hit.pickedMesh === this.globeMesh && hit.pickedPoint) {
        // Update target marker position - place directly at the picked point
        targetMarker.position = hit.pickedPoint.clone();

        // Add a larger offset to ensure visibility above surface
        const normal = hit.getNormal() || new Vector3(0, 1, 0);
        targetMarker.position.addInPlace(normal.scale(0.05)); // Increased offset for visibility

        // Make sure target is visible
        targetMarker.visibility = 1;
        this.updateTargetCoordinates(hit.pickedPoint);
      } else {
        // Hide target when not hitting the globe
        targetMarker.visibility = 0;
      }
    };

    // Initial position update
    updateTargetPosition();

    // Remove any existing observers first
    if (this.cameraObserver && this.mapCamera) {
      this.mapCamera.onViewMatrixChangedObservable.remove(this.cameraObserver);
      this.cameraObserver = null;
    }

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    // Register and track new observers
    if (this.mapCamera) {
      this.cameraObserver = this.mapCamera.onViewMatrixChangedObservable.add(updateTargetPosition);
    }

    // Register and track render observer
    this.renderObserver = this.scene.onBeforeRenderObservable.add(updateTargetPosition);
  }
}

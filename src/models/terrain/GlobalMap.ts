import {
  Scene as BabylonScene,
  Mesh,
  AbstractMesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Vector3,
  ArcRotateCamera,
  Color3,
  Ray,
  PickingInfo,
  HemisphericLight,
  Matrix,
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

    // Create a new camera for the globe view
    this.mapCamera = new ArcRotateCamera(
      'mapCamera',
      Math.PI / 2,
      Math.PI / 2,
      10,
      Vector3.Zero(),
      this.scene
    );
    this.mapCamera.minZ = 0.05;
    this.mapCamera.wheelPrecision = 20;
    // this.mapCamera.upperBetaLimit = Math.PI / 2;
    this.mapCamera.lowerRadiusLimit = 4;
    this.mapCamera.upperRadiusLimit = 25;

    this.mapCamera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
    this.scene.activeCamera = this.mapCamera;

    // Create the globe mesh
    await this.createGlobeMesh();

    // Create UI for the global map
    this.createGlobalMapUI();
  }

  private async createGlobeMesh(): Promise<void> {
    // Create a sphere to represent Mars with higher quality
    this.globeMesh = MeshBuilder.CreateSphere(
      'marsSphere',
      { diameter: 5, segments: 128 },
      this.scene
    );

    // Create material with Mars texture
    const marsMaterial = new StandardMaterial('marsMaterial', this.scene);
    marsMaterial.diffuseTexture = new Texture(
      '/resources/images/mars/mars_2k_color.jpg',
      this.scene,
      false, // NoMipmap
      true, // InvertY
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

    // Add texture loading logging
    // marsMaterial.diffuseTexture.isReadyOrNotBlocking.add(() => {
    //   console.log("Mars texture loaded successfully");
    // });

    marsMaterial.bumpTexture = new Texture('/resources/images/mars/mars_2k_normal.jpg', this.scene);

    this.globeMesh.material = marsMaterial;

    // Add a marker for the player's position
    await this.addPlayerMarker();

    // Add a target marker that follows mouse position
    this.addTargetMarker();

    // Add click event for teleportation
    this.globeMesh.isPickable = true;
    this.scene.onPointerDown = (evt, pickInfo) => {
      if (pickInfo.hit && pickInfo.pickedMesh === this.globeMesh) {
        this.teleportPlayerToLocation(pickInfo);
      }
    };
  }

  private async teleportPlayerToLocation(pickInfo: PickingInfo): Promise<void> {
    if (!this.globeMesh || !pickInfo.pickedPoint) {
      console.error('GlobalMap: Invalid pick info for teleportation');
      return;
    }

    console.log('GlobalMap: Teleporting to point:', pickInfo.pickedPoint.toString());

    // Close the map first to restore normal view
    this.closeGlobalMap();
    this.isOpen = false;

    // Show mini map again
    if (window.miniMap) {
      window.miniMap.show();
    }

    // Calculate virtual world coordinates from globe position
    const direction = pickInfo.pickedPoint.normalize();
    const longitude = Math.atan2(direction.z, direction.x);
    const latitude = Math.asin(direction.y);

    // Convert to normalized 0-1 range
    const normalizedX = (longitude + Math.PI) / (2 * Math.PI);
    const normalizedZ = (latitude + Math.PI / 2) / Math.PI;

    // Convert to virtual coordinates - IMPORTANT: Use proper coordinate mapping
    // Z and X are intentionally assigned as shown to match Mars coordinate system
    const virtualX = normalizedX * WorldManager.WORLD_WIDTH; // X in Mars system
    const virtualZ = normalizedZ * WorldManager.WORLD_HEIGHT; // Z in Mars system

    console.log(
      'GlobalMap: Teleport calculated:',
      `Virtual: (${virtualX.toFixed(2)}, ${virtualZ.toFixed(2)})`,
      `Normalized: (${normalizedX.toFixed(4)}, ${normalizedZ.toFixed(4)})`
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

    // Convert to spherical coordinates
    const longitude = normalizedPos.x * 2 * Math.PI - Math.PI;
    const latitude = normalizedPos.z * Math.PI - Math.PI / 2;

    // Create visible marker on globe surface
    const radius = 2.55; // Slightly above globe surface
    const x = radius * Math.cos(latitude) * Math.cos(longitude);
    const y = radius * Math.sin(latitude);
    const z = radius * Math.cos(latitude) * Math.sin(longitude);

    // Create a bright, visible player marker
    const marker = MeshBuilder.CreateSphere(
      'playerMarker',
      { diameter: 0.2 }, // Make it larger for visibility
      this.scene
    );
    marker.position = new Vector3(x, y, z);

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
  }

  private closeGlobalMap(): void {
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

    // Remove the UI
    if (this.advancedTexture) {
      this.advancedTexture.dispose();
      this.advancedTexture = null;
    }
  }
  private addTargetMarker(): void {
    // Create target marker
    const targetMarker = MeshBuilder.CreateSphere('targetMarker', { diameter: 0.15 }, this.scene);
    const markerMaterial = new StandardMaterial('targetMarkerMaterial', this.scene);
    markerMaterial.diffuseColor = new Color3(0, 1, 0);
    markerMaterial.emissiveColor = new Color3(0, 1, 0);
    targetMarker.material = markerMaterial;
    targetMarker.position = new Vector3(0, 0, 0);

    // Store reference
    this.targetMarker = targetMarker;

    // Update target position on pointer move
    this.scene.onPointerMove = (evt) => {
      if (!this.isOpen || !this.globeMesh) return;

      // Cast ray from camera to globe
      const ray = this.scene.createPickingRay(
        this.scene.pointerX,
        this.scene.pointerY,
        Matrix.Identity(),
        this.mapCamera
      );

      const hit = this.scene.pickWithRay(ray);
      if (hit && hit.hit && hit.pickedMesh === this.globeMesh && hit.pickedPoint) {
        // Update target marker position
        targetMarker.position = hit.pickedPoint.clone();
        targetMarker.position.normalize().scaleInPlace(2.6); // Slightly above surface
      }
    };
  }
}

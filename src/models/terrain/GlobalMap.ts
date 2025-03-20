import {
  Scene as BabylonScene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Vector3,
  ArcRotateCamera,
  Color3,
  Ray,
  PickingInfo,
} from "@babylonjs/core";
import WorldManager from "./WorldManager";
import {
  AdvancedDynamicTexture,
  Control,
  Button,
  TextBlock,
} from "@babylonjs/gui";

// Global declarations are now in global.d.ts

export default class GlobalMap {
  private scene: BabylonScene;
  private advancedTexture: AdvancedDynamicTexture | null = null;
  private mapContainer: Control | null = null;
  private globeMesh: Mesh | null = null;
  private originalCamera: ArcRotateCamera | null = null;
  private mapCamera: ArcRotateCamera | null = null;
  private isOpen = false;

  constructor(scene: BabylonScene) {
    this.scene = scene;

    // Listen for 'M' key press to toggle the map
    window.addEventListener("keydown", (event) => {
      if (event.key === "m" || event.key === "M") {
        this.toggleGlobalMap();
      }
    });
  }

  private toggleGlobalMap(): void {
    if (this.isOpen) {
      this.closeGlobalMap();
    } else {
      this.openGlobalMap();
    }
    this.isOpen = !this.isOpen;
  }

  private openGlobalMap(): void {
    // Store the original camera
    this.originalCamera = this.scene.activeCamera as ArcRotateCamera;

    // Create a new camera for the globe view
    this.mapCamera = new ArcRotateCamera(
      "mapCamera",
      Math.PI / 2,
      Math.PI / 2,
      10,
      Vector3.Zero(),
      this.scene
    );
    this.mapCamera.attachControl(
      this.scene.getEngine().getRenderingCanvas(),
      true
    );
    this.scene.activeCamera = this.mapCamera;

    // Create the globe mesh
    this.createGlobeMesh();

    // Create UI for the global map
    this.createGlobalMapUI();
  }

  private createGlobeMesh(): void {
    // Create a sphere to represent Mars with higher quality
    this.globeMesh = MeshBuilder.CreateSphere(
      "marsSphere",
      { diameter: 5, segments: 64 },
      this.scene
    );

    // Create material with Mars texture
    const marsMaterial = new StandardMaterial("marsMaterial", this.scene);
    marsMaterial.diffuseTexture = new Texture(
      "/resources/images/mars/mars_2k_color.jpg",
      this.scene,
      false, // NoMipmap
      true, // InvertY
      Texture.TRILINEAR_SAMPLINGMODE
    );
    marsMaterial.diffuseTexture.hasAlpha = false;
    marsMaterial.diffuseColor = new Color3(0.5, 0.3, 0.2); // Fallback color

    // Add texture loading logging
    // marsMaterial.diffuseTexture.isReadyOrNotBlocking.add(() => {
    //   console.log("Mars texture loaded successfully");
    // });

    marsMaterial.bumpTexture = new Texture(
      "/resources/images/mars/mars_2k_normal.jpg",
      this.scene
    );

    marsMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    this.globeMesh.material = marsMaterial;

    // Add a marker for the player's position
    this.addPlayerMarker();

    // Add click event for teleportation
    this.globeMesh.isPickable = true;
    this.scene.onPointerDown = (evt, pickInfo) => {
      if (pickInfo.hit && pickInfo.pickedMesh === this.globeMesh) {
        this.teleportPlayerToLocation(pickInfo);
      }
    };
  }

  private teleportPlayerToLocation(pickInfo: PickingInfo): void {
    if (!this.globeMesh || !pickInfo.pickedPoint) return;

    // Get the picked point on the sphere
    const pickedPoint = pickInfo.pickedPoint;

    // Convert to spherical coordinates
    // Normalize the point to get direction from center
    const direction = pickedPoint.normalize();

    // Calculate longitude and latitude
    // longitude: -π to π, latitude: -π/2 to π/2
    const longitude = Math.atan2(direction.z, direction.x);
    const latitude = Math.asin(direction.y);

    // Convert to world coordinates
    // Scale based on the Mars terrain dimensions
    const worldX = (longitude / (2 * Math.PI) + 0.5) * WorldManager.WORLD_WIDTH;
    const worldZ = (latitude / Math.PI + 0.5) * WorldManager.WORLD_HEIGHT;

    // Close the map
    this.closeGlobalMap();
    this.isOpen = false;

    // Teleport the player
    const playerId = window.store?.getPlayerId() || "";
    const player = this.scene.getMeshByName("playerFoot_" + playerId);
    if (player) {
      // Create a temporary marker at the teleport location
      const marker = MeshBuilder.CreateSphere(
        "teleportMarker",
        { diameter: 1 },
        this.scene
      );
      marker.position = new Vector3(worldX, 1000, worldZ); // Start high up
      marker.material = new StandardMaterial("teleportMarkerMat", this.scene);
      (marker.material as StandardMaterial).emissiveColor = new Color3(0, 1, 0);

      // Raycast down to find terrain height
      const ray = new Ray(
        new Vector3(worldX, 1000, worldZ),
        new Vector3(0, -1, 0),
        2000
      );
      const pickInfo = this.scene.pickWithRay(ray);

      if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
        // Convert to virtual coordinates
        const virtualX = pickInfo.pickedPoint.x;
        const virtualZ = pickInfo.pickedPoint.z;

        // Update world origin before moving player
        WorldManager.updateOrigin(new Vector3(virtualX, 0, virtualZ));

        // Teleport player to the hit point
        player.position.x = pickInfo.pickedPoint.x;
        player.position.y = pickInfo.pickedPoint.y + 2; // Add small offset to prevent clipping
        player.position.z = pickInfo.pickedPoint.z;

        // Notify any player controller or physics system
        if (
          window.playerController &&
          typeof window.playerController.teleportTo === "function"
        ) {
          window.playerController.teleportTo(
            pickInfo.pickedPoint.x,
            pickInfo.pickedPoint.z
          );
        }
      } else {
        // Fallback if raycast fails
        player.position.x = worldX;
        player.position.z = worldZ;

        // Try to find terrain height
        if (window.terrainManager?.updateChunks) {
          // Request terrain chunk to be loaded at this position
          window.terrainManager.updateChunks(new Vector3(worldX, 0, worldZ));
        }
      }

      // Remove the marker after a short delay
      setTimeout(() => {
        marker.dispose();
      }, 2000);
    }
  }

  private addPlayerMarker(): void {
    if (!this.globeMesh) return;

    // Get player position
    const playerId = window.store?.getPlayerId() || "";
    const playerMesh = this.scene.getMeshByName("playerFoot_" + playerId);
    if (!playerMesh) return;

    // Get player position and convert to virtual coordinates
    const playerPosition = playerMesh.position;
    if (!playerPosition) return;
    
    const virtualPos = WorldManager.toVirtual(playerPosition);

    // Convert virtual coordinates to normalized coordinates (0-1 range)
    const normalizedX = virtualPos.x / WorldManager.WORLD_WIDTH;
    const normalizedZ = virtualPos.z / WorldManager.WORLD_HEIGHT;

    // Convert normalized coordinates to spherical coordinates
    const radius = 2.55; // Slightly larger than the globe radius
    const longitude = normalizedX * Math.PI * 2;
    const latitude = normalizedZ * Math.PI;

    // Convert to Cartesian coordinates on the sphere
    const x = radius * Math.cos(latitude) * Math.cos(longitude);
    const y = radius * Math.sin(latitude);
    const z = radius * Math.cos(latitude) * Math.sin(longitude);

    // Create a small sphere to mark the player's position
    const marker = MeshBuilder.CreateSphere(
      "playerMarker",
      { diameter: 0.1 },
      this.scene
    );
    marker.position = new Vector3(x, y, z);

    const markerMaterial = new StandardMaterial("markerMaterial", this.scene);
    markerMaterial.diffuseColor = new Color3(1, 1, 1);
    markerMaterial.emissiveColor = new Color3(1, 1, 1);
    marker.material = markerMaterial;
    
    console.log("Global map marker position:", 
      `Normalized: (${normalizedX.toFixed(4)}, ${normalizedZ.toFixed(4)})`,
      `Sphere: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`
    );
  }

  private createGlobalMapUI(): void {
    // Create fullscreen UI
    this.advancedTexture =
      AdvancedDynamicTexture.CreateFullscreenUI("GlobalMapUI");

    // Create close button
    const closeButton = Button.CreateSimpleButton("closeButton", "Close Map");
    closeButton.width = "150px";
    closeButton.height = "40px";
    closeButton.color = "white";
    closeButton.background = "red";
    closeButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeButton.top = "10px";
    closeButton.left = "-160px"; // Position from right edge
    closeButton.onPointerClickObservable.add(() => {
      this.closeGlobalMap();
      this.isOpen = false;
    });

    this.advancedTexture.addControl(closeButton);

    // Add instructions
    const instructions = new TextBlock(
      "instructions",
      "Drag to rotate the globe\nScroll to zoom in/out\nClick on a location to teleport"
    );
    instructions.width = "300px";
    instructions.height = "100px";
    instructions.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    instructions.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    instructions.left = "10px";
    instructions.top = "-110px"; // Position from bottom
    instructions.color = "white";
    instructions.fontFamily = "Arial";
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
      const marker = this.scene.getMeshByName("playerMarker");
      if (marker) marker.dispose();
    }

    // Remove the UI
    if (this.advancedTexture) {
      this.advancedTexture.dispose();
      this.advancedTexture = null;
    }
  }
}

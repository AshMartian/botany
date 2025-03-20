import { Texture, Vector3, Scene as BabylonScene } from "@babylonjs/core";
import WorldManager from "./WorldManager";
import {
  AdvancedDynamicTexture,
  Image,
  Control,
  Rectangle,
  Container,
} from "@babylonjs/gui";

declare global {
  interface Math {
    clamp(value: number, min: number, max: number): number;
  }
}

// Add clamp utility function
Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);

declare global {
  interface Window {
    store?: any;
  }
}

export default class MiniMap {
  private scene: BabylonScene;
  private advancedTexture: AdvancedDynamicTexture;
  private mapContainer: Rectangle;
  private playerMarker: Rectangle;
  private patchGrid: Container;
  private mapSize: number;
  private patchSize: number;
  private totalPatches: { x: number; y: number };

  constructor(scene: BabylonScene) {
    this.scene = scene;
    this.mapSize = 200; // Size of the minimap in pixels
    this.patchSize = 71; // Size of each patch
    this.totalPatches = { x: 72, y: 144 }; // Corrected: 72 X patches, 144 Z patches

    // Create fullscreen UI
    this.advancedTexture =
      AdvancedDynamicTexture.CreateFullscreenUI("MiniMapUI");

    // Create map container
    this.mapContainer = new Rectangle();
    this.mapContainer.width = this.mapSize + "px";
    this.mapContainer.height = this.mapSize + "px";
    this.mapContainer.thickness = 2;
    this.mapContainer.background = "black";
    this.mapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.mapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.mapContainer.top = "10px";
    this.mapContainer.left = "-210px"; // Position from right edge
    this.advancedTexture.addControl(this.mapContainer);

    // Create patch grid container
    this.patchGrid = new Container();
    this.patchGrid.width = "100%";
    this.patchGrid.height = "100%";

    // Create player marker
    this.playerMarker = new Rectangle();
    this.playerMarker.width = "10px";
    this.playerMarker.height = "10px";
    this.playerMarker.thickness = 0;
    this.playerMarker.background = "white";
    this.playerMarker.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.playerMarker.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.mapContainer.addControl(this.playerMarker);

    // Initialize map
    this.initializeMap();

    // Update player position on the map
    scene.onBeforeRenderObservable.add(() => {
      this.updatePlayerPosition();
    });
  }

  private initializeMap(): void {
    // Load the background map image
    const mapBackground = new Image(
      "mapBackground",
      "/resources/images/default_minimap.png"
    ) as Image;
    mapBackground.width = "100%";
    mapBackground.height = "100%";
    mapBackground.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mapBackground.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.mapContainer.addControl(mapBackground);

    // Add event listener to open global map
    this.mapContainer.onPointerClickObservable.add(() => {
      this.openGlobalMap();
    });
  }

  private updatePlayerPosition(): void {
    // Get player position
    const playerId = window.store?.getPlayerId() || "";
    const playerMesh = this.scene.getMeshByName("playerFoot_" + playerId);
    if (!playerMesh) return;

    const playerPosition = playerMesh.position;
    // Convert to virtual coordinates for map positioning
    const virtualPos = WorldManager.toVirtual(playerPosition);

    // Calculate player position on the map
    // Convert world coordinates to patch coordinates
    const patchX =
      Math.floor(virtualPos.z / this.patchSize) % this.totalPatches.x;
    const patchZ =
      Math.floor(virtualPos.x / this.patchSize) % this.totalPatches.y;

    // Validate patch coordinates
    if (isNaN(patchX) || isNaN(patchZ)) {
      console.error("Invalid patch coordinates:", virtualPos);
      return;
    }

    // Convert patch coordinates to minimap coordinates
    const mapX = (patchX / this.totalPatches.x) * this.mapSize;
    const mapY = (patchZ / this.totalPatches.y) * this.mapSize;

    // Update player marker position
    this.playerMarker.left = mapX - this.mapSize / 2 + "px";
    this.playerMarker.top = mapY - this.mapSize / 2 + "px";

    // Update visible map area
    this.updateVisibleMapArea(patchX, patchZ);
    
    // Log virtual position for debugging
    if (window.store?.debug) {
      console.log("Player virtual position:", 
        `X: ${virtualPos.x.toFixed(2)}/${WorldManager.WORLD_WIDTH}`, 
        `Z: ${virtualPos.z.toFixed(2)}/${WorldManager.WORLD_HEIGHT}`,
        `Patch: (${patchX}, ${patchZ})`
      );
    }
  }

  private updateVisibleMapArea(patchX: number, patchZ: number): void {
    // Ensure patchGrid is cleared and readded
    if (this.patchGrid.parent) {
      this.patchGrid.parent.removeControl(this.patchGrid);
    }
    this.mapContainer.addControl(this.patchGrid);

    // Remove all previous patch images
    while (this.patchGrid.children.length > 0) {
      this.patchGrid.removeControl(this.patchGrid.children[0]);
    }

    // Load 3x3 grid of patches around current position with timeout to allow texture loading
    setTimeout(() => {
      const visibleRadius = 1;
      for (let dx = -visibleRadius; dx <= visibleRadius; dx++) {
        for (let dy = -visibleRadius; dy <= visibleRadius; dy++) {
          const currentPatchX = Math.clamp(
            patchX + dx,
            0,
            this.totalPatches.x - 1
          );
          const currentPatchZ = Math.clamp(
            patchZ + dy,
            0,
            this.totalPatches.y - 1
          );

          const img = new Image(
            `patch_${currentPatchX}_${currentPatchZ}`,
            `https://ashmartian.com/mars/patch_${currentPatchX}_${currentPatchZ}_color.jpg`
          );

          // Position images in grid layout
          img.width = this.mapSize / 3 + "px";
          img.height = this.mapSize / 3 + "px";
          img.left = (dx + 1) * (this.mapSize / 3) - this.mapSize / 2 + "px";
          img.top = (dy + 1) * (this.mapSize / 3) - this.mapSize / 2 + "px";
          img.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
          img.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

          this.patchGrid.addControl(img);
        }
      }
    }, 50);
  }

  private openGlobalMap(): void {
    // Implementation for opening the global map
    console.log("Opening global map...");
    // This would create a full-screen UI with the global map
    // and allow the player to interact with it
  }
}

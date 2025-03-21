import { Vector3, Scene as BabylonScene } from '@babylonjs/core';
import SharedPlayerState from '@/models/player/SharedPlayerState';
import WorldManager from './WorldManager';
import { AdvancedDynamicTexture, Image, Control, Rectangle, TextBlock, Grid } from '@babylonjs/gui';

export default class MiniMap {
  private scene: BabylonScene;
  private advancedTexture: AdvancedDynamicTexture;
  private mapContainer: Rectangle;
  private playerMarker: Rectangle;
  private mapGrid: Grid;
  private mapSize: number;
  private lastChunkX = -1;
  private lastChunkZ = -1;

  constructor(scene: BabylonScene) {
    this.scene = scene;
    this.mapSize = 200; // Size in pixels

    // Create fullscreen UI
    this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('MiniMapUI');

    // Create map container
    this.mapContainer = new Rectangle();
    this.mapContainer.width = this.mapSize + 'px';
    this.mapContainer.height = this.mapSize + 'px';
    this.mapContainer.thickness = 2;
    this.mapContainer.background = 'rgba(0, 0, 0, 0.5)';
    this.mapContainer.cornerRadius = 5;
    this.mapContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.mapContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.mapContainer.top = '10px';
    this.mapContainer.left = '-10px';
    this.advancedTexture.addControl(this.mapContainer);

    // Create a 3x3 grid for map tiles
    this.mapGrid = new Grid();
    this.mapGrid.width = '100%';
    this.mapGrid.height = '100%';
    for (let i = 0; i < 3; i++) {
      this.mapGrid.addRowDefinition(1 / 3);
      this.mapGrid.addColumnDefinition(1 / 3);
    }
    this.mapContainer.addControl(this.mapGrid);

    // Create player marker (white dot)
    this.playerMarker = new Rectangle();
    this.playerMarker.width = '10px';
    this.playerMarker.height = '10px';
    this.playerMarker.cornerRadius = 5;
    this.playerMarker.thickness = 0;
    this.playerMarker.background = 'white';
    this.playerMarker.zIndex = 10; // Ensure it's on top
    this.mapContainer.addControl(this.playerMarker);

    // Add click handler to open global map
    this.mapContainer.onPointerClickObservable.add(() => {
      if (window.globalMap) {
        // We'll add an open() method to GlobalMap
        if (typeof window.globalMap.open === 'function') {
          window.globalMap.open();
        }
      }
    });

    // Fill with default colored tiles
    this.createDefaultTiles();

    // Update on each frame
    scene.onBeforeRenderObservable.add(() => {
      this.updatePlayerPosition();
    });
  }

  private createDefaultTiles(): void {
    // Create a fallback grid of colored tiles for testing
    const colors = [
      '#8B4513',
      '#965C1F',
      '#8B4513', // Row 1
      '#A05717',
      '#AA6A2B',
      '#A05717', // Row 2
      '#8B4513',
      '#965C1F',
      '#8B4513', // Row 3
    ];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const rect = new Rectangle();
        rect.background = colors[row * 3 + col];
        rect.thickness = 0.5;
        this.mapGrid.addControl(rect, row, col);
      }
    }
  }

  private updatePlayerPosition(): void {
    // Use the shared player state
    const playerState = SharedPlayerState.getInstance();
    const virtualPos = playerState.getVirtualPosition();

    if (!virtualPos) return;

    // Calculate which chunk the player is in
    const chunkSize = 128;
    const chunkX = Math.floor(virtualPos.x / chunkSize);
    const chunkZ = Math.floor(virtualPos.z / chunkSize);

    // Calculate local position within current chunk (0-1)
    const localX = (virtualPos.x % chunkSize) / chunkSize;
    const localZ = (virtualPos.z % chunkSize) / chunkSize;

    // Update player marker position - center in the middle chunk
    const centerChunkSize = this.mapSize / 3;
    const mapX = centerChunkSize + localX * centerChunkSize;
    const mapZ = centerChunkSize + localZ * centerChunkSize;

    // Position the player marker relative to the container center
    this.playerMarker.left = mapX - this.mapSize / 2 + 'px';
    this.playerMarker.top = mapZ - this.mapSize / 2 + 'px';

    // Update map tiles when player moves to a new chunk
    if (chunkX !== this.lastChunkX || chunkZ !== this.lastChunkZ) {
      this.updateMapTiles(chunkX, chunkZ);
      this.lastChunkX = chunkX;
      this.lastChunkZ = chunkZ;
    }
  }

  private updateMapTiles(centerChunkX: number, centerChunkZ: number): void {
    console.log(`MiniMap: Updating tiles around chunk (${centerChunkX}, ${centerChunkZ})`);

    // Ensure chunk coordinates are within valid range
    centerChunkX = Math.max(0, Math.min(71, centerChunkX));
    centerChunkZ = Math.max(0, Math.min(143, centerChunkZ));

    // Clear grid
    this.mapGrid.children.slice().forEach((child) => {
      this.mapGrid.removeControl(child);
    });

    // Load 3x3 grid of tiles around current position
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        // Calculate chunk coordinates
        const chunkX = centerChunkX + (col - 1);
        const chunkZ = centerChunkZ + (row - 1);

        // Check if chunk is valid
        const isValidChunk = chunkX >= 0 && chunkX < 72 && chunkZ >= 0 && chunkZ < 144;

        // Create container for the tile
        const tileContainer = new Rectangle();
        tileContainer.thickness = 1;
        tileContainer.background = isValidChunk ? '#8B4513' : '#333333'; // Mars brown or dark gray for invalid
        this.mapGrid.addControl(tileContainer, row, col);

        // Only attempt to load valid chunks
        if (isValidChunk) {
          // Important: Z and X are intentionally swapped here based on the API format
          const imageUrl = `https://ashmartian.com/mars/patch_${chunkZ}_${chunkX}_color.jpg`;
          // Create image
          const tileImage = new Image(`map_tile_${chunkX}_${chunkZ}`, imageUrl);
          tileImage.stretch = Image.STRETCH_FILL;
          tileImage.width = '100%';
          tileImage.height = '100%';

          // Add image to container
          tileContainer.addControl(tileImage);
        }
      }
    }
  }

  public show(): void {
    this.mapContainer.isVisible = true;
  }

  public hide(): void {
    this.mapContainer.isVisible = false;
  }
}

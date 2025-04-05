// src/services/RegolithCollector.ts
import { PickingInfo, Vector3, Scene } from '@babylonjs/core';
import { InteractionHandler } from '@/services/CrosshairService';
import { useInventoryStore } from '@/stores/inventoryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { Regolith } from '@/models/inventory/items';
import TerrainModificationManager from '@/models/terrain/TerrainModificationManager';

/**
 * RegolithCollector - Handles regolith collection from terrain
 * Implements the InteractionHandler interface to integrate with the CrosshairService
 */
class RegolithCollector implements InteractionHandler {
  private lastCollectionTime = 0;
  private cooldownTime = 1000; // 1 second cooldown between collections
  private terrainHeightModifier = -5.0; // Depth of collection
  private scene: Scene | null = null;
  private modificationManager: TerrainModificationManager;

  constructor() {
    // Get the scene from the global scope if available
    this.scene = globalThis.scene || null;
    // Get the singleton terrain modification manager
    this.modificationManager = TerrainModificationManager.getInstance();
    if (this.scene) {
      this.modificationManager.setScene(this.scene);
    }
  }

  /**
   * Check if the player can interact with the terrain to collect regolith
   */
  public canInteract(hit: PickingInfo | null): boolean {
    // Check if the hit is valid
    if (!hit || !hit.pickedMesh) return false;

    // Check if the hit object is a terrain chunk
    const meshName = hit.pickedMesh.name.toLowerCase();
    if (!meshName.includes('terrain') && !meshName.includes('ground')) {
      return false;
    }

    // Check if we're on cooldown
    if (Date.now() - this.lastCollectionTime < this.cooldownTime) {
      return false;
    }

    // Check if player has space in inventory
    const inventoryStore = useInventoryStore();
    const playerStore = usePlayerStore();
    const playerId = playerStore.currentPlayerId;

    if (!playerId) return false;

    // Check if there's space for regolith
    return inventoryStore.hasSpaceForItem(new Regolith(1));
  }

  /**
   * Get the interaction text to display
   */
  public getInteractionText(): [string, string?] {
    // If on cooldown, show different message
    if (Date.now() - this.lastCollectionTime < this.cooldownTime) {
      const remainingTime = Math.ceil(
        (this.cooldownTime - (Date.now() - this.lastCollectionTime)) / 1000
      );
      return [`Collecting (${remainingTime}s)`];
    }

    return ['Collect Regolith', 'F'];
  }

  /**
   * Handle the actual interaction when triggered
   */
  public onInteract(hit: PickingInfo | null, key?: string): void {
    // Handle null hit case
    if (!hit) {
      console.warn('RegolithCollector: onInteract called with null hit.');
      return;
    }
    // Check canInteract using the provided hit
    if (!this.canInteract(hit)) return;

    const inventoryStore = useInventoryStore();
    const playerStore = usePlayerStore();
    const playerId = playerStore.currentPlayerId;

    if (!playerId) return;

    // Get the mesh and hit point
    const mesh = hit.pickedMesh;
    const hitPoint = hit.pickedPoint;

    if (!mesh || !hitPoint) return;

    // Modify terrain at the collection point if it's a terrain chunk
    if (mesh.name.toLowerCase().includes('terrain')) {
      // Apply the terrain modification using only the TerrainModificationManager
      this.modifyTerrainAtPoint(hit);
    }

    // Give regolith to the player using the Pinia store
    inventoryStore.addItem(playerId, new Regolith(1));

    // Update cooldown time
    this.lastCollectionTime = Date.now();

    // Show a success message
    console.log('Collected Regolith from terrain');
  }

  /**
   * Modify the terrain at a specific point - this is the core terrain modification function
   * that gets called when the user interacts with the terrain
   */
  private modifyTerrainAtPoint(hitInfo: PickingInfo): void {
    // If we don't have a hit position, just skip
    if (!hitInfo || !hitInfo.pickedMesh || !hitInfo.pickedPoint) {
      return;
    }

    try {
      const pickedMesh = hitInfo.pickedMesh;

      // Make sure we hit a terrain chunk
      if (!pickedMesh.metadata || !pickedMesh.metadata.isTerrainChunk) {
        return;
      }

      // Get mesh name which contains the chunk coordinates: terrain_chunk_X_Y
      const meshName = pickedMesh.name;

      // Extract chunk coordinates (the last two parts of the mesh name)
      const parts = meshName.split('_');
      const chunkX = parseInt(parts[parts.length - 2], 10);
      const chunkY = parseInt(parts[parts.length - 1], 10);

      // Get world coordinates of hit point
      const worldX = hitInfo.pickedPoint.x;
      const worldZ = hitInfo.pickedPoint.z;

      // Use the terrain modification manager exclusively
      const chunkId = `${chunkX}_${chunkY}`;
      const brushRadius = 3; // 3 vertices radius for a smoother modification

      // Let the manager handle all the details of modifying the terrain
      this.modificationManager.modifyTerrainAtPoint(
        chunkId,
        worldX,
        worldZ,
        brushRadius,
        this.terrainHeightModifier
      );

      console.log(
        `[Terrain] Modified terrain at (${worldX.toFixed(1)}, ${worldZ.toFixed(1)}) with radius ${brushRadius}`
      );
    } catch (error) {
      console.error('Error modifying terrain:', error);
    }
  }
}

export default new RegolithCollector();

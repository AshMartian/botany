// src/services/RegolithCollector.ts
import { PickingInfo } from '@babylonjs/core';
import { InteractionHandler } from '@/services/CrosshairService';
import { useInventoryStore } from '@/stores/inventoryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { Regolith } from '@/models/inventory/items';

/**
 * RegolithCollector - Handles regolith collection from terrain
 * Implements the InteractionHandler interface to integrate with the CrosshairService
 */
class RegolithCollector implements InteractionHandler {
  private lastCollectionTime = 0;
  private cooldownTime = 1000; // 1 second cooldown between collections

  /**
   * Check if the player can interact with the terrain to collect regolith
   * @param hit The picking information from the raycast
   * @returns Whether interaction is possible
   */
  public canInteract(hit: PickingInfo): boolean {
    // Check if the hit is valid
    if (!hit.pickedMesh) return false;

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
   * @returns The interaction prompt text
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
   * @param hit The picking information from the raycast
   */
  public onInteract(hit: PickingInfo): void {
    if (!this.canInteract(hit)) return;

    const inventoryStore = useInventoryStore();
    const playerStore = usePlayerStore();
    const playerId = playerStore.currentPlayerId;

    if (!playerId) return;

    // Give regolith to the player using the Pinia store
    inventoryStore.addItem(playerId, new Regolith(1));

    // Update cooldown time
    this.lastCollectionTime = Date.now();

    // Show a success message
    console.log('Collected Regolith from terrain');
  }
}

export default new RegolithCollector();

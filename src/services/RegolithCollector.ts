// src/services/RegolithCollector.ts
import { PickingInfo } from '@babylonjs/core';
import { InteractionHandler } from '@/services/CrosshairService';
import playerInventory from '@/services/PlayerInventory';
import store from '@/store/store';
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
    if (!hit.pickedMesh.name.includes('terrain_chunk')) return false;

    // Check if we're within collection distance (redundant but safety check)
    if (hit.distance > 10) return false;

    if (!playerInventory.hasSpaceForResource(new Regolith(1))) return false;

    // Check cooldown
    const now = Date.now();
    if (now - this.lastCollectionTime < this.cooldownTime) return false;

    return true;
  }

  /**
   * Get the interaction text to show when looking at collectible regolith
   */
  public getInteractionText(): [string, string?] {
    return ['Collect Regolith'];
  }

  /**
   * Handle the actual interaction when triggered
   * @param hit The picking information from the raycast
   */
  public onInteract(hit: PickingInfo): void {
    if (!this.canInteract(hit)) return;

    const playerId = store.getSelfPlayerId();

    // Give regolith to the player
    playerInventory.giveItemToPlayer(playerId, new Regolith(1));

    // Update cooldown time
    this.lastCollectionTime = Date.now();

    // Show a success message
    console.log('Collected Regolith from terrain');
  }
}

export default new RegolithCollector();

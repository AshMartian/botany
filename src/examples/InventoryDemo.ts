// src/examples/InventoryDemo.ts
import store from '../store/store';
import { Metal, Silicon, Water, Regolith } from '../models/inventory/items/resources';
import { InventoryItem } from '@/models/inventory/InventoryItem';

/**
 * This file demonstrates how to use the inventory system
 * with the specialized resource items.
 */

export class InventoryDemo {
  /**
   * Initialize the player with some basic resource items
   * @param playerId The ID of the player to initialize
   */
  public static initializePlayerInventory(playerId: string): void {
    console.log(`Initializing inventory for player ${playerId}`);

    // Give player some metal resources
    const metal = new Metal();
    metal.quantity = 5;
    store.giveItemToPlayer(playerId, metal);

    // Give player some silicon resources
    const silicon = new Silicon();
    silicon.quantity = 3;
    store.giveItemToPlayer(playerId, silicon);

    // Give player some water resources
    const water = new Water();
    water.quantity = 10;
    store.giveItemToPlayer(playerId, water);

    // Give player some regolith resources
    const regolith = new Regolith();
    regolith.quantity = 15;
    store.giveItemToPlayer(playerId, regolith);

    // Alternative method: using the resource helper method
    store.giveResourceToPlayer(playerId, new Metal(2)); // Adds 2 more metal

    // Display the player's inventory
    const inventory = store.getPlayerInventory(playerId);
    console.log('Player inventory:', inventory);
  }

  /**
   * Subscribe to inventory changes for a player
   * @param playerId The ID of the player to track
   */
  public static trackInventoryChanges(playerId: string): void {
    store.subscribeToInventory(playerId, (inventory) => {
      console.log(`Inventory updated for player ${playerId}:`, inventory);
    });
  }

  /**
   * Handle player collecting a resource in the game world
   * @param playerId The ID of the player
   * @param resource The resource collected
   */
  public static collectResource(playerId: string, resource: InventoryItem): void {
    console.log(`Player ${playerId} collected ${resource.quantity} ${resource.constructor.name}`);
    store.giveResourceToPlayer(playerId, resource);
  }

  /**
   * Example of how to use an item from a player's inventory
   * @param playerId The ID of the player
   * @param itemId The ID of the item to use
   */
  public static useItem(playerId: string, itemId: string): void {
    console.log(`Player ${playerId} is using item ${itemId}`);
    store.usePlayerItem(playerId, itemId);
  }
}

export default InventoryDemo;

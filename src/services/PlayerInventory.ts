// src/services/PlayerInventory.ts
import store from '../store/store';
import { IInventoryItem } from '../models/inventory/InventoryItem';
import { Resource } from '../models/inventory/Resource';
import { Metal, Silicon, Water, Regolith } from '../models/inventory/items/resources';

// Player inventory tracking - will be integrated with the Store
export interface PlayerItems {
  [playerId: string]: IInventoryItem[];
}

/**
 * PlayerInventory service - provides a universal way to manage player inventories
 * This centralized approach allows for consistent item management across the application
 */
class PlayerInventoryService {
  private playerItems: PlayerItems = {};
  private maxInventorySize = 100; // Default max inventory size

  constructor() {
    // Initialize with empty inventories
  }

  /**
   * Universal method to give any item to a player
   * @param playerId The unique ID of the player
   * @param item The item to give to the player
   * @param quantity Optional quantity (defaults to item's quantity)
   */
  public giveItemToPlayer(playerId: string, item: IInventoryItem, quantity?: number): void {
    // Ensure player has an inventory
    if (!this.playerItems[playerId]) {
      this.playerItems[playerId] = [];
    }

    // Clone the item to avoid reference issues
    const itemToAdd = this.cloneItem(item);

    // Override quantity if specified
    if (quantity !== undefined) {
      itemToAdd.quantity = quantity;
    }

    // Handle stackable items
    if (itemToAdd.stackable) {
      // Try to find an existing stack of the same item
      const existingItem = this.playerItems[playerId].find(
        (i) => i.id === itemToAdd.id && i.quantity < i.maxStackSize
      );

      if (existingItem) {
        // Calculate how much can be added to this stack
        const spaceAvailable = existingItem.maxStackSize - existingItem.quantity;
        const amountToAdd = Math.min(spaceAvailable, itemToAdd.quantity);

        existingItem.quantity += amountToAdd;

        // If there's leftover quantity, create a new stack
        const remaining = itemToAdd.quantity - amountToAdd;
        if (remaining > 0) {
          const newItem = this.cloneItem(itemToAdd);
          newItem.quantity = remaining;
          this.playerItems[playerId].push(newItem);
        }
      } else {
        // No existing stack with space, add as new item
        this.playerItems[playerId].push(itemToAdd);
      }
    } else {
      // Item is not stackable, just add it
      this.playerItems[playerId].push(itemToAdd);
    }

    // Notify any listeners about inventory update
    this.notifyInventoryUpdate(playerId);
  }

  /**
   * Get all items for a specific player
   * @param playerId The unique ID of the player
   */
  public getPlayerItems(playerId: string): IInventoryItem[] {
    return this.playerItems[playerId] || [];
  }

  /**
   * Remove item from player's inventory
   * @param playerId The unique ID of the player
   * @param itemId The ID of the item to remove
   * @param quantity Optional quantity to remove (if not specified, removes all)
   */
  public removeItemFromPlayer(playerId: string, itemId: string, quantity?: number): void {
    if (!this.playerItems[playerId]) {
      return;
    }

    const itemIndex = this.playerItems[playerId].findIndex((item) => item.id === itemId);
    if (itemIndex !== -1) {
      const item = this.playerItems[playerId][itemIndex];

      if (quantity !== undefined && quantity < item.quantity) {
        // Reduce quantity
        item.quantity -= quantity;
      } else {
        // Remove the entire item
        this.playerItems[playerId].splice(itemIndex, 1);
      }

      this.notifyInventoryUpdate(playerId);
    }
  }

  /**
   * Use an item from the player's inventory
   * @param playerId The unique ID of the player
   * @param itemId The ID of the item to use
   */
  public usePlayerItem(playerId: string, itemId: string): void {
    if (!this.playerItems[playerId]) {
      return;
    }

    const item = this.playerItems[playerId].find((item) => item.id === itemId);
    if (item && typeof item.use === 'function') {
      item.use();

      // If the item is consumed on use, reduce its quantity
      if (item.stackable) {
        item.quantity -= 1;

        // Remove the item if its quantity reaches 0
        if (item.quantity <= 0) {
          this.playerItems[playerId] = this.playerItems[playerId].filter((i) => i !== item);
        }

        this.notifyInventoryUpdate(playerId);
      }
    }
  }

  // Private helper methods
  private cloneItem(item: IInventoryItem): IInventoryItem {
    // Deep clone the item to avoid reference issues
    return {
      ...item,
      // Clone any other nested properties as needed
    };
  }

  private notifyInventoryUpdate(playerId: string): void {
    // In the future, this could emit events or update UI
    // For now, it's a placeholder for inventory change notifications
    console.log(`Inventory updated for player ${playerId}`);

    // Add integration with the custom Store when needed
    // This would push inventory changes to the Store
  }

  // Integration with Store system
  public syncWithStore(playerId: string): void {
    // This will be implemented to sync with the custom Store when needed
    if (store && playerId) {
      // Future implementation for syncing with Store
    }
  }

  /**
   * Check if the player has space for a specific resource
   * @param resourceType The type of resource to check
   * @param quantity The quantity of the resource
   */
  public hasSpaceForResource(resourceType: IInventoryItem): boolean {
    const playerId = store.getSelfPlayerId();
    const items = this.getPlayerItems(playerId);

    // Check if there's space in the inventory for the resource
    const existingItem = items.find(
      (item) => item.id === resourceType.id && item.quantity < item.maxStackSize
    );
    if (existingItem) {
      return existingItem.quantity + resourceType.quantity <= existingItem.maxStackSize;
    }

    // If no existing item found, check if there's space for a new stack
    return items.length < this.maxInventorySize;
  }

  /**
   * Set the maximum inventory size
   * @param size The maximum number of items allowed in the inventory
   */
  public setMaxInventorySize(size: number): void {
    this.maxInventorySize = size;
  }

  /**
   * Get the current maximum inventory size
   * @returns The maximum number of items allowed in the inventory
   */
  public getMaxInventorySize(): number {
    return this.maxInventorySize;
  }
}

// Export a singleton instance
export const playerInventory = new PlayerInventoryService();
export default playerInventory;

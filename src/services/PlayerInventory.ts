// src/services/PlayerInventory.ts
import { openDB } from 'idb';
import store from '../store/store';
import storeVuex from '@/store/vuex';
import { IInventoryItem, InventoryItem } from '@/models/inventory/InventoryItem';
import * as items from '@/models/inventory/items';

const DB_NAME = 'game-inventory';
const DB_VERSION = 2;
const STORE_NAME = 'player-inventories';

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
    this.playerItems = {};
    this.maxInventorySize = 100;
  }

  public async initialize(): Promise<IInventoryItem[]> {
    const playerId = store.getSelfPlayerId();
    if (playerId) {
      const items = await this.loadFromIndexedDB(playerId);
      return items;
    }
    return [];
  }

  private async initializeDB() {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
    return db;
  }

  private async saveToIndexedDB(playerId: string) {
    const db = await this.initializeDB();
    const itemsToStore = this.playerItems[playerId].map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }));
    await db.put(STORE_NAME, itemsToStore, playerId);
  }

  private async loadFromIndexedDB(playerId: string) {
    console.log('Loading inventory from IndexedDB for player:', playerId);
    const db = await this.initializeDB();
    const storedItems = await db.get(STORE_NAME, playerId);
    console.log('Loaded items from IndexedDB:', storedItems);

    // Initialize empty array if no items found
    this.playerItems[playerId] = [];

    if (storedItems) {
      for (const storedItem of storedItems) {
        const item = this.createItemFromId(storedItem.id, storedItem.quantity);
        if (item) {
          this.playerItems[playerId].push(item);
        }
      }
    }

    // Update store's player inventory
    const player = store.getPlayer(playerId);
    if (player) {
      player.inventory = [...this.playerItems[playerId]];
    }

    return this.playerItems[playerId];
  }

  private createItemFromId(id: string, quantity: number): IInventoryItem | null {
    // Implement logic to create an item instance based on the id
    // This is a placeholder implementation
    const itemClasses = items;
    for (const ItemClass of Object.values(itemClasses)) {
      const item = new ItemClass(quantity);
      if (item.id === id) {
        return item.serialize();
      }
    }
    console.warn(`Item with ID ${id} not found`);
    return null;
  }

  /**
   * Universal method to give any item to a player
   * @param playerId The unique ID of the player
   * @param item The item to give to the player
   * @param quantity Optional quantity (defaults to item's quantity)
   */
  public async giveItemToPlayer(
    playerId: string,
    item: IInventoryItem,
    quantity?: number
  ): Promise<void> {
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

    // Save to IndexedDB
    await this.saveToIndexedDB(playerId);

    // Notify any listeners about inventory update
    this.notifyInventoryUpdate(playerId);
  }

  /**
   * Get all items for a specific player
   * @param playerId The unique ID of the player
   */
  public getPlayerItems(playerId: string): IInventoryItem[] {
    // Ensure player has an inventory
    if (!this.playerItems[playerId]) {
      this.playerItems[playerId] = [];
      this.loadFromIndexedDB(playerId);
    }
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
    console.log(`Inventory updated for player ${playerId}`);

    // Get the updated items
    const items = this.playerItems[playerId] || [];

    // Update Vuex store
    storeVuex.commit('inventory/SET_ITEMS', items);

    // Update custom Store
    const player = store.getPlayer(playerId);
    if (player) {
      player.inventory = [...items];
      store.notifySubscribers(playerId, 'inventory', items);
    }
  }

  // Integration with Store system
  public syncWithStore(playerId: string): void {
    if (!playerId) return;

    // Get current items for the player
    const items = this.playerItems[playerId] || [];

    // Update Vuex store
    storeVuex.commit('inventory/SET_ITEMS', items);

    // Update custom Store
    const player = store.getPlayer(playerId);
    if (player) {
      player.inventory = [...items];
      store.notifySubscribers(playerId, 'inventory', items);
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

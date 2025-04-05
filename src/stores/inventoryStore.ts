// src/stores/inventoryStore.ts
import { defineStore } from 'pinia';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import { openDB } from 'idb';
import { v4 as generateUUID } from 'uuid';
import * as items from '@/models/inventory/items';

// Database configuration
const DB_NAME = 'game-inventory';
const DB_VERSION = 2;
const STORE_NAME = 'player-inventories';

// Define the position type for inventory items
export interface ItemPosition {
  type: 'inventory' | 'hotbar';
  index: number;
}

// Extended inventory item with position information
export interface InventoryItemWithPosition extends IInventoryItem {
  stackId: string; // Unique ID for each stack in the inventory
  position: ItemPosition;
}

// State interface for the inventory store
interface InventoryState {
  items: InventoryItemWithPosition[];
  isInventoryOpen: boolean;
  maxInventorySize: number;
  activeHotbarSlot: number;
}

// Helper functions for IndexedDB operations
async function saveToIndexedDB(playerId: string, items: InventoryItemWithPosition[]) {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    // Serialize items before storing
    const serializedItems = items.map((item) => JSON.parse(JSON.stringify(item)));
    console.log('Saving inventory to IndexedDB:', serializedItems);
    await db.put(STORE_NAME, serializedItems, playerId);
  } catch (e) {
    console.warn('Failed to save inventory to IndexedDB:', e);
  }
}

async function loadFromIndexedDB(playerId: string): Promise<InventoryItemWithPosition[]> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    const items: InventoryItemWithPosition[] = await db.get(STORE_NAME, playerId);
    if (items && Array.isArray(items)) {
      // console.log('Loaded inventory from IndexedDB:', items);

      // Filter out any duplicate stack IDs
      const uniqueStackIds = new Set<string>();
      const filteredItems = items.filter((item: any) => {
        if (uniqueStackIds.has(item.stackId)) {
          return false; // Skip duplicates
        }
        uniqueStackIds.add(item.stackId);
        return true; // Keep unique items
      });

      // Ensure all items have stackId and valid position
      return filteredItems.map((item: any, index: number) => {
        const validItem: InventoryItemWithPosition = {
          ...item,
          stackId: item.stackId || generateUUID(),
          position: item.position || {
            type: 'inventory',
            index: index % 27, // Ensure index is within inventory bounds
          },
        };
        return validItem;
      });
    }
  } catch (e) {
    console.warn('Failed to load inventory from IndexedDB:', e);
  }
  return [];
}

// Define the Pinia store
export const useInventoryStore = defineStore('inventory', {
  state: () =>
    ({
      items: [],
      isInventoryOpen: false,
      maxInventorySize: 27 * 3, // 3 rows of 9 items
      activeHotbarSlot: 1,
    }) as InventoryState,

  getters: {
    // Get all items in the inventory
    allItems: (state) => state.items,

    // Find an item by stack ID
    getItemByStackId: (state) => (stackId: string) =>
      state.items.find((item) => item.stackId === stackId),

    // Find an item by its ID (type)
    getItemById: (state) => (id: string) => state.items.find((item) => item.id === id),

    // Check if inventory is open
    isOpen: (state) => state.isInventoryOpen,

    // Get all items in the main inventory (not hotbar)
    inventoryItems: (state) => state.items.filter((item) => item.position.type === 'inventory'),

    // Get all items in the hotbar
    hotbarItems: (state) => state.items.filter((item) => item.position.type === 'hotbar'),

    // Find an item at a specific position
    getItemAtPosition: (state) => (type: 'inventory' | 'hotbar', index: number) =>
      state.items.find((item) => item.position.type === type && item.position.index === index),

    // Get the number of items in the inventory
    inventoryItemCount: (state) => {
      const inventoryItems = state.items.filter((item) => item.position.type === 'inventory');
      return inventoryItems.length;
    },
    // Get the number of items in the hotbar
    hotbarItemCount: (state) => {
      const hotbarItems = state.items.filter((item) => item.position.type === 'hotbar');
      return hotbarItems.length;
    },
    // Get the current active hotbar slot
    activeHotbarSlot: (state) => state.activeHotbarSlot,
    // Get the active hotbar item
    activeHotbarItem: (state) => {
      const activeSlot = state.items.find(
        (item) => item.position.type === 'hotbar' && item.position.index === state.activeHotbarSlot
      );
      return activeSlot;
    },
  },

  actions: {
    // Initialize the inventory from storage
    async initializeInventory(playerId: string) {
      if (!playerId) {
        console.error('Player ID not found. Cannot initialize inventory.');
        return;
      }

      // Clear existing items first
      this.items = [];

      // Load items from IndexedDB
      const items = await loadFromIndexedDB(playerId);
      if (items && items.length > 0) {
        this.items = items;
      } else {
        console.log('No items found in IndexedDB for player:', playerId);
      }
    },

    // Add an item to the inventory
    async addItem(playerId: string, item: IInventoryItem) {
      // Find first empty inventory slot
      const occupiedInventorySlots = this.items
        .filter((i) => i.position.type === 'inventory')
        .map((i) => i.position.index);

      let emptySlotIndex = 0;
      while (
        occupiedInventorySlots.includes(emptySlotIndex) &&
        emptySlotIndex < this.maxInventorySize
      ) {
        emptySlotIndex++;
      }

      if (emptySlotIndex >= this.maxInventorySize) {
        console.warn('Inventory is full, item cannot be added');
        return;
      }

      // Generate a new stack ID for this item
      const stackId = generateUUID();

      // Add position information and stackId to the item
      const itemWithPosition: InventoryItemWithPosition = {
        ...item,
        stackId,
        position: {
          type: 'inventory',
          index: emptySlotIndex,
        },
      };

      // If item is stackable, try to find existing stack first
      if (item.stackable) {
        const existingItem = this.items.find(
          (i) => i.id === item.id && i.quantity < i.maxStackSize
        );

        if (existingItem) {
          // Calculate how much can be added to this stack
          const spaceAvailable = existingItem.maxStackSize - existingItem.quantity;
          const amountToAdd = Math.min(spaceAvailable, item.quantity);
          existingItem.quantity += amountToAdd;

          // If there's leftover quantity, create a new stack
          const remaining = item.quantity - amountToAdd;
          if (remaining > 0) {
            // Create a copy with the remaining quantity
            const newItem = {
              ...itemWithPosition,
              quantity: remaining,
            };
            this.items.push(newItem);
          }
        } else {
          // No existing stack with space, add as new item
          this.items.push(itemWithPosition);
        }
      } else {
        // Item is not stackable, just add it
        this.items.push(itemWithPosition);
      }

      // Save inventory state to IndexedDB
      if (playerId) {
        await saveToIndexedDB(playerId, this.items);
      } else {
        console.warn('Player ID not found. Cannot save inventory to IndexedDB.');
      }
    },

    // Remove an item from the inventory
    async removeItem(playerId: string, stackId: string) {
      this.items = this.items.filter((item) => item.stackId !== stackId);

      // Save inventory state to IndexedDB
      if (playerId) {
        await saveToIndexedDB(playerId, this.items);
      }
    },

    // Update the quantity of an item
    async updateItemQuantity(playerId: string, stackId: string, quantity: number) {
      const item = this.items.find((item) => item.stackId === stackId);
      if (item) {
        item.quantity = Math.min(quantity, item.maxStackSize);

        // Remove if quantity reaches 0
        if (item.quantity <= 0) {
          this.items = this.items.filter((i) => i !== item);
        }

        // Save inventory state to IndexedDB
        if (playerId) {
          await saveToIndexedDB(playerId, this.items);
        }
      }
    },

    // Toggle the inventory open/closed state
    toggleInventory() {
      this.isInventoryOpen = !this.isInventoryOpen;
    },

    // Move an item to a new position
    async moveItem(playerId: string, stackId: string, newPosition: ItemPosition) {
      const sourceIndex = this.items.findIndex((i) => i.stackId === stackId);
      if (sourceIndex === -1) return;

      const sourceItem = this.items[sourceIndex];
      const targetIndex = this.items.findIndex(
        (i) => i.position.type === newPosition.type && i.position.index === newPosition.index
      );

      // Create a new array with all items except source and target
      const newItems = this.items.filter(
        (_, index) => index !== sourceIndex && index !== targetIndex
      );

      if (targetIndex !== -1) {
        const targetItem = this.items[targetIndex];

        if (targetItem.stackId === sourceItem.stackId) {
          return; // Prevent moving to the same stack
        }

        // If items are the same type and stackable
        if (targetItem.id === sourceItem.id && sourceItem.stackable && targetItem.stackable) {
          const totalQuantity = targetItem.quantity + sourceItem.quantity;

          if (totalQuantity <= targetItem.maxStackSize) {
            // Combine stacks
            newItems.push({
              ...targetItem,
              quantity: totalQuantity,
            });
          } else {
            // Fill target stack to max and keep remainder in source
            newItems.push(
              {
                ...targetItem,
                quantity: targetItem.maxStackSize,
              },
              {
                ...sourceItem,
                quantity: totalQuantity - targetItem.maxStackSize,
                position: sourceItem.position,
              }
            );
          }
        } else {
          // Swap positions
          newItems.push(
            { ...sourceItem, position: newPosition },
            { ...targetItem, position: sourceItem.position }
          );
        }
      } else {
        // Move source item to new position
        newItems.push({ ...sourceItem, position: newPosition });
      }

      // Update state with new array
      this.items = newItems;

      // Save to IndexedDB
      if (playerId) {
        await saveToIndexedDB(playerId, this.items);
      }
    },

    // Create a new stack by splitting an existing one
    async addSplitStack(
      playerId: string,
      originalItem: InventoryItemWithPosition,
      quantity: number,
      position: ItemPosition
    ) {
      // Create a new stack based on the original item
      const newStack: InventoryItemWithPosition = {
        ...originalItem,
        stackId: generateUUID(), // Generate new unique ID for the split stack
        quantity: quantity,
        position: position,
      };

      this.items.push(newStack);

      // Save inventory state to IndexedDB
      if (playerId) {
        await saveToIndexedDB(playerId, this.items);
      }
    },

    // Use an item from inventory
    async useItem(playerId: string, stackId: string) {
      // This is a placeholder for item usage logic
      // In a real implementation, you would handle the effects of using the item
      console.log(`Player ${playerId} used item with stack ID ${stackId}`);

      const item = this.getItemByStackId(stackId);
      if (!item) {
        return;
      }
      // For consumable/stackable items, reduce quantity after use
      const itemClass = this.getItemClass(item);
      itemClass?.use();
      if (item.stackable && item.quantity > 1 && item.consumable) {
        await this.updateItemQuantity(playerId, stackId, item.quantity - 1);
      } else if (item.consumable) {
        // If the item is consumable but not stackable, remove it from inventory
        await this.removeItem(playerId, stackId);
      }
    },

    // Force a refresh of the inventory from storage
    async forceRefreshInventory(playerId: string) {
      if (!playerId) {
        console.error('Player ID not found. Cannot refresh inventory.');
        return;
      }

      console.log('Forcing inventory refresh from IndexedDB');

      // Load fresh data from IndexedDB
      const items = await loadFromIndexedDB(playerId);
      if (items && items.length > 0) {
        this.items = items;
      }
    },

    // set active hotbar slot
    setActiveHotbarSlot(slotIndex: number) {
      if (slotIndex >= 0 && slotIndex < 9) {
        this.activeHotbarSlot = slotIndex;
      }
    },

    // Set the inventory items directly (for testing or initialization)
    setItems(items: InventoryItemWithPosition[]) {
      this.items = items.map((item, index) => ({
        ...item,
        stackId: item.stackId || generateUUID(),
        position: item.position || {
          type: 'inventory',
          index: index % this.maxInventorySize,
        },
      }));
    },

    // Check if player has space for an item
    hasSpaceForItem(item: IInventoryItem): boolean {
      // Check if there's an existing stack with space
      if (item.stackable) {
        const existingStack = this.items.find(
          (i) => i.id === item.id && i.quantity < i.maxStackSize
        );

        if (existingStack) {
          return true;
        }
      }

      // Check if there's space for a new item
      const inventoryItems = this.items.filter((i) => i.position.type === 'inventory');
      return inventoryItems.length < this.maxInventorySize;
    },

    // New functions for Item class handling

    /**
     * Create an item class instance from an item ID
     * @param id The ID of the item
     * @param quantity The quantity to create
     * @returns The item class instance or null if not found
     */
    createItemClassFromId(id: string, quantity = 1) {
      const itemClasses = items;
      for (const ItemClass of Object.values(itemClasses)) {
        const item = new ItemClass(quantity);
        if (item.id === id) {
          return item;
        }
      }
      console.warn(`Item with ID ${id} not found`);
      return null;
    },

    /**
     * Create a serialized item from an item ID
     * @param id The ID of the item
     * @param quantity The quantity to create
     * @returns The serialized item or null if not found
     */
    createItemFromId(id: string, quantity = 1): IInventoryItem | null {
      const itemClass = this.createItemClassFromId(id, quantity);
      if (!itemClass) {
        return null;
      }
      return itemClass.serialize();
    },

    /**
     * Get the item class for an inventory item
     * This allows accessing item class methods on inventory items
     * @param item The inventory item
     * @returns The corresponding item class instance
     */
    getItemClass(item: IInventoryItem) {
      return this.createItemClassFromId(item.id, item.quantity);
    },
  },
});

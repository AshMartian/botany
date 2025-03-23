// src/store/vuex/modules/inventory/index.ts
import { Module } from 'vuex';
import { RootState } from '@/store/vuex/types';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import store from '@/store/store';
import { openDB } from 'idb';
import { playerInventory } from '@/services/PlayerInventory';

const DB_NAME = 'game-inventory';
const DB_VERSION = 1;
const STORE_NAME = 'player-inventories';

export interface InventoryItemWithPosition extends IInventoryItem {
  position: {
    type: 'inventory' | 'hotbar';
    index: number;
  };
}

export interface InventoryState {
  items: InventoryItemWithPosition[];
  isInventoryOpen: boolean;
}

async function saveToIndexedDB(playerId: string, items: InventoryItemWithPosition[]) {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    await db.put(STORE_NAME, items, playerId);
    console.log('Saved inventory to IndexedDB:', items);
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

    const items = await db.get(STORE_NAME, playerId);
    if (items) {
      console.log('Loaded inventory from IndexedDB:', items);
      return items;
    }
  } catch (e) {
    console.warn('Failed to load inventory from IndexedDB:', e);
  }
  return [];
}

export const inventory: Module<InventoryState, RootState> = {
  namespaced: true,

  state: () => ({
    items: [],
    isInventoryOpen: false,
  }),

  mutations: {
    SET_ITEMS(state, items: InventoryItemWithPosition[]) {
      state.items = items;
    },

    SET_INVENTORY_OPEN(state, isOpen: boolean) {
      state.isInventoryOpen = isOpen;
    },

    ADD_ITEM(state, item: IInventoryItem) {
      // Find first empty inventory slot
      const occupiedInventorySlots = state.items
        .filter((i) => i.position.type === 'inventory')
        .map((i) => i.position.index);

      let emptySlotIndex = 0;
      while (occupiedInventorySlots.includes(emptySlotIndex) && emptySlotIndex < 27) {
        emptySlotIndex++;
      }

      if (emptySlotIndex >= 27) {
        console.warn('Inventory is full, item cannot be added');
        return;
      }

      // Add position information to the item
      const itemWithPosition: InventoryItemWithPosition = {
        ...item,
        position: {
          type: 'inventory',
          index: emptySlotIndex,
        },
      };

      // If item is stackable, try to find existing stack first
      if (item.stackable) {
        const existingItem = state.items.find(
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
            const newItem = { ...itemWithPosition, quantity: remaining };
            state.items.push(newItem);
          }
        } else {
          // No existing stack with space, add as new item
          state.items.push(itemWithPosition);
        }
      } else {
        // Item is not stackable, just add it
        state.items.push(itemWithPosition);
      }

      // Save inventory state to IndexedDB
      const playerId = store.getSelfPlayerId();
      if (playerId) {
        saveToIndexedDB(playerId, state.items);
      }
    },

    REMOVE_ITEM(state, itemId: string) {
      state.items = state.items.filter((item) => item.id !== itemId);

      // Save inventory state to IndexedDB
      const playerId = store.getSelfPlayerId();
      if (playerId) {
        saveToIndexedDB(playerId, state.items);
      }
    },

    UPDATE_ITEM_QUANTITY(state, { itemId, quantity }: { itemId: string; quantity: number }) {
      const item = state.items.find((item) => item.id === itemId);
      if (item) {
        item.quantity = Math.min(quantity, item.maxStackSize);

        // Create a new array to trigger reactivity
        state.items = [...state.items];

        // Remove if quantity reaches 0
        if (item.quantity <= 0) {
          state.items = state.items.filter((i) => i !== item);
        }

        // Save inventory state to IndexedDB
        const playerId = store.getSelfPlayerId();
        if (playerId) {
          saveToIndexedDB(playerId, state.items);
        }
      }
    },

    TOGGLE_INVENTORY(state) {
      state.isInventoryOpen = !state.isInventoryOpen;
    },

    MOVE_ITEM(
      state,
      {
        itemId,
        newPosition,
      }: { itemId: string; newPosition: { type: 'inventory' | 'hotbar'; index: number } }
    ) {
      const item = state.items.find((i) => i.id === itemId);
      if (item) {
        // Check if there's already an item at the target position
        const itemAtTarget = state.items.find(
          (i) => i.position.type === newPosition.type && i.position.index === newPosition.index
        );

        // If there's an item at the target, swap positions
        if (itemAtTarget) {
          const oldPosition = { ...item.position };
          itemAtTarget.position = oldPosition;
        }

        // Update the item's position
        item.position = newPosition;

        // Save inventory state to IndexedDB
        const playerId = store.getSelfPlayerId();
        if (playerId) {
          saveToIndexedDB(playerId, state.items);
        }
      }
    },
  },

  actions: {
    async initializeInventory({ commit }) {
      const playerId = store.getSelfPlayerId();
      if (!playerId) {
        console.error('Player ID not found. Cannot initialize inventory.');
        return;
      }

      // Clear existing items first
      commit('SET_ITEMS', []);

      // Load items from IndexedDB
      const items = await loadFromIndexedDB(playerId);

      if (items && items.length > 0) {
        commit('SET_ITEMS', items);
      } else {
        // If no items in IndexedDB, load from legacy PlayerInventory service
        const legacyItems = await playerInventory.initialize();
        console.log('Initializing inventory with legacy items:', legacyItems);

        // Add each legacy item and assign inventory positions
        if (legacyItems && legacyItems.length > 0) {
          legacyItems.forEach((item, index) => {
            const itemWithPosition: InventoryItemWithPosition = {
              ...item,
              position: {
                type: 'inventory',
                index,
              },
            };
            commit('ADD_ITEM', itemWithPosition);
          });
        }
      }
    },

    async addItem({ commit }, item: IInventoryItem) {
      commit('ADD_ITEM', item);
    },

    removeItem({ commit }, itemId: string) {
      commit('REMOVE_ITEM', itemId);
    },

    updateItemQuantity({ commit }, payload: { itemId: string; quantity: number }) {
      commit('UPDATE_ITEM_QUANTITY', payload);
    },

    toggleInventory({ commit }) {
      commit('TOGGLE_INVENTORY');
    },

    useItem({ state, commit }, itemId: string) {
      const item = state.items.find((item) => item.id === itemId);
      if (item && item.use) {
        item.use();

        // If the item is consumed on use, reduce its quantity by 1
        if (item.stackable) {
          commit('UPDATE_ITEM_QUANTITY', {
            itemId: item.id,
            quantity: item.quantity - 1,
          });
        }
      }
    },

    moveItem(
      { commit },
      payload: { itemId: string; newPosition: { type: 'inventory' | 'hotbar'; index: number } }
    ) {
      commit('MOVE_ITEM', payload);
    },
  },

  getters: {
    allItems: (state) => state.items,
    getItemById: (state) => (id: string) => state.items.find((item) => item.id === id),
    isInventoryOpen: (state) => state.isInventoryOpen,
    getInventoryItems: (state) => state.items.filter((item) => item.position.type === 'inventory'),
    getHotbarItems: (state) => state.items.filter((item) => item.position.type === 'hotbar'),
    getItemAtPosition: (state) => (type: 'inventory' | 'hotbar', index: number) =>
      state.items.find((item) => item.position.type === type && item.position.index === index),
  },
};

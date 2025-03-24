// src/store/vuex/modules/inventory/index.ts
import { Module } from 'vuex';
import { RootState } from '@/store/vuex/types';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import store from '@/store/store';
import { openDB } from 'idb';
import { playerInventory } from '@/services/PlayerInventory';
import { v4 as generateUUID } from 'uuid';

const DB_NAME = 'game-inventory';
const DB_VERSION = 2; // Incrementing version to handle schema changes
const STORE_NAME = 'player-inventories';

export interface InventoryItemWithPosition extends IInventoryItem {
  stackId: string; // Unique ID for each stack in the inventory
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

    // Serialize items before storing
    const serializedItems = items.map((item) => JSON.parse(JSON.stringify(item)));

    console.log('Saving inventory to IndexedDB:', serializedItems);

    await db.put(STORE_NAME, serializedItems, playerId);
    console.log('Saved inventory to IndexedDB:', serializedItems);
  } catch (e) {
    console.warn('Failed to save inventory to IndexedDB:', e);
  }
}

async function loadFromIndexedDB(playerId: string): Promise<InventoryItemWithPosition[]> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        // Migration logic could be added here for existing data
      },
    });

    const items: InventoryItemWithPosition[] = await db.get(STORE_NAME, playerId);
    if (items) {
      console.log('Loaded inventory from IndexedDB:', items);

      // Ensure all items have stackId and valid position
      return items.map((item: any, index: number) => {
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

export const inventory: Module<InventoryState, RootState> = {
  namespaced: true,

  state: () => ({
    items: [],
    isInventoryOpen: false,
  }),

  mutations: {
    SET_ITEMS(state, items: InventoryItemWithPosition[]) {
      // Ensure all items have valid positions before setting them
      state.items = items.map((item, index) => ({
        ...item,
        stackId: item.stackId || generateUUID(),
        position: item.position || {
          type: 'inventory',
          index: index % 27,
        },
      }));
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
            const newItem = {
              ...itemWithPosition,
              quantity: remaining,
            };
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

    REMOVE_ITEM(state, stackId: string) {
      state.items = state.items.filter((item) => item.stackId !== stackId);

      // Save inventory state to IndexedDB
      const playerId = store.getSelfPlayerId();
      if (playerId) {
        saveToIndexedDB(playerId, state.items);
      }
    },

    UPDATE_ITEM_QUANTITY(state, { stackId, quantity }: { stackId: string; quantity: number }) {
      const item = state.items.find((item) => item.stackId === stackId);
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
        stackId,
        newPosition,
      }: { stackId: string; newPosition: { type: 'inventory' | 'hotbar'; index: number } }
    ) {
      const sourceIndex = state.items.findIndex((i) => i.stackId === stackId);
      if (sourceIndex === -1) return;

      const sourceItem = state.items[sourceIndex];
      const targetIndex = state.items.findIndex(
        (i) => i.position.type === newPosition.type && i.position.index === newPosition.index
      );

      // Create a new array with all items except source and target
      const newItems = state.items.filter(
        (_, index) => index !== sourceIndex && index !== targetIndex
      );

      if (targetIndex !== -1) {
        const targetItem = state.items[targetIndex];

        // If items are the same type and stackable
        if (
          targetItem.id === sourceItem.id &&
          sourceItem.stackable &&
          targetItem.stackable &&
          targetItem.stackId !== sourceItem.stackId
        ) {
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
      state.items = newItems;

      // Save to IndexedDB
      const playerId = store.getSelfPlayerId();
      if (playerId) {
        saveToIndexedDB(playerId, newItems);
        playerInventory.syncWithStore(playerId);
      }
    },

    ADD_SPLIT_STACK(
      state,
      {
        originalItem,
        quantity,
        position,
      }: {
        originalItem: InventoryItemWithPosition;
        quantity: number;
        position: { type: 'inventory' | 'hotbar'; index: number };
      }
    ) {
      // Create a new stack based on the original item
      const newStack: InventoryItemWithPosition = {
        ...originalItem,
        stackId: generateUUID(), // Generate new unique ID for the split stack
        quantity: quantity,
        position: position,
      };

      state.items.push(newStack);

      // Save inventory state to IndexedDB
      const playerId = store.getSelfPlayerId();
      if (playerId) {
        saveToIndexedDB(playerId, state.items);
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
          const itemsWithPositions = legacyItems.map((item, index) => ({
            ...item,
            stackId: generateUUID(),
            position: {
              type: 'inventory' as const,
              index: index % 27,
            },
          }));
          commit('SET_ITEMS', itemsWithPositions);
        }
      }
    },

    async addItem({ commit }, item: IInventoryItem) {
      commit('ADD_ITEM', item);
    },

    removeItem({ commit }, stackId: string) {
      commit('REMOVE_ITEM', stackId);
    },

    updateItemQuantity({ commit }, payload: { stackId: string; quantity: number }) {
      commit('UPDATE_ITEM_QUANTITY', payload);
    },

    toggleInventory({ commit }) {
      commit('TOGGLE_INVENTORY');
    },

    useItem({}, stackId: string) {
      const playerId = store.getSelfPlayerId();
      playerInventory.usePlayerItem(playerId, stackId);
    },

    moveItem(
      { commit, dispatch },
      payload: { stackId: string; newPosition: { type: 'inventory' | 'hotbar'; index: number } }
    ) {
      // First perform the move operation
      commit('MOVE_ITEM', payload);

      // Then force a refresh to ensure UI is synchronized
      setTimeout(() => {
        dispatch('forceRefreshInventory');
      }, 10);
    },

    addSplitStack(
      { commit },
      payload: {
        originalItem: InventoryItemWithPosition;
        quantity: number;
        position: { type: 'inventory' | 'hotbar'; index: number };
      }
    ) {
      commit('ADD_SPLIT_STACK', payload);
    },

    // Add new action to force refresh inventory data
    async forceRefreshInventory({ commit }) {
      const playerId = store.getSelfPlayerId();
      if (!playerId) {
        console.error('Player ID not found. Cannot refresh inventory.');
        return;
      }

      console.log('Forcing inventory refresh from IndexedDB');

      // Force refresh from root store first
      await store.refreshInventory(playerId);

      // Then load fresh data into Vuex store
      const items = await loadFromIndexedDB(playerId);
      if (items && items.length > 0) {
        commit('SET_ITEMS', items);
      }
    },
  },

  getters: {
    allItems: (state) => state.items,
    getItemByStackId: (state) => (stackId: string) =>
      state.items.find((item) => item.stackId === stackId),
    getItemById: (state) => (id: string) => state.items.find((item) => item.id === id),
    isInventoryOpen: (state) => state.isInventoryOpen,
    getInventoryItems: (state) =>
      state.items.filter((item) => item.position && item.position.type === 'inventory'),
    getHotbarItems: (state) =>
      state.items.filter((item) => item.position && item.position.type === 'hotbar'),
    getItemAtPosition: (state) => (type: 'inventory' | 'hotbar', index: number) =>
      state.items.find(
        (item) => item.position && item.position.type === type && item.position.index === index
      ),
  },
};

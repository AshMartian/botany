// src/store/vuex/modules/inventory/index.ts
import { Module } from 'vuex';
import { RootState } from '@/store/vuex/types';
import { IInventoryItem } from '@/models/inventory/InventoryItem';

export interface InventoryState {
  items: IInventoryItem[];
  isInventoryOpen: boolean;
}

export const inventory: Module<InventoryState, RootState> = {
  namespaced: true,

  state: () => ({
    items: [],
    isInventoryOpen: false,
  }),

  mutations: {
    SET_INVENTORY_OPEN(state, isOpen: boolean) {
      state.isInventoryOpen = isOpen;
    },

    ADD_ITEM(state, item: IInventoryItem) {
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
            const newItem = { ...item };
            newItem.quantity = remaining;
            state.items.push(newItem);
          }
        } else {
          // No existing stack with space, add as new item
          state.items.push(item);
        }
      } else {
        // Item is not stackable, just add it
        state.items.push(item);
      }
    },

    REMOVE_ITEM(state, itemId: string) {
      state.items = state.items.filter((item) => item.id !== itemId);
    },

    UPDATE_ITEM_QUANTITY(state, { itemId, quantity }: { itemId: string; quantity: number }) {
      const item = state.items.find((item) => item.id === itemId);
      if (item) {
        item.quantity = Math.min(quantity, item.maxStackSize);
        // Remove if quantity reaches 0
        if (item.quantity <= 0) {
          state.items = state.items.filter((i) => i !== item);
        }
      }
    },

    TOGGLE_INVENTORY(state) {
      state.isInventoryOpen = !state.isInventoryOpen;
    },
  },

  actions: {
    addItem({ commit }, item: IInventoryItem) {
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
  },

  getters: {
    allItems: (state) => state.items,
    getItemById: (state) => (id: string) => state.items.find((item) => item.id === id),
    isInventoryOpen: (state) => state.isInventoryOpen,
  },
};

// src/store/vuex/modules/hotbar/index.ts
import { Module } from 'vuex';
import { RootState } from '@/store/vuex/types';

export interface HotbarSlot {
  slotIndex: number;
  itemId: string | null;
}

export interface HotbarState {
  slots: HotbarSlot[];
  activeSlot: number;
}

export const hotbar: Module<HotbarState, RootState> = {
  namespaced: true,

  state: () => ({
    slots: Array.from({ length: 9 }, (_, i) => ({
      slotIndex: i,
      itemId: null,
    })),
    activeSlot: 0,
  }),

  mutations: {
    ASSIGN_ITEM_TO_SLOT(
      state,
      { slotIndex, itemId }: { slotIndex: number; itemId: string | null }
    ) {
      const slot = state.slots.find((s) => s.slotIndex === slotIndex);
      if (slot) {
        slot.itemId = itemId;
      }
    },

    SET_ACTIVE_SLOT(state, slotIndex: number) {
      if (slotIndex >= 0 && slotIndex < state.slots.length) {
        state.activeSlot = slotIndex;
      }
    },
  },

  actions: {
    equipItemToSlot({ commit }, { slotIndex, itemId }: { slotIndex: number; itemId: string }) {
      commit('ASSIGN_ITEM_TO_SLOT', { slotIndex, itemId });
    },

    unequipSlot({ commit }, slotIndex: number) {
      commit('ASSIGN_ITEM_TO_SLOT', { slotIndex, itemId: null });
    },

    activateSlot({ commit }, slotIndex: number) {
      commit('SET_ACTIVE_SLOT', slotIndex);
    },
  },

  getters: {
    getAllSlots: (state) => state.slots,
    getSlot: (state) => (slotIndex: number) => state.slots.find((s) => s.slotIndex === slotIndex),
    getActiveSlot: (state) => state.activeSlot,
    getActiveSlotItem: (state, getters, rootState, rootGetters) => {
      const activeSlot = state.slots[state.activeSlot];
      if (activeSlot && activeSlot.itemId) {
        return rootGetters['inventory/getItemById'](activeSlot.itemId);
      }
      return null;
    },
  },
};

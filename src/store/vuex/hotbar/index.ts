// src/store/vuex/modules/hotbar/index.ts
import { Module } from 'vuex';
import { RootState } from '@/store/vuex/types';

export interface HotbarState {
  activeSlot: number;
}

export const hotbar: Module<HotbarState, RootState> = {
  namespaced: true,

  state: () => ({
    activeSlot: 0,
  }),

  mutations: {
    SET_ACTIVE_SLOT(state, slotIndex: number) {
      if (slotIndex >= 0 && slotIndex < 9) {
        state.activeSlot = slotIndex;
      }
    },
  },

  actions: {
    // Set the active slot
    activateSlot({ commit }, slotIndex: number) {
      commit('SET_ACTIVE_SLOT', slotIndex);
    },
  },

  getters: {
    getActiveSlot: (state) => state.activeSlot,
    getActiveSlotItem: (state, getters, rootState, rootGetters) => {
      return rootGetters['inventory/getItemAtPosition']('hotbar', state.activeSlot);
    },
  },
};

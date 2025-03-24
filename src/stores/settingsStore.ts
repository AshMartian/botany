// src/stores/settingsStore.ts
import { defineStore } from 'pinia';
import { Field, Settings as SettingsLocalStorage } from '@/models/storage/Settings';

export interface Settings {
  speed: number;
  speedSprint: number;
  speedDeltaTimeDivider: number;
  acceleration: number;
  gravityMin: number;
  gravityMax: number;
  accelerationGravity: number;
  jumpHeight: number;
  jumpHeightSprint: number;
  transitionAnimationSpeed: number;
}

interface SettingsState {
  fields: Array<Field>;
  open: boolean;
  settings: Settings;
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    fields: SettingsLocalStorage.getFields(),
    open: false,
    settings: {
      speed: 0.06,
      speedSprint: 0.09,
      speedDeltaTimeDivider: 500,
      acceleration: 0.004,
      gravityMin: 0.009,
      gravityMax: 0.3,
      accelerationGravity: 0.0033,
      jumpHeight: 5.3,
      jumpHeightSprint: 4.2,
      transitionAnimationSpeed: 0.08,
    },
  }),

  getters: {
    // Get all setting fields
    settingFields: (state) => state.fields,

    // Get a setting field by name
    getSettingsFieldByName: (state) => (name: string) => {
      return state.fields.find((field) => field.name === name);
    },

    // Get a setting value by name
    getSettingsValueByName: (state) => (name: string) => {
      const field = state.fields.find((field: Field) => field.name === name);

      if (!field) {
        throw 'Error setting field in Store state';
      }

      return field.value;
    },

    // Get settings open state
    isSettingsOpen: (state) => state.open,

    getSettings: (state) => state.settings,
  },

  actions: {
    // Set settings panel open state
    setSettingsOpen(isOpen: boolean) {
      this.open = isOpen;
    },

    // Update a setting field value
    setSettingFieldValue(payload: { name: string; value: any }) {
      if (SettingsLocalStorage.validateFieldName(payload.name)) {
        SettingsLocalStorage.setValueByName(payload.name, payload.value);

        // Update field in state
        const field = this.fields.find((field) => field.name === payload.name);
        if (field) {
          field.value = payload.value;
        }
      }
    },

    // Toggle settings panel
    toggleSettings() {
      this.open = !this.open;
    },

    // Refresh settings from storage
    refreshSettings() {
      this.fields = SettingsLocalStorage.getFields();
    },
  },
});

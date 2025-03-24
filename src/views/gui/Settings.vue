<template>
  <div id="settings" class="modal no_focus_game" v-show="settingsOpen">
    <div class="container">
      <div class="content">
        <div class="title margin_bottom">Settings</div>

        <ul class="list">
          <li v-for="(field, index) in fields" :key="index">
            <label>
              <input
                type="checkbox"
                @change="saveField(field.name, $event)"
                :checked="field.value"
              />
              {{ field.name }}
            </label>
          </li>
        </ul>

        <div class="button_bar">
          <a @click="close" class="button">Close</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';

export default defineComponent({
  name: 'game-home',
  setup() {
    const settingsStore = useSettingsStore();

    // Use computed properties from the Pinia store
    const fields = computed(() => settingsStore.settingFields);
    const settingsOpen = computed(() => settingsStore.open);

    // Save field value
    const saveField = (name: string, event: any) => {
      settingsStore.setSettingFieldValue({
        name,
        value: event.target.checked,
      });
    };

    // Close settings panel
    const close = () => {
      settingsStore.setSettingsOpen(false);
    };

    return {
      fields,
      settingsOpen,
      saveField,
      close,
    };
  },
});
</script>

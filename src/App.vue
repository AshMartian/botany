<template>
  <component :is="resolvedComponent"></component>
  <BuildMenu />
  <!-- Add BuildMenu here -->
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'; // Removed onMounted, onUnmounted
import PlayWithFiendsPage from '@/views/PlayWithFiendsPage.vue';
import LevelPage from '@/views/LevelPage.vue';
import MainPage from '@/views/MainPage.vue';
import SettingsPage from '@/views/SettingsPage.vue';
import BuildMenu from '@/views/gui/BuildMenu.vue'; // Import BuildMenu
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/stores/appStore';
// Removed: import { useBuildingStore } from '@/stores/buildingStore';

export default defineComponent({
  setup() {
    // Use Pinia store instead of Vuex
    const appStore = useAppStore();
    const { currentPage } = storeToRefs(appStore);
    // Removed: const buildingStore = useBuildingStore();

    // Map the string page name to the actual component
    const resolvedComponent = computed(() => {
      const componentMap = {
        MainPage,
        LevelPage,
        PlayWithFiendsPage,
        SettingsPage,
      };
      // Ensure currentPage.value is a valid key, otherwise default to MainPage
      const pageKey = currentPage.value as keyof typeof componentMap;
      return componentMap[pageKey] || MainPage;
    });

    // --- Removed Build Mode Toggle Logic ---
    // The logic previously here (handleGlobalKeyDown, onMounted, onUnmounted)
    // has been moved to src/models/playerSelf/Controller.ts
    // --- End Removed Build Mode Toggle Logic ---

    return { currentPage, resolvedComponent };
  },
  components: {
    MainPage,
    LevelPage,
    PlayWithFiendsPage,
    SettingsPage,
    BuildMenu, // Register BuildMenu component
  },
});
</script>

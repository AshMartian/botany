<template>
  <component :is="resolvedComponent"></component>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import PlayWithFiendsPage from '@/views/PlayWithFiendsPage.vue';
import LevelPage from '@/views/LevelPage.vue';
import MainPage from '@/views/MainPage.vue';
import SettingsPage from '@/views/SettingsPage.vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/stores/appStore';

export default defineComponent({
  setup() {
    // Use Pinia store instead of Vuex
    const appStore = useAppStore();
    const { currentPage } = storeToRefs(appStore);

    // Map the string page name to the actual component
    const resolvedComponent = computed(() => {
      const componentMap = {
        MainPage,
        LevelPage,
        PlayWithFiendsPage,
        SettingsPage,
      };
      return componentMap[currentPage.value] || MainPage;
    });

    return { currentPage, resolvedComponent };
  },
  components: {
    MainPage,
    LevelPage,
    PlayWithFiendsPage,
    SettingsPage,
  },
});
</script>

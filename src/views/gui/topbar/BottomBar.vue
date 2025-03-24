<template>
  <div id="bottom_bar" class="no_focus_game">
    <map-button></map-button>
  </div>
</template>

<script>
import MapButton from '@/views/gui/topbar/MapButton';
import { useAppStore } from '@/stores/appStore';

export default {
  components: { MapButton },
  methods: {
    openMenu() {
      const appStore = useAppStore();
      appStore.setMenuOpen(true);
    },
  },
};
</script>

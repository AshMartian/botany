<template>
  <div>
    <div id="level">
      <canvas id="canvas"></canvas>
      <TopBar />
      <MenuLevel />
      <Settings />

      <div id="loading_overlay" v-if="isLoading">
        <div id="loading_overlay_text">{{ $t('message.loading') }}...</div>
      </div>

      <MobileJoystick v-if="isMobile"></MobileJoystick>

      <!-- Add our new components -->
      <Hotbar :inInventory="false" />
      <Inventory />
      <Crosshair />
    </div>
  </div>
</template>

<style scoped>
#canvas {
  border: 0;
  outline: none;
}

#level {
  position: relative;
}

#app,
#canvas,
#level,
html,
body {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}

#loading_overlay {
  background: -webkit-gradient(linear, left top, left bottom, from(#035161), to(#010024));
  background: -webkit-linear-gradient(top, #035161 0, #010024 100%);
  background: -o-linear-gradient(top, #035161 0, #010024 100%);
  background: linear-gradient(180deg, #035161 0, #010024 100%);
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 1000;
  top: 0;
  left: 0;
}

#loading_overlay_text {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  margin-top: -20px;
  text-align: center;
  color: #3dc2ff;
  font-size: 20px;
}
</style>

<script lang="ts">
import { defineComponent } from 'vue';
import Game from '@/models/Game';
import TopBar from '@/views/gui/topbar/TopBar.vue';
import MenuLevel from '@/views/gui/MenuLevel.vue';
import Settings from '@/views/gui/Settings.vue';
import MobileJoystick from '@/views/gui/MobileJoystick.vue';
import Hotbar from '@/views/gui/Hotbar.vue';
import Inventory from '@/views/gui/Inventory.vue';
import Crosshair from '@/views/gui/Crosshair.vue';
import { useAppStore } from '@/stores/appStore';

export default defineComponent({
  name: 'game-level',
  // --- Add data property to store the game instance ---
  data() {
    return {
      gameInstance: null as Game | null, // Store the instance here
    };
  },
  // --- End data property ---
  mounted(): void {
    this.$nextTick(() => {
      // --- Safety check for existing global game ---
      if (window.game) {
        console.warn('[LevelPage] Found existing window.game on mount. Attempting cleanup.');
        window.game.cleanup?.(); // Use optional chaining
      }
      // --- End safety check ---

      console.log('[LevelPage] Mounting and initializing game...');
      // --- Create and store the instance ---
      this.gameInstance = new Game();
      this.gameInstance.init();
      // --- End instance creation/storage ---
    });
  },
  // --- Add unmounted hook for cleanup ---
  unmounted(): void {
    console.log('[LevelPage] Unmounting, ensuring game cleanup...');
    // Call cleanup on the specific instance created by this component instance
    this.gameInstance?.cleanup();
    this.gameInstance = null; // Clear the reference

    // Also try cleaning up the global reference if it somehow still exists
    if (window.game) {
      console.warn('[LevelPage] window.game still exists on unmount. Forcing cleanup.');
      window.game.cleanup?.();
    }
  },
  // --- End unmounted hook ---
  computed: {
    isMobile() {
      const appStore = useAppStore();
      return appStore.isMobile;
    },
    isLoading() {
      // TODO: Implement actual loading state logic if needed
      return false;
    },
    // Removed 'finish' computed property as it wasn't defined in data/props
  },
  watch: {
    // Removed 'finish' watcher as 'finish' computed property was removed
  },
  components: {
    MobileJoystick,
    TopBar,
    MenuLevel,
    Settings,
    Hotbar,
    Inventory,
    Crosshair,
  },
});
</script>

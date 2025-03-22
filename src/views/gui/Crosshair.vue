<template>
  <div class="crosshair-container">
    <div class="crosshair">+</div>
    <CrosshairTooltip />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import CrosshairTooltip from './CrosshairTooltip.vue';

export default defineComponent({
  name: 'GameCrosshair',
  components: {
    CrosshairTooltip,
  },
});
</script>

<style lang="scss" scoped>
.crosshair-container {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  pointer-events: none;
}

.crosshair {
  color: white;
  font-size: 24px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  line-height: 1;
  user-select: none;
}
</style>

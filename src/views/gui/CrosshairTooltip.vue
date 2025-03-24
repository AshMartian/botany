`
<template>
  <div class="crosshair-tooltip" v-if="interactionText">
    <div class="tooltip-content">
      <span class="key">{{ interactionKey || 'F' }}</span>
      <span class="text">{{ interactionText }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { usePlayerStore } from '@/stores/playerStore';

export default defineComponent({
  name: 'CrosshairTooltip',

  setup() {
    const store = usePlayerStore();

    return {
      interactionText: computed(() => store.interaction?.text),
      interactionKey: computed(() => store.interaction?.key),
    };
  },
});
</script>

<style lang="scss" scoped>
.crosshair-tooltip {
  position: fixed;
  right: calc(50% - 4rem);
  top: 50%;
  transform: translate(-50%, 30px);
  background: rgba(0, 0, 0, 0.75);
  padding: 8px 12px;
  border-radius: 4px;
  color: white;
  font-family: 'Play', sans-serif;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px) saturate(180%);
  transition: opacity 0.3s ease;

  .tooltip-content {
    display: flex;
    align-items: center;
    gap: 8px;

    .key {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 18px;
      text-align: center;
      letter-spacing: normal;
    }

    .text {
      font-size: 14px;
    }
  }
}
</style>
`

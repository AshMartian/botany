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
import { useStore } from 'vuex';

export default defineComponent({
  name: 'CrosshairTooltip',

  setup() {
    const store = useStore();
    const interactionText = computed(() => store.state.interactionText);
    const interactionKey = computed(() => store.state.interactionKey);

    return {
      interactionText,
      interactionKey,
    };
  },
});
</script>

<style lang="scss" scoped>
.crosshair-tooltip {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, 30px);
  background: rgba(0, 0, 0, 0.75);
  padding: 8px 12px;
  border-radius: 4px;
  color: white;
  font-family: 'Play', sans-serif;
  pointer-events: none;
  z-index: 1000;

  .tooltip-content {
    display: flex;
    align-items: center;
    gap: 8px;

    .key {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 14px;
    }

    .text {
      font-size: 14px;
    }
  }
}
</style>
`

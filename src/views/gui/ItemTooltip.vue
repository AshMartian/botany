<template>
  <Teleport to="body">
    <div
      class="item-tooltip"
      :class="[rarity?.toLowerCase(), show ? 'visible' : 'hidden']"
      :style="position"
    >
      <div v-if="item" class="tooltip-container">
        <div class="tooltip-header">
          <span class="tooltip-title">{{ item.name }}</span>
        </div>

        <div class="tooltip-description">{{ description }}</div>

        <div v-if="item.stackable" class="tooltip-stack-info">
          Stack: {{ item.quantity }}/{{ item.maxStackSize }}
        </div>

        <div class="tooltip-actions">
          <div v-if="item.stackable && item.quantity > 1" class="item-action">
            <kbd>Shift+Click</kbd> to split
          </div>
          <div class="item-action"><kbd>Drag</kbd> to move</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import { useInventoryStore } from '@/stores/inventoryStore';

export default defineComponent({
  name: 'ItemTooltip',

  props: {
    item: {
      type: Object as () => IInventoryItem | null,
      default: null,
    },
    show: {
      type: Boolean,
      default: false,
    },
    targetRect: {
      type: Object as () => DOMRect | null,
      default: null,
    },
    isHotbarItem: {
      type: Boolean,
      default: false,
    },
  },

  setup(props) {
    const inventoryStore = useInventoryStore();
    const position = computed(() => {
      // Return previous position top/left if item is not hovered
      if (!props.targetRect) return {};

      if (props.isHotbarItem) {
        return {
          position: 'fixed' as const,
          left: `${props.targetRect.left + props.targetRect.width / 2}px`,
          bottom: `${window.innerHeight - props.targetRect.top + 10}px`,
          transform: 'translateX(-50%)' as const,
        };
      }

      return {
        position: 'fixed' as const,
        left: `${props.targetRect.right + 10}px`,
        top: `${props.targetRect.top + props.targetRect.height / 2}px`,
        transform: 'translateY(-50%)' as const,
      };
    });

    // Get item details from the store
    const itemClass = computed(() => (props.item ? inventoryStore.getItemClass(props.item) : null));

    const rarity = computed(() => itemClass.value?.getRarity());
    const description = computed(() => itemClass.value?.getDescription());

    return {
      position,
      rarity,
      description,
    };
  },
});
</script>

<style scoped>
.item-tooltip {
  position: fixed;
  width: 200px;
  background-color: rgba(20, 20, 20, 0.7);
  color: white;
  border-radius: 6px;
  padding: 10px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  pointer-events: none;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition:
    opacity,
    top,
    left 0.2s ease-out;
  opacity: 0;
}

.item-tooltip.visible {
  opacity: 1;
  visibility: visible;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 5px;
}

.tooltip-title {
  font-weight: 800;
  font-size: 16px;
}

.item-tooltip.common {
  border-color: #929292;
  .tooltip-title {
    color: #929292;
  }
}

.item-tooltip.uncommon {
  border-color: #2dc50e;
  .tooltip-title {
    color: #2dc50e;
  }
}

.item-tooltip.rare {
  border-color: #0070dd;
  .tooltip-title {
    color: #0070dd;
  }
}

.item-tooltip.epic {
  border-color: #a335ee;
  .tooltip-title {
    color: #a335ee;
  }
}

.item-tooltip.legendary {
  border-color: #ff8000;
  .tooltip-title {
    color: #ff8000;
  }
}

.tooltip-description {
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 8px;
  color: #cccccc;
}

.tooltip-stack-info {
  font-size: 11px;
  color: #aaaaaa;
  margin-bottom: 5px;
}

.tooltip-actions {
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-action {
  font-size: 11px;
  margin-bottom: 3px;
  color: #aaaaaa;
}

kbd {
  background-color: #333;
  border-radius: 3px;
  border: 1px solid #666;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  font-size: 10px;
  padding: 1px 4px;
  margin-right: 3px;
}
</style>

<template>
  <div
    class="inventory-item"
    :class="{ 'hotbar-item': isHotbarItem }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @mouseenter="$emit('hover', $event.target.getBoundingClientRect(), item)"
    @mouseleave="$emit('hover-end')"
  >
    <div class="item-image-container">
      <img :src="itemImageSrc" :alt="item.name" class="item-image" />
      <div v-if="item.quantity > 1" class="item-quantity">{{ item.quantity }}</div>
      <div v-if="showSlotNumber && slotNumber" class="slot-number">{{ slotNumber }}</div>
      <button
        v-if="removable"
        class="remove-item-btn"
        @click.stop="$emit('remove')"
        :title="`Remove ${item.name} from slot`"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { useInventoryStore } from '@/stores/inventoryStore';
import type { InventoryItemWithPosition } from '@/stores/inventoryStore';

export default defineComponent({
  name: 'InventoryItem',

  props: {
    item: {
      type: Object as () => InventoryItemWithPosition,
      required: true,
    },
    slotId: {
      type: String,
      default: '',
    },
    slotNumber: {
      type: Number,
      default: 0,
    },
    showSlotNumber: {
      type: Boolean,
      default: false,
    },
    removable: {
      type: Boolean,
      default: false,
    },
    isHotbarItem: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['remove', 'hover', 'hover-end', 'drag-start', 'drag-end'],

  setup(props, { emit }) {
    const inventoryStore = useInventoryStore();
    const isDragging = ref(false);
    const tooltipRef = ref<HTMLElement | null>(null);

    // Get the item class to access its properties
    const itemClass = inventoryStore.getItemClass(props.item);

    // Compute image source based on item ID
    const itemImageSrc = computed(() => {
      // If the item has a getImageUrl method, use it
      if (itemClass && itemClass.iconPath) {
        return itemClass.iconPath;
      }

      // Otherwise, use a default path based on item ID
      return `/resources/graphics/items/${props.item.id.toLowerCase()}.png`;
    });

    // Handle drag start
    const onDragStart = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      isDragging.value = true;
      emit('drag-start');

      // Set the drag data and effect
      event.dataTransfer.setData('stackId', props.item.stackId || '');
      event.dataTransfer.setData('itemId', props.item.id);
      event.dataTransfer.setData('slotId', props.slotId);
      event.dataTransfer.effectAllowed = 'move';
    };

    // Handle drag end
    const onDragEnd = () => {
      isDragging.value = false;
      emit('drag-end');
    };

    return {
      itemImageSrc,
      onDragStart,
      onDragEnd,
      isDragging,
      tooltipRef,
      rarity: itemClass?.getRarity(),
      description: itemClass?.getDescription(),
    };
  },
});
</script>

<style scoped>
.inventory-item {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s ease;
  transform-style: preserve-3d;
}

.inventory-item:hover {
  transform: scale(1.05);
}

.item-image-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 2;
  transform: translateZ(0);
  &:hover {
    filter: saturate(1.2);
  }
}

.item-image {
  max-width: 80%;
  max-height: 80%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.item-quantity {
  position: absolute;
  top: 5px;
  left: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  min-width: 16px;
  min-height: 16px;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2px;
}

.slot-number {
  position: absolute;
  bottom: 5px;
  left: 5px;
  font-size: 10px;
  color: white;
  opacity: 0.7;
}

.remove-item-btn {
  position: absolute;
  top: 0;
  right: 0;
  background: rgba(200, 0, 0, 0.6);
  color: white;
  border: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.inventory-item:hover .remove-item-btn {
  opacity: 1;
}

.remove-item-btn:hover {
  background: rgba(255, 0, 0, 0.8);
}

/* Tooltip Styles */
.item-tooltip {
  position: absolute;
  transform: translateZ(1px);
  width: 200px;
  background-color: rgba(20, 20, 20, 0.95);
  color: white;
  border-radius: 6px;
  padding: 10px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.item-tooltip.visible {
  opacity: 0 !important;
  visibility: hidden !important;
}

.inventory-item:hover .item-tooltip:not(.visible) {
  opacity: 1;
  visibility: visible;
  position: absolute;
  left: 100%;
  top: 50%;
  margin-left: 10px;
  transform: translateY(-50%) translateZ(1px);
}

/* Position the tooltip differently for hotbar items */
.hotbar-item .item-tooltip {
  top: auto;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
}

.hotbar-item:hover .item-tooltip {
  bottom: calc(100% + 10px);
  left: 50%;
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

.tooltip-rarity {
  font-size: 12px;
  padding: 2px 5px;
  border-radius: 3px;
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

.drag-image {
  width: 60px;
  height: 60px;
  opacity: 0.8;
  pointer-events: none;
}
</style>

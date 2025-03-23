<template>
  <div
    class="item-container"
    :class="{ 'hotbar-item': isHotbarItem }"
    draggable="true"
    @dragstart="onDragStart"
  >
    <img
      :src="itemDisplay?.iconPath || '/assets/textures/default-item.png'"
      :alt="itemDisplay?.name"
      class="item-icon"
    />
    <div class="item-quantity" v-if="itemDisplay?.stackable && itemDisplay?.quantity > 1">
      {{ itemDisplay?.quantity }}
    </div>
    <div class="item-tooltip">{{ itemDisplay?.name }}</div>

    <button v-if="removable" class="remove-item" @click.stop="$emit('remove')" title="Remove item">
      ×
    </button>
    <div v-if="showSlotNumber" class="slot-number">{{ slotNumber }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue';
import { IInventoryItem } from '@/models/inventory/InventoryItem';

// Extended interface to include stackId - for component props typing only
interface InventoryItemWithStackId extends IInventoryItem {
  stackId?: string;
}

export default defineComponent({
  name: 'InventoryItem',

  props: {
    item: {
      type: Object as PropType<InventoryItemWithStackId | null>,
      default: null,
    },
    slotNumber: {
      type: Number,
      default: null,
    },
    showSlotNumber: {
      type: Boolean,
      default: false,
    },
    removable: {
      type: Boolean,
      default: true,
    },
    slotId: {
      type: [String, Number],
      default: null,
    },
    isHotbarItem: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['remove', 'click', 'dragstart'],

  setup(props, { emit }) {
    // Use computed to track item changes
    const itemDisplay = computed(() => props.item);

    const onDragStart = (event: DragEvent) => {
      if (!props.item || !event.dataTransfer || !props.item.stackId) {
        return;
      }

      // Prevent default drag image
      if (event.dataTransfer.setDragImage) {
        const emptyImg = document.createElement('img');
        event.dataTransfer.setDragImage(emptyImg, 0, 0);
      }

      // Set the drag data
      event.dataTransfer.setData('stackId', props.item.stackId);
      event.dataTransfer.setData('sourceSlotId', props.slotId?.toString() || '');

      emit('dragstart', { event, item: props.item });
    };

    return {
      onDragStart,
      itemDisplay,
    };
  },
});
</script>

<style scoped>
.item-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 5px;
  position: relative;
  border-radius: 5px;
}

.item-icon {
  min-width: 100%;
  min-height: 100%;
  object-fit: contain;
  border-radius: 5px;
  overflow: hidden;
}

.item-quantity {
  position: absolute;
  top: 5px;
  left: 5px;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
  color: white;
}

.item-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 101;
}

.item-container:hover .item-tooltip {
  opacity: 1;
}

.slot-number {
  position: absolute;
  bottom: 4px;
  left: 5px;
  font-size: 10px;
  opacity: 0.7;
  color: white;
}

.remove-item {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: white;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  display: none;
  padding: 0;
  line-height: 1;
  font-size: 12px;
  z-index: 5;
}

.item-container:hover .remove-item {
  display: block;
}

.remove-item:hover {
  background: rgba(255, 0, 0, 0.6);
}

/* Specific styling for hotbar items */
.hotbar-item {
  max-width: 100%;
}

/* Remove the drag-preview style since we're handling it in JS */
.drag-preview {
  display: none;
}
</style>

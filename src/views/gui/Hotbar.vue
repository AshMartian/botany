<template>
  <div
    class="hotbar-container"
    data-testid="hotbar-component"
    :class="{ 'inventory-mode': inInventory }"
  >
    <div
      v-for="slotIndex in 9"
      :key="'hotbar-' + (slotIndex - 1)"
      class="hotbar-slot"
      :class="{ active: slotIndex - 1 === activeSlot }"
      @click="(e: any) => selectSlot(slotIndex - 1, e)"
      @dragover.prevent
      @drop="(e: any) => onDropToHotbar(e, slotIndex - 1)"
    >
      <template v-if="getItemAtPosition('hotbar', slotIndex - 1)">
        <InventoryItem
          :item="getItemAtPosition('hotbar', slotIndex - 1)!"
          :slot-number="slotIndex"
          :show-slot-number="true"
          :removable="true"
          :slot-id="'hotbar-' + (slotIndex - 1)"
          :is-hotbar-item="true"
          @remove="removeItemFromSlot(slotIndex - 1)"
          @hover="onItemHover"
          @hover-end="onItemHoverEnd"
          @dragstart="onDragStart"
          @dragend="onDragEnd"
        />
      </template>
      <div v-else class="slot-number">{{ slotIndex }}</div>
    </div>

    <ItemTooltip
      :item="hoveredItem"
      :show="!!hoveredItem"
      :target-rect="tooltipTarget"
      :is-hotbar-item="true"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import InventoryItem from './InventoryItem.vue';
import ItemTooltip from './ItemTooltip.vue';
import { useInventoryStore } from '@/stores/inventoryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { InventoryItemWithPosition } from '@/stores/inventoryStore';

export default defineComponent({
  name: 'GameHotbar',

  components: {
    InventoryItem,
    ItemTooltip,
  },

  props: {
    // Add a prop to adjust styling/behavior when used within inventory
    inInventory: {
      type: Boolean,
      default: false,
    },
  },

  setup() {
    // Use Pinia stores
    const inventoryStore = useInventoryStore();
    const playerStore = usePlayerStore();

    // Get player ID from player store
    const playerId = computed(() => playerStore.currentPlayerId || 'default');

    // Use a ref for the active slot since we don't have a Pinia store for hotbar yet
    const activeSlot = ref(0);

    // Get item at position using the store getter
    const getItemAtPosition = (
      type: 'inventory' | 'hotbar',
      index: number
    ): InventoryItemWithPosition | undefined => {
      return inventoryStore.getItemAtPosition(type, index);
    };

    const selectSlot = async (slotIndex: number, event: MouseEvent) => {
      const item = getItemAtPosition('hotbar', slotIndex);
      if (!item || !playerId.value) return;

      if ((event.shiftKey || event.ctrlKey) && item.stackable && item.quantity > 1) {
        const newQuantity = event.shiftKey ? Math.floor(item.quantity / 2) : 1;
        const remainingQuantity = item.quantity - newQuantity;

        // Find first empty inventory slot
        let emptySlotIndex = 0;
        while (getItemAtPosition('inventory', emptySlotIndex) && emptySlotIndex < 27) {
          emptySlotIndex++;
        }

        if (emptySlotIndex < 27) {
          await inventoryStore.updateItemQuantity(playerId.value, item.stackId, remainingQuantity);

          await inventoryStore.addSplitStack(playerId.value, item, newQuantity, {
            type: 'inventory',
            index: emptySlotIndex,
          });
        }
        return;
      }

      activeSlot.value = slotIndex;
    };

    const onDropToHotbar = async (event: DragEvent, slotIndex: number) => {
      if (!event.dataTransfer || !playerId.value) return;

      const stackId = event.dataTransfer.getData('stackId');
      if (!stackId) {
        console.warn('No stackId found in drag data');
        return;
      }

      try {
        // Move the item to the hotbar position using Pinia action
        await inventoryStore.moveItem(playerId.value, stackId, {
          type: 'hotbar',
          index: slotIndex,
        });
      } catch (error) {
        console.error('Error moving item to hotbar:', error);
        // If there was an error, force a refresh anyway
        if (playerId.value) {
          await inventoryStore.forceRefreshInventory(playerId.value);
        }
      }
    };

    const removeItemFromSlot = async (slotIndex: number) => {
      // Find the item at this hotbar position
      const item = getItemAtPosition('hotbar', slotIndex);
      if (!item?.stackId || !playerId.value) return;
      tooltipTarget.value = null;

      // Find an empty inventory slot
      let emptySlotIndex = 0;
      while (getItemAtPosition('inventory', emptySlotIndex) && emptySlotIndex < 27) {
        emptySlotIndex++;
      }

      if (emptySlotIndex < 27) {
        // Move the item to the inventory using Pinia action
        await inventoryStore.moveItem(playerId.value, item.stackId, {
          type: 'inventory',
          index: emptySlotIndex,
        });
      } else {
        console.warn('Inventory is full, item cannot be moved from hotbar');
      }
    };

    const isDragging = ref(false);

    const hoveredItem = ref<InventoryItemWithPosition | null>(null);
    const tooltipTarget = ref<DOMRect | null>(null);

    const onItemHover = (rect: DOMRect, item: InventoryItemWithPosition) => {
      if (!isDragging.value) {
        hoveredItem.value = item;
        tooltipTarget.value = rect;
      }
    };

    const onItemHoverEnd = () => {
      hoveredItem.value = null;
      tooltipTarget.value = null;
    };

    const onDragStart = () => {
      isDragging.value = true;
      hoveredItem.value = null;
      tooltipTarget.value = null;
    };

    const onDragEnd = () => {
      isDragging.value = false;
    };

    return {
      activeSlot,
      getItemAtPosition,
      selectSlot,
      onDropToHotbar,
      removeItemFromSlot,
      isDragging,
      hoveredItem,
      tooltipTarget,
      onItemHover,
      onItemHoverEnd,
      onDragStart,
      onDragEnd,
    };
  },
});
</script>

<style scoped>
.hotbar-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  z-index: 100;
  backdrop-filter: blur(10px) saturate(180%);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

/* Styling for when the hotbar is used inside the inventory */
.hotbar-container.inventory-mode {
  position: static;
  transform: none;
  background-color: transparent;
  box-shadow: none;
  padding: 0;
  justify-content: center;
}

.hotbar-slot {
  background-color: rgba(60, 60, 60, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  width: 60px;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.inventory-mode .hotbar-slot {
  width: 70px;
  height: 70px;
}

.hotbar-slot:hover {
  background-color: rgba(80, 80, 80, 0.7);
  transform: translateY(-2px);
}

.hotbar-slot.active {
  border-color: rgba(255, 215, 0, 0.8);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.7);
  transform: translateY(-3px);
}

.slot-number {
  position: absolute;
  bottom: 3px;
  left: 3px;
  font-size: 10px;
  opacity: 0.7;
  color: white;
  pointer-events: none;
}
</style>

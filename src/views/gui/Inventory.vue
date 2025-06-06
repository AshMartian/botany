<template>
  <div class="inventory-panel no_focus_game" v-if="isOpen">
    <div class="inventory-header">
      <h2>Inventory</h2>
      <button class="close-btn" @click="closeInventory">×</button>
    </div>

    <div class="inventory-content">
      <!-- Main inventory grid - 3 rows x 9 columns -->
      <div class="inventory-grid">
        <div
          v-for="index in 27"
          :key="'inv-' + (index - 1)"
          class="inventory-slot"
          @dragover.prevent
          @drop.stop="(e: any) => onDrop(e, index - 1)"
          @click.stop="
            (e: any) => onInventorySlotClick(getItemAtPosition('inventory', index - 1), e)
          "
        >
          <template v-if="getItemAtPosition('inventory', index - 1)">
            <InventoryItem
              :item="getItemAtPosition('inventory', index - 1)!"
              :slot-id="'inv-' + (index - 1)"
              :removable="false"
              @hover="onItemHover"
              @hover-end="onItemHoverEnd"
              @dragstart="onDragStart"
              @dragend="onDragEnd"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Using the Hotbar component for hotbar slots -->
    <div class="inventory-hotbar-container">
      <Hotbar class="inventory-hotbar" :inInventory="true" />
    </div>

    <div class="inventory-instructions">
      <p>Drag items between inventory slots and hotbar</p>
      <p>Press 1-9 keys to select hotbar slots</p>
      <p>Press I or ESC to close inventory</p>
    </div>

    <ItemTooltip
      :item="hoveredItem"
      :show="!!hoveredItem"
      :target-rect="tooltipTarget"
      :is-hotbar-item="false"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, onMounted, onBeforeUnmount } from 'vue';
import type { InventoryItemWithPosition } from '@/stores/inventoryStore';
import Hotbar from './Hotbar.vue';
import InventoryItem from './InventoryItem.vue';
import ItemTooltip from './ItemTooltip.vue';
import { useInventoryStore } from '@/stores/inventoryStore';
import { usePlayerStore } from '@/stores/playerStore';

export default defineComponent({
  name: 'InventoryPanel',

  components: {
    Hotbar,
    InventoryItem,
    ItemTooltip,
  },

  setup() {
    const inventoryStore = useInventoryStore();
    const playerStore = usePlayerStore();
    const playerId = computed(() => playerStore.currentPlayerId || 'default');
    const isOpen = computed(() => inventoryStore.isOpen);
    const isDragging = ref(false);

    const getItemAtPosition = (type: 'inventory' | 'hotbar', index: number) => {
      return inventoryStore.getItemAtPosition(type, index);
    };

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

    // Handle dropping items
    const onDrop = async (event: DragEvent & Record<string, never>, index: number) => {
      event.preventDefault();
      if (!event.dataTransfer || !playerId.value) return;

      const stackId = event.dataTransfer.getData('stackId');
      if (!stackId) {
        console.warn('No stackId found in drag data');
        return;
      }

      try {
        await inventoryStore.moveItem(playerId.value, stackId, {
          type: 'inventory',
          index: index,
        });
      } catch (error) {
        console.error('Error moving item:', error);
        if (playerId.value) {
          await inventoryStore.forceRefreshInventory(playerId.value);
        }
      }
    };

    // Handle clicking items
    const onInventorySlotClick = async (
      item: InventoryItemWithPosition | undefined,
      event: MouseEvent & Record<string, never>
    ) => {
      if (!item || !playerId.value) return;

      // Handle shift-click for stack splitting
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

      // Regular item use
      await inventoryStore.useItem(playerId.value, item.stackId);
    };

    // Add keyboard event handling
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isOpen.value &&
        (event.code === 'Escape' || event.code === 'KeyI' || event.code === 'Tab')
      ) {
        console.log('Closing inventory via key press');
        closeInventory();
        event.preventDefault();
        event.stopImmediatePropagation();
        return false;
      }
    };

    // Add and remove event listeners
    onMounted(async () => {
      window.addEventListener('keydown', handleKeyDown, true);

      // Initialize inventory when component mounts
      if (playerId.value) {
        await inventoryStore.initializeInventory(playerId.value);
      }
    });

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeyDown, true);
    });

    const closeInventory = () => {
      // re-capture the cursor
      try {
        const canvas = document.getElementById('canvas');
        if (canvas && canvas.requestPointerLock) {
          canvas.requestPointerLock();
        }
      } catch (error) {
        console.warn('Pointer lock request failed:', error);
      }

      // Use Pinia action instead of Vuex mutation
      inventoryStore.toggleInventory();
    };

    const useItem = async (item: InventoryItemWithPosition & { stackId?: string }) => {
      if (item?.stackId && playerId.value) {
        // Use the useItem action from the store
        await inventoryStore.useItem(playerId.value, item.stackId);
      }
    };

    return {
      isOpen,
      getItemAtPosition,
      closeInventory,
      useItem,
      onDrop,
      onInventorySlotClick,
      hoveredItem,
      tooltipTarget,
      onItemHover,
      onItemHoverEnd,
      isDragging,
      onDragStart,
      onDragEnd,
    };
  },
});
</script>

<style scoped>
.drag-preview {
  position: fixed;
  pointer-events: none;
  z-index: 1000;
  opacity: 0.8;
}

.drag-preview img {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  backdrop-filter: blur(5px);
  overflow: hidden;
  border-radius: 6px;
}

.inventory-panel {
  position: absolute;
  user-select: none;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(20, 20, 20, 0.9);
  border-radius: 8px;
  padding: 20px;
  color: white;
  width: 80%;
  max-width: 900px;
  z-index: 1000;
  backdrop-filter: blur(10px) saturate(180%);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.inventory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 10px;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.close-btn:hover {
  transform: scale(1.2);
  color: #ff5555;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.inventory-slot {
  background-color: rgba(60, 60, 60, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  height: 70px;
  width: 70px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  /* Added hover effect for inventory slots */
  &:hover {
    background-color: rgba(80, 80, 80, 0.7);
    transform: translateY(-2px);
  }
}

.inventory-slot:hover {
  background-color: rgba(80, 80, 80, 0.7);
  transform: translateY(-2px);
}

.inventory-hotbar-container {
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
  margin-bottom: 15px;
}

.inventory-hotbar {
  /* Style overrides for hotbar when displayed in inventory */
  position: static !important;
  transform: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.inventory-instructions {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 10px;
}

.inventory-instructions p {
  margin: 5px 0;
}
</style>

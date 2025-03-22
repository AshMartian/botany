<template>
  <div class="inventory-panel no_focus_game" v-if="isOpen">
    <div class="inventory-header">
      <h2>Inventory</h2>
      <button class="close-btn" @click="closeInventory">×</button>
    </div>
    <div class="inventory-content">
      <div class="inventory-grid">
        <div
          v-for="(item, index) in items"
          :key="index"
          class="inventory-slot"
          draggable="true"
          @dragstart="onDragStart($event, item)"
          @dragover.prevent
          @drop="onDrop($event, index)"
          @click="useItem(item)"
        >
          <div v-if="item" class="item-container">
            <img
              :src="item.iconPath || '/assets/textures/default-item.png'"
              :alt="item.name"
              class="item-icon"
            />
            <div class="item-quantity" v-if="item.stackable && item.quantity > 1">
              {{ item.quantity }}
            </div>
            <div class="item-name">{{ item.name }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="inventory-hotbar">
      <div
        v-for="slot in hotbarSlots"
        :key="slot.slotIndex"
        class="hotbar-slot"
        :class="{ active: slot.slotIndex === activeHotbarSlot }"
        @dragover.prevent
        @drop="onDropToHotbar($event, slot.slotIndex)"
        @click="setActiveHotbarSlot(slot.slotIndex)"
      >
        <div v-if="getItemForSlot(slot)" class="item-container">
          <img
            :src="getItemForSlot(slot)?.iconPath || '/assets/textures/default-item.png'"
            :alt="getItemForSlot(slot)?.name"
            class="item-icon"
          />
          <div
            class="item-quantity"
            v-if="getItemForSlot(slot)?.stackable && getItemForSlot(slot)?.quantity > 1"
          >
            {{ getItemForSlot(slot)?.quantity }}
          </div>
        </div>
        <div class="slot-number">{{ slot.slotIndex + 1 }}</div>
      </div>
    </div>
    <div class="inventory-instructions">
      <p>Drag items to hotbar slots for quick access</p>
      <p>Press 1-9 keys to select hotbar slots</p>
      <p>Press I or ESC to close inventory</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import { IInventoryItem } from '@/models/inventory/InventoryItem';

export default defineComponent({
  name: 'InventoryPanel',

  setup() {
    const store = useStore();

    const isOpen = computed(() => store.getters['inventory/isInventoryOpen']);
    const items = computed(() => store.getters['inventory/allItems']);
    const hotbarSlots = computed(() => store.getters['hotbar/getAllSlots']);
    const activeHotbarSlot = computed(() => store.getters['hotbar/getActiveSlot']);

    const getItemForSlot = (slot: { itemId: string | null }) => {
      if (!slot.itemId) return null;
      return store.getters['inventory/getItemById'](slot.itemId);
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
        event.stopImmediatePropagation(); // Use stopImmediatePropagation to ensure no other handlers run
        return false;
      }
    };

    // Add and remove event listeners
    onMounted(() => {
      window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    });

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeyDown, true); // Use capture phase
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
      store.commit('inventory/SET_INVENTORY_OPEN', false);
    };

    const useItem = (item: IInventoryItem) => {
      if (item.use) {
        store.dispatch('inventory/useItem', item.id);
      }
    };

    const setActiveHotbarSlot = (slotIndex: number) => {
      store.commit('hotbar/SET_ACTIVE_SLOT', slotIndex);
    };

    const onDragStart = (event: DragEvent, item: IInventoryItem) => {
      if (event.dataTransfer) {
        event.dataTransfer.setData('itemId', item.id);
        // Set a custom drag image if needed
        const img = new Image();
        img.src = item.iconPath || '/assets/textures/default-item.png';
        event.dataTransfer.setDragImage(img, 25, 25);
      }
    };

    const onDrop = (event: DragEvent, index: number) => {
      event.preventDefault();
      if (event.dataTransfer) {
        const itemId = event.dataTransfer.getData('itemId');
        console.log(`Dropped item ${itemId} to inventory slot ${index}`);
        // Here you could implement inventory slot swapping logic
      }
    };

    const onDropToHotbar = (event: DragEvent, slotIndex: number) => {
      event.preventDefault();
      if (event.dataTransfer) {
        const itemId = event.dataTransfer.getData('itemId');
        store.dispatch('hotbar/equipItemToSlot', { slotIndex, itemId });
      }
    };

    return {
      isOpen,
      items,
      hotbarSlots,
      activeHotbarSlot,
      getItemForSlot,
      closeInventory,
      useItem,
      setActiveHotbarSlot,
      onDragStart,
      onDrop,
      onDropToHotbar,
    };
  },
});
</script>

<style scoped>
.inventory-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(20, 20, 20, 0.9);
  border-radius: 8px;
  padding: 20px;
  color: white;
  width: 80%;
  max-width: 800px;
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
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.inventory-slot {
  background-color: rgba(60, 60, 60, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.inventory-slot:hover {
  background-color: rgba(80, 80, 80, 0.7);
  transform: translateY(-2px);
}

.inventory-hotbar {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
  margin-bottom: 15px;
}

.hotbar-slot {
  background-color: rgba(60, 60, 60, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  width: 80px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hotbar-slot:hover {
  background-color: rgba(80, 80, 80, 0.7);
  transform: translateY(-2px);
}

.hotbar-slot.active {
  border-color: rgba(255, 215, 0, 0.8);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.7);
}

.slot-number {
  position: absolute;
  bottom: 5px;
  right: 5px;
  font-size: 12px;
  opacity: 0.7;
}

.item-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 5px;
}

.item-icon {
  max-width: 80%;
  max-height: 60%;
  object-fit: contain;
}

.item-quantity {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.item-name {
  font-size: 12px;
  text-align: center;
  margin-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
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

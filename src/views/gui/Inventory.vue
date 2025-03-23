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
          @drop="onDrop($event, index - 1)"
          @click="onInventorySlotClick(getItemAtPosition('inventory', index - 1))"
        >
          <InventoryItem
            v-if="getItemAtPosition('inventory', index - 1)"
            :item="getItemAtPosition('inventory', index - 1)"
            :slot-id="'inv-' + (index - 1)"
            :removable="false"
          />
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
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import Hotbar from './Hotbar.vue';
import InventoryItem from './InventoryItem.vue';

export default defineComponent({
  name: 'InventoryPanel',

  components: {
    Hotbar,
    InventoryItem,
  },

  setup() {
    const store = useStore();
    const isOpen = computed(() => store.getters['inventory/isInventoryOpen']);

    // Get item at a specific position
    const getItemAtPosition = (type: 'inventory' | 'hotbar', index: number) => {
      return store.getters['inventory/getItemAtPosition'](type, index);
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
      store.commit('inventory/SET_INVENTORY_OPEN', false);
    };

    const useItem = (item: IInventoryItem) => {
      if (item?.use) {
        store.dispatch('inventory/useItem', item.id);
      }
    };

    const onDrop = (event: any, index: number) => {
      event.preventDefault();
      if (event.dataTransfer) {
        const itemId = event.dataTransfer.getData('itemId');

        if (itemId) {
          // Move the item to the new position in the inventory
          store.dispatch('inventory/moveItem', {
            itemId,
            newPosition: {
              type: 'inventory',
              index: index,
            },
          });
        }
      }
    };

    const onInventorySlotClick = (item: IInventoryItem | null) => {
      if (item) {
        useItem(item);
      }
    };

    return {
      isOpen,
      getItemAtPosition,
      closeInventory,
      useItem,
      onDrop,
      onInventorySlotClick,
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

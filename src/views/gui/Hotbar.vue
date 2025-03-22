<template>
  <div class="hotbar-container">
    <div
      v-for="slot in slots"
      :key="slot.slotIndex"
      class="hotbar-slot"
      :class="{ active: slot.slotIndex === activeSlot }"
      @click="selectSlot(slot.slotIndex)"
      @dragover.prevent
      @drop="onDropToHotbar($event, slot.slotIndex)"
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
        <div class="item-tooltip">{{ getItemForSlot(slot)?.name }}</div>
      </div>
      <div class="slot-number">{{ slot.slotIndex + 1 }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useStore } from 'vuex';

export default defineComponent({
  name: 'GameHotbar',

  setup() {
    const store = useStore();

    const slots = computed(() => store.getters['hotbar/getAllSlots']);
    const activeSlot = computed(() => store.getters['hotbar/getActiveSlot']);

    const getItemForSlot = (slot: { itemId: string | null }) => {
      if (!slot.itemId) return null;
      return store.getters['inventory/getItemById'](slot.itemId);
    };

    const selectSlot = (slotIndex: number) => {
      store.commit('hotbar/SET_ACTIVE_SLOT', slotIndex);
    };

    const onDropToHotbar = (event: DragEvent, slotIndex: number) => {
      event.preventDefault();
      if (event.dataTransfer) {
        const itemId = event.dataTransfer.getData('itemId');
        if (itemId) {
          store.dispatch('hotbar/equipItemToSlot', { slotIndex, itemId });
        }
      }
    };

    return {
      slots,
      activeSlot,
      getItemForSlot,
      selectSlot,
      onDropToHotbar,
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

.hotbar-slot:hover {
  background-color: rgba(80, 80, 80, 0.7);
  transform: translateY(-2px);
}

.hotbar-slot.active {
  border-color: rgba(255, 215, 0, 0.8);
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.7);
  transform: translateY(-3px);
}

.item-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 5px;
  position: relative;
}

.item-icon {
  max-width: 80%;
  max-height: 70%;
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
  bottom: 3px;
  left: 3px;
  font-size: 10px;
  opacity: 0.7;
  color: white;
}
</style>

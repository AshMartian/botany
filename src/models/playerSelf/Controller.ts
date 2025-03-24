import { Scene, KeyboardEventTypes } from '@babylonjs/core';
import store from '@/store/store';
import storeVuex from '@/store/vuex';
import { Player } from '@/store/types';
import { InventoryItemWithPosition } from '@/store/vuex/inventory';

export default class Controller {
  sensitiveMouse: number;
  mouseIsCaptured: boolean | Element;
  store: any;
  scene: Scene;
  playerId: string;
  player: Player;

  constructor() {
    this.sensitiveMouse = 0.004;
    this.mouseIsCaptured = false;
    this.scene = globalThis.scene;
    this.playerId = store.getSelfPlayerId();
    this.player = store.getSelfPlayer();

    this.mouseEvent();

    this.scene.onKeyboardObservable.add((event) => {
      this.keyEvent(event);
    });
  }

  private keyEvent(e: any) {
    // Don't handle keyboard events when clicking inside inventory
    const target = e.event.target as HTMLElement;
    if (target.closest('.inventory-panel')) {
      return;
    }

    const forward = { ...this.player.move.forward };
    const eventCode = e.event.code;
    const eventType = e.type;

    if (KeyboardEventTypes.KEYDOWN === eventType) {
      if (eventCode === 'KeyW') {
        forward.front = true;
      }

      if (eventCode === 'KeyS') {
        forward.back = true;
      }

      if (eventCode === 'KeyA') {
        forward.left = true;
      }

      if (eventCode === 'KeyD') {
        forward.right = true;
      }

      // Add shift key detection for sprint
      if (eventCode === 'ShiftLeft' || eventCode === 'ShiftRight') {
        forward.sprint = true;
      }

      if (eventCode === 'Space') {
        store.setJump(this.playerId, true);
      }

      // Handle inventory opening with I key or Escape key or Tab key
      if (eventCode === 'KeyI' || eventCode === 'Escape' || eventCode === 'Tab') {
        const currentState = storeVuex.getters['inventory/isInventoryOpen'];

        // Only handle opening the inventory, not closing
        if (!currentState) {
          console.log('Opening inventory from Controller');
          storeVuex.commit('inventory/SET_INVENTORY_OPEN', true);

          // Release pointer lock when opening inventory
          if (document.pointerLockElement) {
            document.exitPointerLock();
            this.mouseIsCaptured = false;
          }
        }

        // If inventory is already open, let the Inventory component handle closing
        if (currentState) {
          return;
        }
      }

      // Hotbar selection with number keys (1-9)
      if (eventCode.match(/^Digit[1-9]$/)) {
        const slotIndex = parseInt(eventCode.replace('Digit', '')) - 1;
        console.log(`Setting hotbar active slot to: ${slotIndex}`);
        storeVuex.commit('hotbar/SET_ACTIVE_SLOT', slotIndex);

        // Get the item in the selected slot
        const slots = storeVuex.getters['inventory/getHotbarItems'];
        const selectedSlot = slots[slotIndex] as InventoryItemWithPosition;

        if (selectedSlot && selectedSlot.stackId) {
          // If there's an item in the slot, use it
          storeVuex.dispatch('inventory/useItem', selectedSlot.stackId);
        } else {
          console.log(`No item in hotbar slot ${slotIndex}`, selectedSlot, slots);
        }
      }
    }

    if (KeyboardEventTypes.KEYUP === eventType) {
      if (eventCode === 'KeyW') {
        forward.front = false;
      }

      if (eventCode === 'KeyS') {
        forward.back = false;
      }

      if (eventCode === 'KeyA') {
        forward.left = false;
      }

      if (eventCode === 'KeyD') {
        forward.right = false;
      }

      // Add shift key detection for sprint
      if (eventCode === 'ShiftLeft' || eventCode === 'ShiftRight') {
        forward.sprint = false;
      }

      if (eventCode === 'Space') {
        store.setJump(this.playerId, false);
      }
    }

    store.setForward(this.playerId, forward);
  }

  private mouseEvent() {
    const elementContent = document.getElementById('level') as HTMLElement;

    elementContent.addEventListener('click', (e) => {
      // Check if inventory is open - don't capture if it is
      const inventoryOpen = storeVuex.getters['inventory/isInventoryOpen'] || false;
      if (inventoryOpen) {
        return; // Don't capture mouse when inventory is open
      }

      const checkFocusAvailable = e.composedPath().find((item) => {
        const itemChecked = item as HTMLElement;
        if (itemChecked.tagName !== undefined) {
          return itemChecked.classList.contains('no_focus_game');
        }

        return false;
      });

      if (!checkFocusAvailable) {
        this.mouseIsCaptured = true;
        this.requestPointerLock();
      }
    });

    const pointerlockchange = () => {
      this.mouseIsCaptured = document.pointerLockElement || false;

      // Handle pointer lock release
      if (!this.mouseIsCaptured) {
        console.log('Pointer lock released');
      }
    };

    document.addEventListener('pointerlockchange', pointerlockchange, false);

    // Handle pointer lock errors
    document.addEventListener('pointerlockerror', (event) => {
      console.warn('Pointer lock error:', event);
      this.mouseIsCaptured = false;
    });

    window.addEventListener('pointermove', (e) => {
      if (this.mouseIsCaptured) {
        const rotateX = e.movementY * this.sensitiveMouse;
        const rotateY = e.movementX * this.sensitiveMouse;
        store.setRotate(this.playerId, rotateX, rotateY);
      }
    });
  }

  private requestPointerLock() {
    try {
      const canvas = document.getElementById('canvas');
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    } catch (error) {
      console.warn('Pointer lock request failed:', error);
      this.mouseIsCaptured = false;
    }
  }
}

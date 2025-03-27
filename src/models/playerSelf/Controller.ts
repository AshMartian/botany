import { Scene, KeyboardEventTypes, Vector3 } from '@babylonjs/core';
import { usePlayerStore } from '@/stores/playerStore';
import { useInventoryStore, InventoryItemWithPosition } from '@/stores/inventoryStore';

export default class Controller {
  sensitiveMouse: number;
  mouseIsCaptured: boolean | Element;
  scene: Scene;

  constructor() {
    this.sensitiveMouse = 0.004;
    this.mouseIsCaptured = false;
    this.scene = globalThis.scene;
    // Initialize resource collector service

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

    const playerStore = usePlayerStore();
    if (!playerStore.selfPlayer) {
      console.warn('Player not found in store');
      return;
    }

    const forward = { ...playerStore.selfPlayer?.move.forward };
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
        playerStore.setJump(playerStore.selfPlayer.id, true);
      }

      const inventoryStore = useInventoryStore();
      // Handle inventory opening with I key or Escape key or Tab key
      if (eventCode === 'KeyI' || eventCode === 'Escape' || eventCode === 'Tab') {
        const currentState = inventoryStore.isInventoryOpen;
        // Only handle opening the inventory, not closing
        if (!currentState) {
          console.log('Opening inventory from Controller');
          inventoryStore.toggleInventory();
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
        inventoryStore.setActiveHotbarSlot(slotIndex);
        // Get the item in the selected slot
        const slots = inventoryStore.hotbarItems;
        const selectedSlot = slots[slotIndex] as InventoryItemWithPosition;
        if (selectedSlot && selectedSlot.stackId) {
          // If there's an item in the slot, use it
          inventoryStore.useItem(playerStore.selfPlayer.id, selectedSlot.stackId);
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
        playerStore.setJump(playerStore.selfPlayer.id, false);
      }
    }

    playerStore.setForward(playerStore.selfPlayer.id, forward);
  }

  private mouseEvent() {
    const elementContent = document.getElementById('level') as HTMLElement;

    elementContent.addEventListener('click', (e) => {
      // Check if inventory is open - don't capture if it is
      const inventoryOpen = useInventoryStore().isOpen;
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
        const playerStore = usePlayerStore();
        if (playerStore.selfPlayer) {
          playerStore.setRotate(playerStore.selfPlayer.id, rotateX, rotateY);
        }
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

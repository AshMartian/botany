import { Scene, KeyboardEventTypes, Observer, Nullable } from '@babylonjs/core'; // Removed Vector3, Added Observer, Nullable
import { usePlayerStore } from '@/stores/playerStore';
import { useInventoryStore, InventoryItemWithPosition } from '@/stores/inventoryStore';

// Keep track of controller instances for HMR cleanup
// Note: This simple approach assumes only one controller is active at a time,
// or that HMR disposes the old module entirely before creating a new one.
// A more robust solution might involve a static registry if multiple
// independent controllers could exist.
let currentControllerInstance: Controller | null = null;

export default class Controller {
  sensitiveMouse: number;
  mouseIsCaptured: boolean | Element;
  scene: Scene;

  // --- Properties to hold listeners/observers for cleanup ---
  private _elementContent: HTMLElement | null = null;
  private _mouseClickListener: ((e: MouseEvent) => void) | null = null;
  private _pointerLockChangeListener: (() => void) | null = null;
  private _pointerLockErrorListener: ((e: Event) => void) | null = null; // Added for error listener
  private _pointerMoveListener: ((e: MouseEvent) => void) | null = null;
  private _keyboardObserver: Nullable<Observer<any>> = null; // Use Babylon's Nullable type

  constructor() {
    this.sensitiveMouse = 0.004;
    this.mouseIsCaptured = false;
    this.scene = globalThis.scene;

    this.mouseEvent();
    // Store the observer when adding it
    this._keyboardObserver = this.scene.onKeyboardObservable.add((event) => {
      this.keyEvent(event);
    });

    // Track this instance for HMR
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentControllerInstance = this;
    console.log('🎮 Controller instance created.');
  }

  private keyEvent(e: any) {
    // Don't handle keyboard events when clicking inside inventory or other UI elements
    const target = e.event.target as HTMLElement;
    // Check common UI containers or elements that should prevent game keybinds
    if (target.closest('.inventory-panel, .settings-panel, input, textarea, button')) {
      return;
    }

    const playerStore = usePlayerStore();
    // Use optional chaining for safety, player might not be ready
    const selfPlayer = playerStore.selfPlayer;
    if (!selfPlayer) {
      // console.warn('Controller keyEvent: Player not found in store');
      return;
    }

    // Ensure move object exists
    if (!selfPlayer.move) return;

    const forward = { ...selfPlayer.move.forward };
    const eventCode = e.event.code;
    const eventType = e.type;

    if (KeyboardEventTypes.KEYDOWN === eventType) {
      if (eventCode === 'KeyW') forward.front = true;
      if (eventCode === 'KeyS') forward.back = true;
      if (eventCode === 'KeyA') forward.left = true;
      if (eventCode === 'KeyD') forward.right = true;
      if (eventCode === 'ShiftLeft' || eventCode === 'ShiftRight') forward.sprint = true;
      if (eventCode === 'Space') playerStore.setJump(selfPlayer.id, true);

      const inventoryStore = useInventoryStore();
      // Handle inventory toggle with I key or Tab key (Escape handled by Inventory.vue)
      if (eventCode === 'KeyI' || eventCode === 'Tab') {
        e.event.preventDefault(); // Prevent default Tab behavior
        const currentState = inventoryStore.isInventoryOpen;
        console.log(`Toggling inventory from Controller (current: ${currentState})`);
        inventoryStore.toggleInventory();
        // Release pointer lock if inventory is opening
        if (!currentState && document.pointerLockElement) {
          document.exitPointerLock();
          this.mouseIsCaptured = false;
        }
      }

      // Hotbar selection with number keys (1-9)
      if (eventCode.match(/^Digit[1-9]$/)) {
        const slotIndex = parseInt(eventCode.replace('Digit', '')) - 1;
        console.log(`Setting hotbar active slot to: ${slotIndex}`);
        inventoryStore.setActiveHotbarSlot(slotIndex);
        // Get the item in the selected slot
        const slots = inventoryStore.hotbarItems;
        const selectedSlot = slots[slotIndex] as InventoryItemWithPosition | undefined; // Type correctly
        if (selectedSlot?.stackId) {
          // Use optional chaining
          // If there's an item in the slot, use it (consider if 'use' should happen on key press or click)
          // inventoryStore.useItem(selfPlayer.id, selectedSlot.stackId); // Decide if use happens here or on click
          console.log(`Selected item: ${selectedSlot.name}`);
        } else {
          console.log(`No item in hotbar slot ${slotIndex}`);
        }
      }
    }

    if (KeyboardEventTypes.KEYUP === eventType) {
      if (eventCode === 'KeyW') forward.front = false;
      if (eventCode === 'KeyS') forward.back = false;
      if (eventCode === 'KeyA') forward.left = false;
      if (eventCode === 'KeyD') forward.right = false;
      if (eventCode === 'ShiftLeft' || eventCode === 'ShiftRight') forward.sprint = false;
      if (eventCode === 'Space') playerStore.setJump(selfPlayer.id, false);
    }

    // Only update if forward state actually changed
    if (JSON.stringify(forward) !== JSON.stringify(selfPlayer.move.forward)) {
      playerStore.setForward(selfPlayer.id, forward);
    }
  }

  private mouseEvent() {
    // Store element reference
    this._elementContent = document.getElementById('level') as HTMLElement;
    if (!this._elementContent) {
      console.error('Controller mouseEvent: Could not find #level element.');
      return;
    }

    // Store click listener
    this._mouseClickListener = (e) => {
      // Check if inventory is open - don't capture if it is
      const inventoryOpen = useInventoryStore().isOpen;
      if (inventoryOpen) {
        return; // Don't capture mouse when inventory is open
      }

      // Check if the click target or its parents should prevent focus capture
      const checkFocusAvailable = (e.composedPath() as HTMLElement[]).find((item) => {
        // Check if item is an HTMLElement and has classList
        if (item.classList?.contains) {
          return item.classList.contains('no_focus_game');
        }
        return false;
      });

      if (!checkFocusAvailable) {
        this.mouseIsCaptured = true;
        this.requestPointerLock();
      }
    };
    this._elementContent.addEventListener('click', this._mouseClickListener);

    // Store pointer lock change listener
    this._pointerLockChangeListener = () => {
      this.mouseIsCaptured = !!document.pointerLockElement; // Use boolean conversion

      // Handle pointer lock release (e.g., user pressed Esc)
      if (!this.mouseIsCaptured) {
        console.log('Pointer lock released');
        // Optionally, ensure inventory state matches if Esc was used to exit pointer lock
        // const inventoryStore = useInventoryStore();
        // if (!inventoryStore.isInventoryOpen) {
        //    // If lock released but inventory isn't open, maybe open it? Or just log.
        // }
      } else {
        console.log('Pointer lock acquired');
      }
    };
    document.addEventListener('pointerlockchange', this._pointerLockChangeListener, false);

    // Store pointer lock error listener
    this._pointerLockErrorListener = (event) => {
      console.warn('Pointer lock error:', event);
      this.mouseIsCaptured = false;
    };
    document.addEventListener('pointerlockerror', this._pointerLockErrorListener);

    // Store pointer move listener
    this._pointerMoveListener = (e) => {
      if (this.mouseIsCaptured) {
        const rotateX = e.movementY * this.sensitiveMouse;
        const rotateY = e.movementX * this.sensitiveMouse;
        const playerStore = usePlayerStore();
        if (playerStore.selfPlayer) {
          playerStore.setRotate(playerStore.selfPlayer.id, rotateX, rotateY);
        }
      }
    };
    window.addEventListener('pointermove', this._pointerMoveListener);
  }

  private requestPointerLock() {
    try {
      const canvas = document.getElementById('canvas');
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      } else {
        console.warn('Canvas element not found or requestPointerLock not supported.');
      }
    } catch (error) {
      console.warn('Pointer lock request failed:', error);
      this.mouseIsCaptured = false;
    }
  }

  // --- Add cleanup method ---
  public cleanup(): void {
    console.log('🧹 Cleaning up Controller instance...');

    // Remove keyboard observer
    if (this._keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this._keyboardObserver);
      this._keyboardObserver = null;
      console.log('   - Removed keyboard observer');
    }

    // Remove mouse click listener
    if (this._elementContent && this._mouseClickListener) {
      this._elementContent.removeEventListener('click', this._mouseClickListener);
      this._mouseClickListener = null;
      console.log('   - Removed mouse click listener');
    }

    // Remove pointer lock change listener
    if (this._pointerLockChangeListener) {
      document.removeEventListener('pointerlockchange', this._pointerLockChangeListener, false);
      this._pointerLockChangeListener = null;
      console.log('   - Removed pointer lock change listener');
    }

    // Remove pointer lock error listener
    if (this._pointerLockErrorListener) {
      document.removeEventListener('pointerlockerror', this._pointerLockErrorListener);
      this._pointerLockErrorListener = null;
      console.log('   - Removed pointer lock error listener');
    }

    // Remove pointer move listener
    if (this._pointerMoveListener) {
      window.removeEventListener('pointermove', this._pointerMoveListener);
      this._pointerMoveListener = null;
      console.log('   - Removed pointer move listener');
    }

    // Exit pointer lock if still active
    if (document.pointerLockElement) {
      document.exitPointerLock();
      console.log('   - Exited pointer lock');
    }

    // Nullify references
    this._elementContent = null;
    // this.scene = null; // Avoid nullifying scene if it's managed globally

    // Clear the HMR instance reference if this is the one being cleaned up
    if (currentControllerInstance === this) {
      currentControllerInstance = null;
    }

    console.log('🧹 Controller cleanup complete.');
  }
  // --- End cleanup method ---
}

// --- Add Vite HMR hook ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Dispose triggered for Controller.ts');
    // Call cleanup on the tracked instance when the module is about to be replaced
    if (currentControllerInstance) {
      currentControllerInstance.cleanup();
    } else {
      console.warn('[HMR] No current controller instance found to clean up.');
    }
  });
}
// --- End HMR hook ---

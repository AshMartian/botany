import {
  Scene,
  KeyboardEventTypes,
  Observer,
  Nullable,
  PointerEventTypes,
  PointerInfo,
} from '@babylonjs/core'; // <-- Import PointerEventTypes, PointerInfo
import { usePlayerStore } from '@/stores/playerStore';
import { useInventoryStore, InventoryItemWithPosition } from '@/stores/inventoryStore';
import { storeToRefs } from 'pinia'; // <-- Import storeToRefs
import { useBuildingStore } from '@/stores/buildingStore';

// Keep track of controller instances for HMR cleanup
let currentControllerInstance: Controller | null = null;

export default class Controller {
  sensitiveMouse: number;
  mouseIsCaptured: boolean | Element;
  scene: Scene;

  // --- Properties to hold listeners/observers for cleanup ---
  private _elementContent: HTMLElement | null = null;
  // Change mouse click listener type to handle PointerInfo
  private _pointerObserver: Nullable<Observer<PointerInfo>> = null; // <-- CHANGE THIS, specify PointerInfo type
  private _pointerLockChangeListener: (() => void) | null = null;
  private _pointerLockErrorListener: ((e: Event) => void) | null = null; // Added for error listener
  private _pointerMoveListener: ((e: MouseEvent) => void) | null = null;
  private _keyboardObserver: Nullable<Observer<any>> = null; // Use Babylon's Nullable type

  constructor() {
    this.sensitiveMouse = 0.004;
    this.mouseIsCaptured = false;
    this.scene = globalThis.scene;

    // --- CHANGE: Use onPointerObservable for clicks ---
    this._pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      this.handlePointerEvent(pointerInfo);
    });
    // --- END CHANGE ---

    this._keyboardObserver = this.scene.onKeyboardObservable.add((event) => {
      this.keyEvent(event);
    });

    // --- Setup other listeners (pointer lock, move) ---
    this.setupPointerLockListeners();
    this.setupPointerMoveListener();
    // --- End setup ---

    // Track this instance for HMR
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentControllerInstance = this;
    console.log('🎮 Controller instance created.');
  }

  // --- START REPLACEMENT ---
  private keyEvent(e: any) {
    const buildingStore = useBuildingStore(); // Get store instance
    const { isPlacing } = storeToRefs(buildingStore); // Get reactive ref

    // --- ADD: Explicitly ignore F/X during placement ---
    if (isPlacing.value && (e.event.code === 'KeyF' || e.event.code === 'KeyX')) {
      // console.log('Controller: Ignoring F/X during placement.');
      return;
    }
    // --- END ADD ---

    // Prevent processing if input is focused on specific UI elements
    const target = e.event.target as HTMLElement;
    if (
      target.closest(
        '.inventory-panel, .settings-panel, .build-menu-container, input, textarea, button'
      )
    ) {
      // console.log('Controller: Key event ignored due to focused UI element.');
      return;
    }

    const inventoryStore = useInventoryStore();
    // const buildingStore = useBuildingStore(); // Already defined above
    const playerStore = usePlayerStore();
    // const { isPlacing } = storeToRefs(buildingStore); // Already defined above
    const code = e.event.code;
    const eventType = e.type;

    // --- Prevent Default Browser Actions (Keep relevant ones) ---
    // Prevent default for Tab if menus are open
    if (code === 'Tab' && (inventoryStore.isOpen || buildingStore.isBuildModeActive)) {
      e.event.preventDefault();
    }
    // Prevent default for B/I unless placing (toggles handled below)
    if ((code === 'KeyB' || code === 'KeyI') && !isPlacing.value) {
      e.event.preventDefault();
    }
    // Prevent default for Escape if menus are open (closing handled below)
    if (
      code === 'Escape' &&
      (inventoryStore.isOpen || buildingStore.isBuildModeActive) &&
      !isPlacing.value // Keep !isPlacing check
    ) {
      e.event.preventDefault();
    }
    // --- End Prevent Default ---

    // --- Handle Toggles (B, I, Tab, Escape) ---
    if (eventType === KeyboardEventTypes.KEYDOWN) {
      if (code === 'KeyB') {
        // Toggle build menu. Store action handles cancelling placement if needed.
        if (!buildingStore.isBuildModeActive && document.pointerLockElement) {
          // --- MODIFICATION: Only exit lock if NOT placing ---
          if (!isPlacing.value) {
            document.exitPointerLock(); // Release lock when opening menu
          }
        }
        buildingStore.toggleBuildMode();
        return; // Stop processing 'B' further if it toggled the menu
      }
      if (code === 'KeyI' || code === 'Tab') {
        // Toggle inventory.
        const openingInventory = !inventoryStore.isInventoryOpen;
        inventoryStore.toggleInventory();
        if (openingInventory && document.pointerLockElement) {
          // --- MODIFICATION: Only exit lock if NOT placing ---
          if (!isPlacing.value) {
            document.exitPointerLock(); // Release lock when opening menu
          }
        }
        // Optionally close build menu if inventory opens
        // if (openingInventory && buildingStore.isBuildModeActive) {
        //     buildingStore.exitBuildMode();
        // }
        return; // Stop processing 'I'/'Tab' further if it toggled inventory
      }
      // Handle Escape key for closing menus (only if NOT placing)
      if (code === 'Escape' && !isPlacing.value) {
        // Keep !isPlacing check
        if (inventoryStore.isOpen) {
          inventoryStore.toggleInventory();
          return; // Stop processing Escape further
        }
        if (buildingStore.isBuildModeActive) {
          buildingStore.exitBuildMode();
          return; // Stop processing Escape further
        }
        // If no menus open, Escape might release pointer lock (handled by browser/listeners)
      }
      // NOTE: Escape during placement is handled by CrosshairService/InteractionHandler (via 'X' key)
    }
    // --- End Toggles ---

    // --- Handle Movement, Jump, Sprint, Hotbar ---
    // This section now runs regardless of placement mode.
    const selfPlayer = playerStore.selfPlayer;
    if (!selfPlayer?.move) {
      return; // Player not ready for movement commands
    }

    const forward = { ...selfPlayer.move.forward };
    let movementChanged = false;

    if (eventType === KeyboardEventTypes.KEYDOWN) {
      // Movement & Jump
      if (code === 'KeyW') forward.front = true;
      else if (code === 'KeyS') forward.back = true;
      else if (code === 'KeyA') forward.left = true;
      else if (code === 'KeyD') forward.right = true;
      else if (code === 'ShiftLeft' || code === 'ShiftRight') forward.sprint = true;
      else if (code === 'Space') playerStore.setJump(selfPlayer.id, true);
      // Hotbar selection (1-9)
      else if (code.match(/^Digit[1-9]$/)) {
        const slotIndex = parseInt(code.replace('Digit', '')) - 1;
        inventoryStore.setActiveHotbarSlot(slotIndex);
        // No return here, allow other keys if needed
      }
      movementChanged = true; // Assume change on keydown for simplicity here
    } // End KEYDOWN block

    if (eventType === KeyboardEventTypes.KEYUP) {
      // Movement & Jump
      if (code === 'KeyW') forward.front = false;
      else if (code === 'KeyS') forward.back = false;
      else if (code === 'KeyA') forward.left = false;
      else if (code === 'KeyD') forward.right = false;
      else if (code === 'ShiftLeft' || code === 'ShiftRight') forward.sprint = false;
      else if (code === 'Space') playerStore.setJump(selfPlayer.id, false);
      movementChanged = true; // Assume change on keyup
    } // End KEYUP Block

    // Update player state only if movement actually changed
    if (movementChanged && JSON.stringify(forward) !== JSON.stringify(selfPlayer.move.forward)) {
      playerStore.setForward(selfPlayer.id, forward);
    }

    // --- IMPORTANT: Do NOT return early for F/X/Escape here ---
    // Let these keys fall through so CrosshairService can potentially handle them
    // based on its own logic and the interaction store.
    // --- REMOVED explicit handling for F/X ---
  }
  // --- END REPLACEMENT ---

  // --- NEW: Handle Pointer Events (Clicks) ---
  private handlePointerEvent(pointerInfo: PointerInfo) {
    const buildingStore = useBuildingStore();
    const { isPlacing } = storeToRefs(buildingStore); // Get reactive ref

    // --- ADD: Explicitly ignore clicks during placement ---
    if (isPlacing.value) {
      // console.log('Controller: Ignoring click during placement.');
      return;
    }
    // --- END ADD ---

    // Specify PointerInfo type
    // NOTE: Click handling during placement is now primarily in BuildingPlacementService's Interaction Handler
    // const buildingStore = useBuildingStore(); // Already defined above
    const inventoryStore = useInventoryStore();

    // Handle Left Click (Button Index 0)
    if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 0) {
      // --- REMOVED: Placement-specific left click logic ---
      // if (buildingStore.isPlacing) {
      //   // BuildingPlacementService now handles this click via its own pointer observer/interaction handler
      //   return; // Don't process other click logic if placing
      // }
      // --- END REMOVAL ---

      // If inventory or build menu is open, don't capture pointer lock
      if (inventoryStore.isOpen || buildingStore.isBuildModeActive) {
        return;
      }

      // Check if click target should prevent focus capture (keep existing logic)
      // Cast pointerInfo.event to native MouseEvent to access composedPath
      const nativeEvent = pointerInfo.event as MouseEvent; // <-- ADDED THIS CAST
      const checkFocusAvailable = (nativeEvent.composedPath() as HTMLElement[]).find(
        // <-- USE nativeEvent HERE
        (item) => {
          // Check if item is an HTMLElement and has classList
          // Added build-menu-container check
          if (item?.classList?.contains) {
            // Added safety check for item and classList
            return (
              item.classList.contains('no_focus_game') ||
              item.classList.contains('build-menu-container')
            );
          }
          return false;
        }
      );

      // --- MODIFIED: Request pointer lock ONLY if not placing and UI allows ---
      if (!checkFocusAvailable && !document.pointerLockElement && !isPlacing.value) {
        // Added !isPlacing.value check
        this.requestPointerLock(); // Keep this for general gameplay focus
      }
      // --- END MODIFICATION ---
    }

    // Handle Right Click (Button Index 2) - Example: Cancel Placement
    if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 2) {
      // --- REMOVED: Placement-specific right click logic ---
      // if (buildingStore.isPlacing) {
      //   // BuildingPlacementService now handles this click via its own pointer observer/interaction handler
      //   // pointerInfo.event.preventDefault(); // Prevent context menu (handled by service)
      //   return; // Don't process other click logic
      // }
      // --- END REMOVAL ---
      // Prevent context menu during general gameplay if needed
      // pointerInfo.event.preventDefault();
    }
  }
  // --- END NEW Pointer Handler ---

  // --- Separate setup functions for listeners ---
  private setupPointerLockListeners() {
    this._pointerLockChangeListener = () => {
      this.mouseIsCaptured = !!document.pointerLockElement; // Use boolean conversion

      // Handle pointer lock release (e.g., user pressed Esc)
      if (!this.mouseIsCaptured) {
        console.log('Pointer lock released');
        // If lock is released unexpectedly while placing, the service should handle cancellation
        const buildingStore = useBuildingStore();
        if (buildingStore.isPlacing) {
          console.log('Pointer lock released during placement, service should cancel.');
          // The service's watcher on isPlacing should handle cleanup if the store state changes
          // Or the service could listen for pointerlockchange itself if needed
          // buildingStore.cancelPlacement(); // Let service handle state change reaction
        }
        // Optionally, ensure UI state matches if Esc was used to exit pointer lock
        // Example: If inventory or build menu should open when Esc releases lock
        // const inventoryStore = useInventoryStore();
        // const buildingStore = useBuildingStore();
        // if (!inventoryStore.isOpen && !buildingStore.isBuildModeActive) {
        //    // Maybe open a pause menu? Or just log.
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
  }

  private setupPointerMoveListener() {
    // Store pointer move listener
    this._pointerMoveListener = (e) => {
      if (this.mouseIsCaptured) {
        // --- Handle Camera Rotation (Existing Logic) ---
        const rotateX = e.movementY * this.sensitiveMouse;
        const rotateY = e.movementX * this.sensitiveMouse;
        const playerStore = usePlayerStore();
        if (playerStore.selfPlayer) {
          playerStore.setRotate(playerStore.selfPlayer.id, rotateX, rotateY);
        }
        // --- End Camera Rotation ---

        // --- Handle Ghost Rotation (Future) ---
        // const buildingStore = useBuildingStore();
        // if (buildingStore.isPlacing) {
        //    // Potentially update ghost rotation based on mouse movement if needed
        //    // buildingPlacementService.updateGhostRotation(e.movementX, e.movementY);
        // }
        // --- End Ghost Rotation ---
      }
    };
    window.addEventListener('pointermove', this._pointerMoveListener);
  }
  // --- End setup functions ---

  private requestPointerLock() {
    // This method might still be useful if called explicitly by the placement service
    // Keep the implementation, but remove the automatic call on canvas click.
    try {
      const canvas = document.getElementById('canvas');
      if (canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      } else {
        console.warn('Canvas element not found or requestPointerLock not supported.');
      }
    } catch (error) {
      console.warn('Pointer lock request failed:', error);
      // Don't set mouseIsCaptured here, let the listener handle it
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

    // --- CHANGE: Remove pointer observer ---
    if (this._pointerObserver) {
      this.scene.onPointerObservable.remove(this._pointerObserver);
      this._pointerObserver = null;
      console.log('   - Removed pointer observer');
    }
    // --- END CHANGE ---

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

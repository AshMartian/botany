// src/services/CrosshairService.ts
import {
  Scene,
  PickingInfo,
  Observer,
  Nullable,
  AbstractMesh,
  KeyboardEventTypes,
} from '@babylonjs/core'; // Added AbstractMesh, KeyboardEventTypes
import { usePlayerStore } from '@/stores/playerStore';
import { BuildingPlacementInteractionHandler } from '@/services/interactionHandlers/BuildingPlacementInteractionHandler'; // <-- ADD THIS IMPORT

// Define the structure for an interaction prompt (used by BuildingPlacementInteractionHandler)
export interface Interaction {
  key: string;
  label: string;
  action: () => void;
  enabled: () => boolean;
}

// Interface for interaction handlers
export interface InteractionHandler {
  canInteract: (hit: PickingInfo | null) => boolean; // Allow null for placement handler
  getInteractionText: (hit: PickingInfo | null) => [string, string?, number?]; // Allow null for placement handler
  onInteract: (hit: PickingInfo | null, key?: string) => void; // <-- Allow null hit, ADD optional key parameter
  priority?: number; // Optional priority level for this handler
}

// Extended PickingInfo to include our normalized distance
interface ExtendedPickingInfo extends PickingInfo {
  distance: number;
}

/**
 * CrosshairService - Handles player crosshair raycast and interactions
 */
class CrosshairService {
  private scene: Scene | null = null;
  private baseMaxDistance = 5; // Base interaction distance when camera is at default zoom
  private maxDistance = this.baseMaxDistance;
  private interactionHandlers: InteractionHandler[] = [];
  private currentHit: PickingInfo | null = null;
  private observer: Nullable<Observer<Scene>> = null;
  // private interactionText = ''; // Removed as interactions are now managed in playerStore
  // private interactionKey = 'F'; // Removed as interactions are now managed in playerStore
  private isInteractionReady = true;
  private interactionCooldown = 500; // milliseconds
  private isInitialized = false;

  /**
   * Initialize the crosshair service
   * This should be called after the scene is fully loaded
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('CrosshairService already initialized');
      return;
    }

    this.scene = globalThis.scene;

    // Set up the observer for continuous raycast
    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      this.performCrosshairRaycast();
    });

    this.setupInteractionInput();
    this.isInitialized = true;
    console.log('CrosshairService: Successfully initialized');

    return Promise.resolve();
  }

  /**
   * Perform the actual raycast from camera
   */
  private performCrosshairRaycast(): void {
    if (!this.scene) return;

    // Access the camera directly from globalThis with proper typing
    const camera = globalThis.camera?.babylonCamera;
    if (!globalThis.camera || !camera) return;

    // Get zoom factor from our camera instance
    const zoomFactor = globalThis.camera.zoomFactor * 2 || 1.0;

    // Adjust max distance based on zoom level
    this.maxDistance = this.baseMaxDistance * zoomFactor;

    const ray = this.scene.createPickingRay(
      this.scene.getEngine().getRenderWidth() / 2,
      this.scene.getEngine().getRenderHeight() / 2,
      null,
      camera
    );

    const hit = this.scene.pickWithRay(ray, (mesh) => {
      // Only pick interactable or explicitly pickable meshes
      // Also exclude ghost meshes from being interactable targets
      return (mesh.isPickable || mesh.metadata?.isInteractable) && !mesh.name.startsWith('ghost_');
    });

    const playerStore = usePlayerStore();

    // Clear all previous interactions before evaluating new ones
    playerStore.clearInteractions();

    // --- Evaluate Placement Handler First (High Priority) ---
    let placementHandlerActive = false;
    for (const handler of this.interactionHandlers) {
      if (handler instanceof BuildingPlacementInteractionHandler) {
        // Placement handler's canInteract doesn't rely on the hit object
        if (handler.canInteract(null)) {
          // Pass null, check based on store state
          placementHandlerActive = true;
          const [combinedText, , priority] = handler.getInteractionText(null); // Pass null
          // Parse the combined text (assuming format "[F] Action1 / [X] Action2")
          const parts = combinedText.split('/');
          const buildPart = parts[0]?.trim(); // e.g., "[F] Build" or "[F] (Cannot Place)"
          const cancelPart = parts[1]?.trim(); // e.g., "[X] Cancel"

          if (buildPart) {
            const keyMatch = buildPart.match(/^\[(.*?)\]/); // Extract key like [F]
            const key = keyMatch ? keyMatch[1] : 'F'; // Default to F if format is wrong
            const buildText = buildPart.substring(keyMatch ? keyMatch[0].length : 0).trim(); // Extract text after key
            if (buildText) {
              playerStore.setInteraction(buildText, key, handler.priority || priority || 0); // Register interaction
            }
          }
          if (cancelPart) {
            const keyMatch = cancelPart.match(/^\[(.*?)\]/); // Extract key like [X]
            const key = keyMatch ? keyMatch[1] : 'X'; // Default to X if format is wrong
            const cancelText = cancelPart.substring(keyMatch ? keyMatch[0].length : 0).trim(); // Extract text after key
            if (cancelText) {
              playerStore.setInteraction(cancelText, key, handler.priority || priority || 0); // Register interaction
            }
          }
          // Since placement is active, we might not need to process other handlers
          // depending on desired behavior (e.g., prevent interacting with doors while placing)
          // For now, let's break if placement is active to give it priority.
          break;
        }
      }
    }
    // --- End Placement Handler Check ---

    // --- Evaluate Other Handlers (if placement not active or if we allow overlap) ---
    // Only process other handlers if placement isn't active AND we have a valid hit
    if (!placementHandlerActive && hit && hit.hit && hit.distance <= this.maxDistance) {
      // Calculate normalized distance relative to base distance
      const normalizedDistance = hit.distance / zoomFactor;

      // Create a normalized hit result that extends PickingInfo
      const normalizedHit: ExtendedPickingInfo = {
        ...hit,
        distance: normalizedDistance,
        getNormal: hit.getNormal.bind(hit),
        getTextureCoordinates: hit.getTextureCoordinates.bind(hit),
      };

      this.currentHit = normalizedHit; // Store the valid hit

      // Check all *other* handlers and collect valid interactions
      for (const handler of this.interactionHandlers) {
        // Skip the placement handler as it was handled above
        if (handler instanceof BuildingPlacementInteractionHandler) continue;

        if (handler.canInteract(normalizedHit)) {
          const [text, key = 'F', priority = 0] = handler.getInteractionText(normalizedHit);
          // Only add if we have text
          if (text) {
            // Add to store with priority
            playerStore.setInteraction(text, key, handler.priority || priority);
          }
          // Potentially break here if only one interaction should be shown at a time
          // break;
        }
      }
    } else {
      // No valid hit for non-placement interactions, or placement handler is active
      this.currentHit = null; // Clear current hit if no valid non-placement interaction target
    }
  }

  /**
   * Set up input handling for multiple interaction keys
   */
  // --- START REPLACEMENT ---
  private setupInteractionInput(): void {
    if (!this.scene) return;

    this.scene.onKeyboardObservable.add((kbInfo) => {
      // Only process key down events
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        const pressedKey = kbInfo.event.code.replace('Key', ''); // e.g., 'F', 'X', 'E'

        // Prevent interaction if a UI element has focus (redundant with Controller check, but safe)
        const target = kbInfo.event.target as HTMLElement;
        if (target.closest('input, textarea, button, .no_focus_game')) {
          return;
        }

        const playerStore = usePlayerStore();
        const interactions = playerStore.interactions; // Get currently displayed interactions
        // --- ADD LOG ---
        // console.log( // Reduced verbosity
        //   `[Crosshair Input KeyDown] Current Interactions in Store:`,
        //   JSON.stringify(interactions)
        // );
        // --- END LOG ---

        // Find the interaction matching the pressed key in the CURRENTLY DISPLAYED interactions
        const matchingInteraction = interactions.find(
          (interaction) => interaction.key.toUpperCase() === pressedKey.toUpperCase()
        );

        // --- ADD LOG ---
        // if (matchingInteraction) { // Reduced verbosity
        //   console.log(
        //     `[Crosshair Input KeyDown] Found matching interaction in store:`,
        //     JSON.stringify(matchingInteraction)
        //   );
        // } else {
        //   console.log(
        //     `[Crosshair Input KeyDown] No matching interaction found in store for key ${pressedKey}.`
        //   );
        // }
        // --- END LOG ---

        // Proceed if an interaction for this key is displayed AND cooldown is ready
        if (matchingInteraction && this.isInteractionReady) {
          // --- LOG MOVED/MODIFIED ---
          console.log(
            `[Crosshair Input] Interaction Ready. Key ${pressedKey} matched store interaction: ${matchingInteraction.text}. Searching for handler...`
          );
          // --- END LOG ---

          // Find the specific handler that generated this exact interaction
          let handlerTriggered = false;
          for (const handler of this.interactionHandlers) {
            // --- ADD LOG ---
            // console.log(`[Crosshair Input] Checking handler: ${handler.constructor.name}`); // Reduced verbosity
            // --- END LOG ---

            // Check if this handler is currently active
            // Pass currentHit (which might be null, handlers must accept this)
            // For placement handler, canInteract(null) checks store state.
            // For others, canInteract(this.currentHit) checks the raycast hit.
            const isActive =
              handler instanceof BuildingPlacementInteractionHandler
                ? handler.canInteract(null) // Placement handler checks store state
                : handler.canInteract(this.currentHit); // Others check raycast hit

            // --- ADD LOG ---
            // console.log( // Reduced verbosity
            //   `[Crosshair Input] Handler ${handler.constructor.name} isActive: ${isActive}`
            // );
            // --- END LOG ---

            if (isActive) {
              // Get the text/key this handler *would* generate right now
              // Pass null to placement handler, currentHit to others
              const [textData, defaultKey = 'F'] =
                handler instanceof BuildingPlacementInteractionHandler
                  ? handler.getInteractionText(null)
                  : handler.getInteractionText(this.currentHit);

              // --- ADD LOG ---
              // console.log( // Reduced verbosity
              //   `[Crosshair Input] Handler ${handler.constructor.name} generates textData: "${textData}", defaultKey: "${defaultKey}"`
              // );
              // --- END LOG ---

              // Check if this handler generated the exact interaction we matched from the store
              let generatesMatch = false;
              // Handle combined text format (e.g., "[F] Build / [X] Cancel")
              if (textData.includes('/') && textData.includes('[')) {
                const parts = textData.split('/');
                generatesMatch = parts.some((part) => {
                  const trimmedPart = part.trim();
                  const keyMatch = trimmedPart.match(/^\[(.*?)\]/);
                  const key = keyMatch ? keyMatch[1] : defaultKey; // Use extracted key
                  const label = trimmedPart.substring(keyMatch ? keyMatch[0].length : 0).trim();
                  const match =
                    key.toUpperCase() === pressedKey.toUpperCase() &&
                    label === matchingInteraction.text;
                  // --- ADD LOG ---
                  // console.log(`[Crosshair Input] Combined Part Check: part="${trimmedPart}", extractedKey="${key}", label="${label}", pressedKey="${pressedKey}", storeLabel="${matchingInteraction.text}", match=${match}`);
                  // --- END LOG ---
                  return match;
                });
              }
              // Handle single text format
              else {
                generatesMatch =
                  defaultKey.toUpperCase() === pressedKey.toUpperCase() &&
                  textData === matchingInteraction.text;
                // --- ADD LOG ---
                // console.log(`[Crosshair Input] Single Part Check: defaultKey="${defaultKey}", textData="${textData}", pressedKey="${pressedKey}", storeLabel="${matchingInteraction.text}", match=${generatesMatch}`);
                // --- END LOG ---
              }

              // --- ADD LOG ---
              // console.log( // Reduced verbosity
              //   `[Crosshair Input] Handler ${handler.constructor.name} generatesMatch: ${generatesMatch}`
              // );
              // --- END LOG ---

              // If this handler generated the matching interaction, trigger it
              if (generatesMatch) {
                // --- LOG MOVED/MODIFIED ---
                console.log(
                  `[Crosshair Input] Match Found! Handler ${handler.constructor.name} generated the match. Calling onInteract with key: ${pressedKey}`
                );
                // --- END LOG ---

                // Call the handler's onInteract method.
                // Pass currentHit (which might be null) and the pressed key.
                handler.onInteract(this.currentHit, pressedKey); // Pass the actual pressed key ('F', 'X', etc.)
                handlerTriggered = true;

                // Set cooldown
                this.isInteractionReady = false;
                setTimeout(() => {
                  this.isInteractionReady = true;
                }, this.interactionCooldown);
                break; // Found the handler, stop searching
              }
            }
          } // End for loop over handlers

          // --- LOG MOVED/MODIFIED ---
          if (!handlerTriggered) {
            console.warn(
              `[Crosshair Input] No *active* handler generated the matched interaction for key ${pressedKey}.`
            );
          }
          // --- END LOG ---
        } else if (matchingInteraction && !this.isInteractionReady) {
          // --- ADD LOG ---
          // console.log( // Reduced verbosity
          //   `[Crosshair Input] Interaction key ${pressedKey} pressed, but cooldown active.`
          // );
          // --- END LOG ---
        }
        // No 'else' needed - if no match or not ready, simply do nothing.
      } // End KEYDOWN check
    }); // End observable add
  }
  // --- END REPLACEMENT ---

  /**
   * Register a new interaction handler
   * @param handler The interaction handler to register
   */
  public registerInteractionHandler(handler: InteractionHandler): void {
    // Avoid duplicate registration
    if (!this.interactionHandlers.includes(handler)) {
      this.interactionHandlers.push(handler);
      // Sort handlers by priority after adding (higher priority first)
      this.interactionHandlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      console.log(
        'Interaction handler registered:',
        handler.constructor.name,
        'Priority:',
        handler.priority || 0
      );
    } else {
      console.warn('Interaction handler already registered:', handler.constructor.name);
    }
  }

  /**
   * Unregister an interaction handler
   * @param handlerToRemove The interaction handler instance to remove
   */
  public unregisterInteractionHandler(handlerToRemove: InteractionHandler): void {
    const initialLength = this.interactionHandlers.length;
    this.interactionHandlers = this.interactionHandlers.filter(
      (handler) => handler !== handlerToRemove
    );
    if (this.interactionHandlers.length < initialLength) {
      console.log('Interaction handler unregistered:', handlerToRemove.constructor.name);
    }
  }

  /**
   * Set the base maximum interaction distance (will be scaled by camera zoom)
   * @param distance Base maximum distance in world units
   */
  public setMaxDistance(distance: number): void {
    this.baseMaxDistance = distance;
  }

  /**
   * Check if the service is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Clean up resources when no longer needed
   */
  public dispose(): void {
    if (this.observer && this.scene) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    // TODO: Consider removing keyboard listener here too if necessary,
    // though it might be shared across the application lifecycle.
    // If removed, ensure it's re-added on re-initialization.
    this.interactionHandlers = []; // Clear handlers
    this.currentHit = null;
    this.isInitialized = false;
    console.log('CrosshairService disposed.');
  }
}

// Export singleton instance
export const crosshairService = new CrosshairService();
export default crosshairService;

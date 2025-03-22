// src/services/CrosshairService.ts
import { Scene, PickingInfo, Observer, Nullable } from '@babylonjs/core';
import storeVuex from '@/store/vuex';

// Interface for interaction handlers
export interface InteractionHandler {
  canInteract: (hit: PickingInfo) => boolean;
  getInteractionText: (hit: PickingInfo) => [string, string?];
  onInteract: (hit: PickingInfo) => void;
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
  private interactionText = '';
  private interactionKey = 'F';
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
    if (!camera) return;

    // Get zoom factor from our camera instance
    const zoomFactor = globalThis.camera?.zoomFactor * 2 || 1.0;

    // Adjust max distance based on zoom level
    this.maxDistance = this.baseMaxDistance * zoomFactor;

    const ray = this.scene.createPickingRay(
      this.scene.getEngine().getRenderWidth() / 2,
      this.scene.getEngine().getRenderHeight() / 2,
      null,
      camera
    );

    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.isPickable || mesh.metadata?.isInteractable;
    });

    if (hit && hit.hit && hit.distance <= this.maxDistance) {
      // Calculate normalized distance relative to base distance
      const normalizedDistance = hit.distance / zoomFactor;

      // Create a normalized hit result that extends PickingInfo
      const normalizedHit: ExtendedPickingInfo = {
        ...hit,
        distance: normalizedDistance,
        getNormal: hit.getNormal.bind(hit),
        getTextureCoordinates: hit.getTextureCoordinates.bind(hit),
      };

      this.currentHit = normalizedHit;
      this.interactionText = '';

      for (const handler of this.interactionHandlers) {
        if (handler.canInteract(normalizedHit)) {
          const [interactionText, interactionKey] = handler.getInteractionText(normalizedHit);
          this.interactionText = interactionText;
          this.interactionKey = interactionKey || 'F'; // Default to 'F' if not provided

          break;
        }
      }
    } else {
      this.currentHit = null;
      this.interactionText = '';
    }

    storeVuex.commit('SET_INTERACTION_TEXT', this.interactionText);
    storeVuex.commit('SET_INTERACTION_KEY', this.interactionKey);
  }

  /**
   * Set up input handling for interaction (F key)
   */
  private setupInteractionInput(): void {
    if (!this.scene) return;

    this.scene.onKeyboardObservable.add((kbInfo) => {
      // Check if interaction key is pressed down
      if (
        kbInfo.type === 1 &&
        kbInfo.event.code === `Key${this.interactionKey}` &&
        this.isInteractionReady
      ) {
        this.triggerInteraction();

        // Set cooldown to prevent spam
        this.isInteractionReady = false;
        setTimeout(() => {
          this.isInteractionReady = true;
        }, this.interactionCooldown);
      }
    });
  }

  /**
   * Trigger the interaction with whatever the player is looking at
   */
  private triggerInteraction(): void {
    if (!this.currentHit) return;

    for (const handler of this.interactionHandlers) {
      if (handler.canInteract(this.currentHit)) {
        handler.onInteract(this.currentHit);
        break;
      }
    }
  }

  /**
   * Register a new interaction handler
   * @param handler The interaction handler to register
   */
  public registerInteractionHandler(handler: InteractionHandler): void {
    this.interactionHandlers.push(handler);
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
    this.isInitialized = false;
  }
}

// Export singleton instance
export const crosshairService = new CrosshairService();
export default crosshairService;

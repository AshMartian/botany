// src/services/interactionHandlers/BuildingPlacementInteractionHandler.ts
import { AbstractMesh, Nullable, PickingInfo } from '@babylonjs/core';
import { InteractionHandler, Interaction } from '@/services/CrosshairService'; // Import Interaction from CrosshairService
import { useBuildingStore } from '@/stores/buildingStore';
import BuildingPlacementService from '@/services/BuildingPlacementService'; // Assuming this path

// Ensure the class is exported:
export class BuildingPlacementInteractionHandler implements InteractionHandler {
  private buildingStore = useBuildingStore();
  private placementService: BuildingPlacementService; // Reference to the placement service
  public priority = 10; // High priority to override other interactions when placing

  constructor(placementService: BuildingPlacementService) {
    this.placementService = placementService;
  }

  // Check if the building placement mode is active
  // --- FIX START ---
  canInteract(hit: PickingInfo | null): boolean {
    // <-- Allow null
    // Interaction is active whenever the store says we are placing.
    // The 'hit' parameter is not used in this specific check.
    return this.buildingStore.isPlacing;
  }
  // --- FIX END ---

  // Define the interactions: Build (F) and Cancel (X)
  // --- FIX START ---
  getInteractionText(hit: PickingInfo | null): [string, string?, number?] {
    // <-- Allow null
    // The 'hit' parameter is not used here either.
    // --- FIX END ---
    // The text depends on whether placement is currently valid
    const canPlace = this.buildingStore.canPlace;
    const buildActionText = canPlace ? 'Build' : '(Cannot Place)';
    const cancelActionText = 'Cancel';

    // Combine texts, showing Build first, then Cancel
    // Format: "[F] Action1 / [X] Action2"
    // CrosshairService will parse this combined string.
    const primaryText = `[F] ${buildActionText} / [X] ${cancelActionText}`;

    // No secondary text or distance needed for this handler
    // The key returned here ('F') is just a placeholder, as CrosshairService parses the keys from the text.
    return [primaryText, 'F', this.priority];
  }

  // Handle the interaction based on the key pressed (delegated from CrosshairService)
  // --- FIX START ---
  onInteract(hit: PickingInfo | null, key?: string): void {
    // <-- Allow null
    // The 'hit' parameter is not used here.
    // --- FIX END ---
    // Accept optional key
    if (!this.buildingStore.isPlacing || !key) return; // Check if key is provided

    // Convert key to uppercase for comparison
    const upperKey = key.toUpperCase();

    // --- VERIFIED: Checks for 'F' and 'X' ---
    if (upperKey === 'F') {
      this.placementService.confirmPlacementAttempt();
    } else if (upperKey === 'X') {
      this.placementService.cancelPlacementAttempt();
    }
    // --- END VERIFICATION ---
  }
}

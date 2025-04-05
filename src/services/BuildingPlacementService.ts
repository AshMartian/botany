// src/services/BuildingPlacementService.ts
import {
  Scene,
  AbstractMesh,
  Vector3,
  // Color3, // <-- REMOVED
  Nullable,
  Observer,
  Quaternion,
  Ray,
  PickingInfo,
  AssetContainer,
  InstantiatedEntries,
  // StandardMaterial, // <-- REMOVE
  Mesh, // Keep for instanceof checks
} from '@babylonjs/core';
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { useBuildingStore } from '@/stores/buildingStore';
import { IBuildObject } from '@/models/building/BuildObject';
import crosshairService from '@/services/CrosshairService';
import { BuildingPlacementInteractionHandler } from '@/services/interactionHandlers/BuildingPlacementInteractionHandler'; // Adjust path if needed
import Prefabs from '@/models/scene/Prefabs'; // Use the updated Prefabs service

// Keep track of instance for HMR
let currentPlacementServiceInstance: BuildingPlacementService | null = null;

const MAX_PLACEMENT_DISTANCE = 50; // Define constant for placement distance

export default class BuildingPlacementService {
  private scene: Scene;
  private buildingStore = useBuildingStore();
  private interactionHandler: BuildingPlacementInteractionHandler;
  private ghostMeshContainer: Nullable<InstantiatedEntries> = null; // Store the instantiated container
  private ghostMeshRoot: Nullable<AbstractMesh> = null; // Store the root node from instantiation
  // --- REMOVE START: Material Properties ---
  // private ghostMaterialValidPBR: StandardMaterial;
  // private ghostMaterialInvalidPBR: StandardMaterial;
  // --- REMOVE END ---
  private currentBlueprint: Nullable<IBuildObject> = null;
  private placementObserver: Nullable<Observer<Scene>> = null;
  // private pointerObserver: Nullable<Observer<PointerInfo>> = null; // <-- REMOVED For click handling
  private lastPlacementPosition: Vector3 = Vector3.Zero();
  private lastPlacementRotation: Quaternion = Quaternion.Identity();
  private placementRay: Nullable<Ray> = null; // <-- ADDED: Reusable ray object
  // --- REMOVE START: Validity Tracking for Material ---
  // private previousPlacementValid: boolean | null = null;
  // --- REMOVE END ---
  private lastValidationTime = 0; // <-- ADDED: For throttling validation
  // --- ADDED/RENAMED Throttling Properties ---
  private readonly farDistanceThreshold = 15; // Distance beyond which we throttle more heavily
  // --- INCREASE THESE VALUES SIGNIFICANTLY FOR TESTING ---
  private readonly farValidationInterval = 2000; // WAS 1000 - Very long interval
  private readonly nearValidationInterval = 500; // WAS 250 - Longer interval
  // --- END INCREASE ---
  // --- End Throttling Properties ---

  constructor(scene: Scene) {
    this.scene = scene;
    this.interactionHandler = new BuildingPlacementInteractionHandler(this);

    // --- REMOVE START: Material Creation ---
    // this.ghostMaterialValidPBR = new StandardMaterial('ghostValidStd', this.scene);
    // // ... config ...
    // this.ghostMaterialInvalidPBR = new StandardMaterial('ghostInvalidStd', this.scene);
    // // ... config ...
    // --- REMOVE END ---

    // Watch store changes to start/stop placement
    const { isPlacing, selectedBlueprintId } = storeToRefs(this.buildingStore);

    watch(isPlacing, (newValue, oldValue) => {
      if (newValue && !oldValue) {
        const blueprint = this.buildingStore.availableBlueprints.find(
          (bp) => bp.id === selectedBlueprintId.value
        );
        if (blueprint) {
          this.startPlacement(blueprint);
        } else {
          console.error('Selected blueprint not found when starting placement.');
          this.buildingStore.cancelPlacement(); // Auto-cancel if blueprint is missing
        }
      } else if (!newValue && oldValue) {
        this.stopPlacement();
      }
    });

    // Track instance for HMR
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    currentPlacementServiceInstance = this;
    console.log('🏗️ BuildingPlacementService initialized.');
  }

  public getGhostMesh(): Nullable<AbstractMesh> {
    return this.ghostMeshRoot;
  }

  // --- REMOVE START: _applyMaterialToHierarchy function ---
  // private _applyMaterialToHierarchy(root: AbstractMesh, material: StandardMaterial): void { ... }
  // --- REMOVE END ---

  private async startPlacement(blueprint: IBuildObject): Promise<void> {
    console.log(`[Placement Start] Starting placement for: ${blueprint.name}`);
    this.currentBlueprint = blueprint;
    this.buildingStore.setPlacementStatus(false);
    // this.previousPlacementValid = null; // <-- REMOVE
    this.lastValidationTime = 0; // Reset validation timer

    // Register interaction handler with crosshair service IMMEDIATELY
    crosshairService.registerInteractionHandler(this.interactionHandler);
    console.log('[Placement Start] Interaction handler registered.'); // Add log

    // Always request pointer lock on placement start
    this.requestPointerLock();

    try {
      // Initialize reusable ray
      this.placementRay = new Ray(Vector3.Zero(), Vector3.Forward(), MAX_PLACEMENT_DISTANCE);

      // Now load the asset
      const container = await Prefabs.loadAssetContainer(blueprint.prefabPath);
      if (!container) throw new Error('Asset container failed to load via Prefabs service');

      // --- REMOVE START: Detailed Container/Geometry Logging (optional, keep if useful) ---
      // console.log(`[Placement Start Inspect Container] Loaded: ${blueprint.prefabPath}`);
      // ... logs ...
      // const hasGeometry = ...;
      // if (!hasGeometry) { ... }
      // --- REMOVE END ---

      // --- REMOVE START: Cloning Logic ---
      // if (!container.rootNodes || container.rootNodes.length === 0) { ... }
      // const originalRootNode = container.rootNodes[0] as AbstractMesh;
      // if (!originalRootNode) { ... }
      // const clonedRoot = originalRootNode.clone(...);
      // if (!clonedRoot) { ... }
      // console.log(`[Placement Start Inspect Clone] Cloned Node: ...`);
      // ... logs ...
      // this.scene.addMesh(clonedRoot, true);
      // this.ghostMeshRoot = clonedRoot;
      // this.ghostMeshContainer = null;
      // console.log(`[Placement Start] Assigned CLONED mesh as ghost: ${this.ghostMeshRoot.name}`);
      // --- REMOVE END ---

      // --- ADD START: Instantiate Models ---
      console.log(`[Placement Start] Instantiating models from ${blueprint.prefabPath}`);
      // Ensure unique names for instantiated meshes
      const instanceNamePrefix = `ghost_${blueprint.id}_${Date.now()}`;
      this.ghostMeshContainer = container.instantiateModelsToScene(
        (name) => `${instanceNamePrefix}_${name}`, // Generate unique names
        true // Clone materials
      );

      if (
        !this.ghostMeshContainer ||
        !this.ghostMeshContainer.rootNodes ||
        this.ghostMeshContainer.rootNodes.length === 0
      ) {
        throw new Error('Failed to instantiate models or no root nodes found in instantiation.');
      }

      // Assume the first root node is the main one for placement control
      this.ghostMeshRoot = this.ghostMeshContainer.rootNodes[0];
      console.log(`[Placement Start] Instantiated ghost root: ${this.ghostMeshRoot.name}`);
      // --- ADD END: Instantiate Models ---

      // --- Apply settings to the instantiated hierarchy ---
      if (this.ghostMeshRoot) {
        this.ghostMeshRoot.setEnabled(false); // Start disabled
        this.ghostMeshRoot.metadata = { isInteractable: false };

        // Apply settings recursively to all instantiated meshes
        this.ghostMeshContainer.newMeshes.forEach((mesh) => {
          mesh.isPickable = false;
          mesh.checkCollisions = false; // Disable collisions for the ghost
          // mesh.layerMask = 0x10000000; // Optional: Put ghost on a separate layer
        });
        console.log(
          `[Placement Start] Applied settings (isPickable=false, checkCollisions=false) to ${this.ghostMeshContainer.newMeshes.length} instantiated meshes.`
        );
      } else {
        // This case should be caught by the earlier check, but added for safety
        throw new Error('Ghost mesh root is null after instantiation.');
      }
      // --- End Apply Settings ---

      // --- REMOVE START: Material Application ---
      // this._applyMaterialToHierarchy(this.ghostMeshRoot, this.ghostMaterialInvalidPBR);
      // --- REMOVE END ---

      // Register the update loop
      this.placementObserver = this.scene.onBeforeRenderObservable.add((scene) => {
        // --- MODIFY: Throttle updatePlacement less aggressively if needed ---
        // if (scene.getFrameId() % 3 === 0) { // Check every 3 frames
        this.updatePlacement(); // Or run every frame if performance allows
        // }
      });
    } catch (error) {
      console.error(
        `[Placement Start Error] Failed to load or instantiate ghost for ${blueprint.name}:`,
        error
      );
      // Ensure handler is unregistered on failure
      crosshairService.unregisterInteractionHandler(this.interactionHandler);
      console.log('[Placement Start Error] Interaction handler unregistered due to error.');
      // End Ensure
      this.buildingStore.cancelPlacement(); // Cancel if loading fails
    }
  }

  private updatePlacement(): void {
    // Add checks for ray, camera, and ghostMeshRoot
    if (
      !this.currentBlueprint ||
      !this.placementRay ||
      !this.scene.activeCamera ||
      !this.ghostMeshRoot
    )
      return;

    const camera = this.scene.activeCamera;
    // Get screen center coords (can be cached if screen size doesn't change often)
    const screenWidth = this.scene.getEngine().getRenderWidth();
    const screenHeight = this.scene.getEngine().getRenderHeight();

    // Update the reusable ray directly from camera center view
    this.scene.createPickingRayToRef(
      screenWidth / 2,
      screenHeight / 2,
      null,
      this.placementRay, // Update the existing ray object
      camera
    );
    this.placementRay.length = MAX_PLACEMENT_DISTANCE; // Ensure length is set
    // END Ray Update

    // Use the updated ray and cached mesh list for picking
    const hit = this.scene.pickWithRay(
      this.placementRay, // <-- Argument 1: The ray
      (mesh) => mesh.isPickable && !mesh.name.startsWith('ghost_') // Exclude ghosts from raycast targets
    );
    // End Raycast

    // Check if hit is valid and within reasonable distance
    if (
      hit?.pickedPoint &&
      hit.distance <= MAX_PLACEMENT_DISTANCE &&
      this.currentBlueprint // ghostMeshRoot already checked at start
    ) {
      // Position and Rotate Ghost
      const basePosition = hit.pickedPoint;
      // --- MODIFY START: Re-introduce offset if needed, otherwise keep simple ---
      const offset = this.currentBlueprint.placementOffset || Vector3.Zero();
      const finalPosition = basePosition.add(offset);
      // const finalPosition = basePosition; // Use this if offset is not desired yet
      // --- MODIFY END ---

      // Ensure positioning the ROOT node
      this.ghostMeshRoot.position = finalPosition; // This should be correct now
      // End Ensure

      this.lastPlacementPosition.copyFrom(finalPosition);

      if (!this.ghostMeshRoot.rotationQuaternion) {
        this.ghostMeshRoot.rotationQuaternion = Quaternion.Identity();
      }
      // TODO: Add actual rotation logic later if needed
      this.lastPlacementRotation.copyFrom(this.ghostMeshRoot.rotationQuaternion);
      // End Position/Rotation

      // Perform Validation
      const isValid = this.validatePosition(this.ghostMeshRoot); // Validate using the root node
      this.buildingStore.setPlacementStatus(isValid); // Update store with validity

      // --- REMOVE START: Material Application Logic ---
      // const placementValidityChanged = isValid !== this.previousPlacementValid;
      // if (placementValidityChanged) {
      //   const material = isValid ? this.ghostMaterialValidPBR : this.ghostMaterialInvalidPBR;
      //   this._applyMaterialToHierarchy(this.ghostMeshRoot, material);
      // }
      // this.previousPlacementValid = isValid;
      // --- REMOVE END ---

      // --- Enable ghost if it was disabled ---
      if (!this.ghostMeshRoot.isEnabled()) {
        this.ghostMeshRoot.setEnabled(true);
        console.log('[Placement Update] Ghost enabled (Valid Hit)'); // Log enabling
      }
    } else {
      // --- Hit miss or too far ---
      this.buildingStore.setPlacementStatus(false); // Set status to invalid

      // --- Disable ghost if it was enabled ---
      if (this.ghostMeshRoot.isEnabled()) {
        this.ghostMeshRoot.setEnabled(false);
        console.log('[Placement Update] Ghost disabled (Ray Miss/Too Far)'); // Log disabling
      }

      // --- REMOVE START: Material Application on Invalid ---
      // if (this.previousPlacementValid !== false) {
      //   this.previousPlacementValid = false;
      //   if (this.ghostMeshRoot) {
      //     this._applyMaterialToHierarchy(this.ghostMeshRoot, this.ghostMaterialInvalidPBR);
      //   }
      // }
      // --- REMOVE END ---
    }
  }

  // --- validatePosition remains largely the same, ensure parameter is AbstractMesh ---
  private validatePosition(meshToValidate: AbstractMesh): boolean {
    // Basic validation: Check for intersections with other collidable meshes (excluding self/player/ghosts)
    const collidableMeshes = globalThis.collisions?.listCollisions || [];

    // --- Use getHierarchyBoundingVectors on the root of the ghost ---
    const ghostBounds = meshToValidate.getHierarchyBoundingVectors(true); // true includes descendants
    const ghostWorldMin = Vector3.TransformCoordinates(
      ghostBounds.min,
      meshToValidate.getWorldMatrix()
    );
    const ghostWorldMax = Vector3.TransformCoordinates(
      ghostBounds.max,
      meshToValidate.getWorldMatrix()
    );

    for (const otherMesh of collidableMeshes) {
      if (
        otherMesh !== meshToValidate && // Don't check against self
        !otherMesh.name.includes('player') && // Ignore player
        !otherMesh.name.startsWith('ghost_') && // Ignore other ghosts (including descendants of current ghost)
        otherMesh.isEnabled() &&
        otherMesh instanceof Mesh &&
        otherMesh.getBoundingInfo() && // Check if bounding info exists
        otherMesh.getBoundingInfo().boundingBox.intersectsMinMax(ghostWorldMin, ghostWorldMax)
      ) {
        // console.log(`[Validation] Invalid placement: Intersects with ${otherMesh.name}`);
        return false; // Invalid if intersecting
      }
    }
    // TODO: Add terrain slope checks, etc. here
    return true; // Valid if no intersections found
  }

  private stopPlacement(): void {
    console.log('[Placement Stop] Stopping placement.');
    if (this.placementObserver) {
      this.scene.onBeforeRenderObservable.remove(this.placementObserver);
      this.placementObserver = null;
    }

    // --- REMOVE START: Dispose Cloned Mesh ---
    // if (this.ghostMeshRoot) {
    //   this.ghostMeshRoot.dispose(false, true);
    //   console.log(`[Placement Stop] Disposed cloned ghost mesh: ${this.ghostMeshRoot.name}`);
    // }
    // --- REMOVE END ---

    // --- ADD START: Dispose Instantiated Container ---
    if (this.ghostMeshContainer) {
      this.ghostMeshContainer.dispose();
      console.log('[Placement Stop] Disposed instantiated ghost container.');
      this.ghostMeshContainer = null;
    }
    // --- ADD END ---

    this.ghostMeshRoot = null; // Clear reference to the root
    this.currentBlueprint = null;
    this.placementRay = null;
    // this.previousPlacementValid = null; // <-- REMOVE

    crosshairService.unregisterInteractionHandler(this.interactionHandler);
    console.log('[Placement Stop] Interaction handler unregistered.'); // Add log
  }

  // Called by Interaction Handler or Controller
  public confirmPlacementAttempt(): void {
    if (this.buildingStore.canPlace && this.currentBlueprint) {
      this.buildingStore.confirmPlacement(this.lastPlacementPosition, this.lastPlacementRotation);
    } else {
      console.log('Cannot confirm placement: Position invalid or no blueprint.');
      // TODO: Add user feedback (e.g., sound effect)
    }
  }

  // Called by Interaction Handler or Controller
  public cancelPlacementAttempt(): void {
    this.buildingStore.cancelPlacement();
  }

  // --- REMOVED: handlePointerEvent method ---
  // private handlePointerEvent(pointerInfo: PointerInfo): void { ... }
  // --- END REMOVAL ---

  private requestPointerLock() {
    try {
      const canvas = document.getElementById('canvas') as HTMLCanvasElement | null; // Added type assertion
      if (canvas && canvas.requestPointerLock) {
        // --- ADDED: Explicit focus call (for diagnostics) ---
        canvas.focus(); // Try setting focus explicitly before/after lock
        // --- END ADD ---
        canvas.requestPointerLock();
        console.log('Pointer lock requested by BuildingPlacementService.');
      } else {
        console.warn('Canvas element not found or requestPointerLock not supported.');
      }
    } catch (error) {
      console.warn('Pointer lock request failed:', error);
    }
  }

  // HMR Cleanup
  public dispose(): void {
    console.log('🏗️ Disposing BuildingPlacementService...');
    this.stopPlacement(); // Ensure cleanup happens
    // --- REMOVE START: Material Disposal ---
    // this.ghostMaterialValidPBR?.dispose();
    // this.ghostMaterialInvalidPBR?.dispose();
    // --- REMOVE END ---
    this.currentBlueprint = null;
    this.placementRay = null; // Ensure ray is cleared on dispose
    if (currentPlacementServiceInstance === this) {
      currentPlacementServiceInstance = null;
    }
    console.log('🏗️ BuildingPlacementService disposed.');
  }
}

// --- Add Vite HMR hook ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Dispose triggered for BuildingPlacementService.ts');
    if (currentPlacementServiceInstance) {
      currentPlacementServiceInstance.dispose();
    } else {
      console.warn('[HMR] No current placement service instance found to clean up.');
    }
  });
}
// --- End HMR hook ---

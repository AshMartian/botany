import { defineStore } from 'pinia';
import { IBuildObject } from '@/models/building/BuildObject';
import * as buildObjects from '@/models/building/objects';
import { useInventoryStore } from './inventoryStore';
import { IInventoryItem } from '@/models/inventory/InventoryItem';
import { openDB, IDBPDatabase } from 'idb'; // <-- Import IDB types
import { Vector3, Quaternion } from '@babylonjs/core'; // <-- Import Vector3 and Quaternion

// --- Add IndexedDB Configuration ---
const DB_NAME = 'game-buildings';
const DB_VERSION = 1;
const STORE_NAME = 'placed-structures';
// --- End IndexedDB Configuration ---

// --- Add DB Instance Holder ---
let buildingDbInstance: IDBPDatabase | null = null;

// --- Define structure for saved building data ---
export interface PlacedBuildingData {
  id: string; // Unique instance ID for this placed object
  blueprintId: string; // ID of the blueprint used (e.g., 'replicator_01')
  position: { x: number; y: number; z: number }; // Use serializable format
  rotation: { x: number; y: number; z: number; w: number }; // Use serializable format
  placedByPlayerId: string; // Track who placed it
}
// --- End structure definition ---

// Helper function to check resource availability (Keep existing function)
function hasRequiredResources(
  inventoryItems: IInventoryItem[],
  recipe: { [key: string]: number }
): boolean {
  // ... (keep existing implementation)
  if (!recipe) return true; // Handle cases where recipe might be undefined or empty (no cost)
  for (const [resourceName, requiredAmount] of Object.entries(recipe)) {
    // Sum up quantity of the required resource across all stacks in inventory
    const totalAvailable = inventoryItems
      .filter((item) => item.name === resourceName)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (totalAvailable < requiredAmount) {
      console.warn(
        `Insufficient resource: Need ${requiredAmount} of ${resourceName}, have ${totalAvailable}`
      );
      return false;
    }
  }
  return true;
}

// --- Modify State Interface ---
export interface BuildingState {
  isBuildModeActive: boolean;
  availableBlueprints: IBuildObject[];
  placedBuildings: PlacedBuildingData[]; // <-- ADD THIS: Array to hold placed buildings
  selectedBlueprintId: string | null;
  isPlacing: boolean;
  // Optional: Add state for current ghost mesh position/rotation if needed by UI
  canPlace: boolean;
  // Optional: Add state for current ghost mesh position/rotation if needed by UI
  // currentPlacementPosition: Vector3 | null;
  // currentPlacementRotation: Quaternion | null;
}
// --- End State Interface Modification ---

// --- Add IndexedDB Helper Functions ---
async function getBuildingDb(): Promise<IDBPDatabase> {
  // Return existing instance if available
  if (buildingDbInstance) {
    // Remove !buildingDbInstance.closed check
    return buildingDbInstance;
  }
  // Open new connection
  buildingDbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Use 'id' as the keyPath and autoIncrement it for unique instance IDs
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: false });
        // Add an index if you need to query by blueprintId or playerId later
        // store.createIndex('blueprintId', 'blueprintId');
        // store.createIndex('placedByPlayerId', 'placedByPlayerId');
      }
    },
    // Handle external closes (e.g., browser dev tools)
    // closed() {
    //   console.warn('Building DB connection closed unexpectedly.');
    //   buildingDbInstance = null;
    // }
  });
  return buildingDbInstance;
}

async function savePlacedBuildingToDB(buildingData: PlacedBuildingData): Promise<void> {
  try {
    const db = await getBuildingDb();
    await db.put(STORE_NAME, buildingData);
    console.log(`Saved building ${buildingData.id} (${buildingData.blueprintId}) to DB`);
  } catch (e) {
    console.error('Failed to save building to IndexedDB:', e);
  }
}

async function loadPlacedBuildingsFromDB(): Promise<PlacedBuildingData[]> {
  try {
    const db = await getBuildingDb();
    const buildings = await db.getAll(STORE_NAME);
    console.log(`Loaded ${buildings.length} buildings from DB`);
    return buildings || [];
  } catch (e) {
    console.error('Failed to load buildings from IndexedDB:', e);
    return [];
  }
}

async function removePlacedBuildingFromDB(buildingInstanceId: string): Promise<void> {
  try {
    const db = await getBuildingDb();
    await db.delete(STORE_NAME, buildingInstanceId);
    console.log(`Removed building ${buildingInstanceId} from DB`);
  } catch (e) {
    console.error(`Failed to remove building ${buildingInstanceId} from IndexedDB:`, e);
  }
}
// --- End IndexedDB Helper Functions ---

export const useBuildingStore = defineStore('building', {
  // --- Update Initial State ---
  state: (): BuildingState => ({
    isBuildModeActive: false,
    availableBlueprints: Object.values(buildObjects).map(
      (BuildObjectClass) => new BuildObjectClass()
    ),
    placedBuildings: [], // <-- INITIALIZE as empty array
    selectedBlueprintId: null,
    isPlacing: false,
    canPlace: false,
    // currentPlacementPosition: null,
    // currentPlacementRotation: null,
  }),
  // --- End Update Initial State ---

  actions: {
    // --- Add Initialization Action ---
    async initializeBuildingStore() {
      this.placedBuildings = await loadPlacedBuildingsFromDB();
      // The spawning of these buildings is now handled in Game.ts after this initialization
      console.log('Building store initialized, loaded buildings:', this.placedBuildings);
    },
    // --- End Initialization Action ---

    toggleBuildMode() {
      // ... (keep existing implementation)
      if (this.isPlacing) {
        // If currently placing, cancel placement instead of toggling menu
        this.cancelPlacement();
      } else {
        this.isBuildModeActive = !this.isBuildModeActive;
        console.log(`Build menu ${this.isBuildModeActive ? 'opened' : 'closed'}`);
      }
    },

    enterBuildMode() {
      // ... (keep existing implementation)
      if (!this.isBuildModeActive && !this.isPlacing) {
        this.isBuildModeActive = true;
        console.log('Build menu opened');
      }
    },

    exitBuildMode() {
      // ... (keep existing implementation)
      if (this.isBuildModeActive) {
        this.isBuildModeActive = false;
        console.log('Build menu closed');
      }
      // Also cancel placement if exiting build mode entirely
      if (this.isPlacing) {
        this.cancelPlacement();
      }
    },

    selectBlueprintToBuild(blueprintId: string) {
      // ... (keep existing resource check)
      const blueprint = this.availableBlueprints.find((bp) => bp.id === blueprintId);
      if (!blueprint) {
        console.error(`Blueprint with ID ${blueprintId} not found.`);
        return;
      }

      const inventoryStore = useInventoryStore();
      const currentInventory = inventoryStore.items; // Use the reactive items state

      if (hasRequiredResources(currentInventory, blueprint.resourceCost)) {
        console.log(`Sufficient resources for ${blueprint.name}. Initiating placement...`);
        this.selectedBlueprintId = blueprintId;
        this.isPlacing = true; // <-- Enter placement mode
        this.isBuildModeActive = false; // Close the build menu UI
        this.canPlace = false; // Placement starts as invalid until raycast confirms

        // --- Trigger external placement logic ---
        // The BuildingPlacementService watches for this state change (isPlacing = true)
        // and automatically calls its startPlacement method.
        // --- End trigger ---
      } else {
        console.log(`Insufficient resources to build ${blueprint.name}.`);
        // TODO: Provide user feedback (e.g., highlight missing resources in UI)
      }
    },

    setPlacementStatus(canPlace: boolean /*, position?: Vector3, rotation?: Quaternion */) {
      // This action is called frequently by BuildingPlacementService during raycasting

      // Optional: Update position/rotation if needed for UI feedback
      // if (position) this.currentPlacementPosition = position;
      // if (rotation) this.currentPlacementRotation = rotation;

      if (this.isPlacing) {
        this.canPlace = canPlace;
      }
    },

    cancelPlacement() {
      if (!this.isPlacing) return;

      console.log('Placement cancelled.');
      this.isPlacing = false;
      this.selectedBlueprintId = null;
      this.canPlace = false;
      // this.currentPlacementPosition = null;
      // this.currentPlacementRotation = null;

      // --- Trigger external cleanup ---
      // The BuildingPlacementService watches for this state change (isPlacing = false)
      // and automatically calls its stopPlacement method.
      // --- End trigger ---
    },

    // --- Modify confirmPlacement to save data ---
    async confirmPlacement(position: Vector3, rotation: Quaternion): Promise<boolean> {
      // <-- ADD position and rotation parameters
      if (!this.isPlacing || !this.canPlace || !this.selectedBlueprintId) {
        console.warn(
          'Cannot confirm placement: Not placing, invalid position, or no blueprint selected.'
        );
        return false;
      }

      const blueprint = this.availableBlueprints.find((bp) => bp.id === this.selectedBlueprintId);
      if (!blueprint) {
        console.error(
          `Selected blueprint ${this.selectedBlueprintId} not found during confirmation.`
        );
        this.cancelPlacement();
        return false;
      }

      console.log(
        `Placement confirmed for ${blueprint.name} at ${position}. Attempting to consume resources...`
      );

      const inventoryStore = useInventoryStore();
      // TODO: Replace 'player1' with a dynamic or globally accessible player ID
      const playerId = inventoryStore.$state.items.length > 0 ? 'player1' : 'unknown_player'; // Placeholder for getting actual player ID
      if (playerId === 'unknown_player') {
        console.error('Cannot consume resources: Player ID is missing or could not be determined.');
        // Potentially load player ID from another store if available
        // const playerStore = usePlayerStore(); // Example
        // playerId = playerStore.selfPlayerId;
        // if (!playerId) return false;
        return false;
      }

      let consumptionSuccess = true;
      const resourcesToConsume = { ...blueprint.resourceCost };
      const updatePromises: Promise<void>[] = [];

      // ... (keep existing resource consumption logic) ...
      for (const [resourceName, amountNeeded] of Object.entries(resourcesToConsume) as [
        string,
        number,
      ][]) {
        let amountRemainingToConsume: number = amountNeeded;
        const matchingStacks = inventoryStore.items.filter((item) => item.name === resourceName);

        for (const stack of matchingStacks) {
          if (amountRemainingToConsume <= 0) break;

          const amountToTake = Math.min(amountRemainingToConsume, stack.quantity);
          const newQuantity = stack.quantity - amountToTake;

          if (newQuantity <= 0) {
            updatePromises.push(inventoryStore.removeItem(playerId, stack.stackId));
          } else {
            updatePromises.push(
              inventoryStore.updateItemQuantity(playerId, stack.stackId, newQuantity)
            );
          }
          amountRemainingToConsume -= amountToTake;
        }

        if (amountRemainingToConsume > 0) {
          console.error(
            `Failed to consume enough ${resourceName}. Needed ${amountNeeded}, could only find ${amountNeeded - amountRemainingToConsume}.`
          );
          consumptionSuccess = false;
          break;
        }
      }

      if (consumptionSuccess) {
        try {
          await Promise.all(updatePromises);
          console.log(`Resources consumed successfully for ${blueprint.name}.`);

          // --- Create and Save Building Data ---
          const newBuildingData: PlacedBuildingData = {
            id: `${blueprint.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`, // Generate a unique ID
            blueprintId: blueprint.id,
            position: { x: position.x, y: position.y, z: position.z }, // Serialize Vector3
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, // Serialize Quaternion
            placedByPlayerId: playerId,
          };

          this.placedBuildings.push(newBuildingData); // Add to local state
          await savePlacedBuildingToDB(newBuildingData); // Save to IndexedDB
          // --- End Save Building Data ---

          // --- Trigger external finalization (Spawning the *real* mesh) ---
          // The BuildingPlacementService should finalize the placement
          // (e.g., spawn the *real* object mesh in the scene) based on this success.
          // This could involve emitting an event, or having Game.ts watch placedBuildings.
          // Currently, Game.ts only spawns on load. A mechanism to spawn *this specific*
          // new building is needed here or in the service/game logic.
          // Example (conceptual): eventBus.emit('building-placed', newBuildingData);
          // --- End Trigger ---

          // Reset placement state *after* successful save and potential finalization trigger
          this.isPlacing = false;
          this.selectedBlueprintId = null; // Clear selected blueprint *after* successful placement
          this.canPlace = false;
          // this.currentPlacementPosition = null;
          // this.currentPlacementRotation = null;

          return true; // Indicate success
        } catch (error) {
          console.error(
            `Error during resource consumption or saving for ${blueprint.name}:`,
            error
          );
          consumptionSuccess = false;
          await inventoryStore.forceRefreshInventory(playerId); // Refresh inventory on error
        }
      }

      if (!consumptionSuccess) {
        console.error(`Failed to consume resources for ${blueprint.name}. Build cancelled.`);
        // Don't automatically cancel placement, allow user to retry or manually cancel
        return false; // Indicate failure
      }
      return false; // Should not be reached
    },
    // --- End Modify confirmPlacement ---

    // Action called by placement service *after* the real object is placed (or if needed)
    // This might not be strictly necessary if state resets correctly in confirmPlacement
    clearPlacedBlueprint() {
      if (!this.isPlacing) {
        // Only clear if not actively placing anymore
        this.selectedBlueprintId = null;
      }
    },

    // --- Add Action to Remove Building ---
    async removeBuilding(buildingInstanceId: string) {
      const index = this.placedBuildings.findIndex((b) => b.id === buildingInstanceId);
      if (index > -1) {
        const buildingToRemove = this.placedBuildings[index]; // Get data before removing
        this.placedBuildings.splice(index, 1); // Remove from local state
        await removePlacedBuildingFromDB(buildingInstanceId); // Remove from DB

        // --- Trigger external removal ---
        // Notify the scene/game logic to remove the corresponding mesh.
        // Example (conceptual): sceneManager.removeBuildingMesh(buildingInstanceId);
        // --- End Trigger ---

        console.log(
          `Removed building instance ${buildingInstanceId} (${buildingToRemove.blueprintId})`
        );
      } else {
        console.warn(`Building instance ${buildingInstanceId} not found in store.`);
      }
    },
    // --- End Action to Remove Building ---
  },
});

// --- Add HMR Handling for DB Connection ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (buildingDbInstance) {
      buildingDbInstance.close();
      buildingDbInstance = null;
      console.log('[HMR] Closed building DB connection.');
    }
  });
}

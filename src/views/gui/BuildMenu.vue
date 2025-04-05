<template>
  <div v-if="isBuildModeActive" class="build-menu-overlay" @click.self="closeMenu">
    <!-- Close on overlay click -->
    <div class="build-menu-container">
      <h2>{{ $t('buildMenu.title') }}</h2>
      <ul class="blueprint-list">
        <li v-for="blueprint in availableBlueprints" :key="blueprint.id">
          <button
            class="blueprint-button"
            :disabled="!canAffordBlueprint(blueprint)"
            @click="selectBlueprint(blueprint.id)"
            :title="blueprint.description"
          >
            <div class="blueprint-info">
              <h3>{{ blueprint.name }}</h3>
              <p class="blueprint-desc">{{ blueprint.description }}</p>
            </div>
            <div class="resource-cost">
              <span
                v-for="(amount, resource) in blueprint.resourceCost"
                :key="resource"
                :class="{ 'has-resource': hasEnoughResource(resource, amount) }"
              >
                {{ resource }}: {{ amount }}
              </span>
              <span
                v-if="!blueprint.resourceCost || Object.keys(blueprint.resourceCost).length === 0"
                class="no-cost"
              >
                {{ $t('buildMenu.noCost') }}
              </span>
            </div>
          </button>
        </li>
        <li v-if="availableBlueprints.length === 0">
          <p>{{ $t('buildMenu.noBlueprints') }}</p>
        </li>
      </ul>
      <button @click="closeMenu" class="close-button">{{ $t('buildMenu.close') }} [Esc]</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useBuildingStore } from '@/stores/buildingStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { IBuildObject } from '@/models/building'; // Adjust path if needed
import { IInventoryItem } from '@/models/inventory/InventoryItem'; // Adjust path if needed
import { useI18n } from 'vue-i18n'; // For translations

const { t } = useI18n(); // Initialize translations

const buildingStore = useBuildingStore();
const inventoryStore = useInventoryStore();

// Use storeToRefs for reactive access to state and getters
const { isBuildModeActive, availableBlueprints } = storeToRefs(buildingStore);
const { items: inventoryItems } = storeToRefs(inventoryStore); // Get reactive items

const selectBlueprint = (blueprintId: string) => {
  buildingStore.selectBlueprintToBuild(blueprintId);
  // The store action will close the menu by setting isBuildModeActive = false if successful
};

const closeMenu = () => {
  buildingStore.exitBuildMode();
};

// Checks if the player has enough of ALL resources for a specific blueprint
const canAffordBlueprint = (blueprint: IBuildObject): boolean => {
  if (!blueprint.resourceCost || Object.keys(blueprint.resourceCost).length === 0) return true; // No cost means affordable

  for (const [resource, requiredAmount] of Object.entries(blueprint.resourceCost)) {
    if (!hasEnoughResource(resource, requiredAmount)) {
      return false; // Missing at least one resource
    }
  }
  return true; // Has all required resources
};

// Checks if the player has enough of a SINGLE resource type
const hasEnoughResource = (resourceName: string, requiredAmount: number): boolean => {
  const totalAvailable = inventoryItems.value // Use .value for refs from storeToRefs
    .filter((item) => item.name === resourceName)
    .reduce((sum, item) => sum + item.quantity, 0);
  return totalAvailable >= requiredAmount;
};

const handleKeyPress = (event: KeyboardEvent) => {
  // Use .value for refs from storeToRefs
  if (event.key === 'Escape' && isBuildModeActive.value) {
    event.preventDefault(); // Prevent other Escape behavior if menu is open
    closeMenu();
  }
  // The 'b' key check has been removed from here.
  // The global Controller now solely handles the 'B' key toggle.
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyPress);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress);
});
</script>

<style scoped>
.build-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7); /* Darker overlay */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100; /* Ensure it's above other UI */
  backdrop-filter: blur(3px); /* Optional blur effect */
  cursor: pointer; /* Indicate clicking overlay closes it */
}

.build-menu-container {
  background-color: #2a2a2a; /* Dark background */
  color: #e0e0e0; /* Light text */
  padding: 25px;
  border-radius: 8px;
  border: 1px solid #444;
  min-width: 350px;
  max-width: 600px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  cursor: default; /* Reset cursor for the menu itself */
}

h2 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 20px;
  color: #61dafb; /* Accent color */
  text-transform: uppercase;
  letter-spacing: 1px;
}

.blueprint-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 60vh; /* Limit height and allow scrolling */
  overflow-y: auto;
  margin-bottom: 20px; /* Space before close button */
  padding-right: 5px; /* Space for scrollbar */
}

/* Scrollbar styling */
.blueprint-list::-webkit-scrollbar {
  width: 8px;
}
.blueprint-list::-webkit-scrollbar-track {
  background: #333;
  border-radius: 4px;
}
.blueprint-list::-webkit-scrollbar-thumb {
  background-color: #555;
  border-radius: 4px;
  border: 2px solid #333;
}
.blueprint-list::-webkit-scrollbar-thumb:hover {
  background-color: #777;
}

.blueprint-button {
  background-color: #383838;
  border: 1px solid #555;
  color: #e0e0e0;
  padding: 15px;
  margin-bottom: 10px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  display: flex; /* Use flexbox for layout */
  justify-content: space-between; /* Space out info and cost */
  align-items: center; /* Align items vertically */
}

.blueprint-button:hover:not(:disabled) {
  background-color: #4a4a4a;
  border-color: #777;
}

.blueprint-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #303030;
  border-color: #444;
}

.blueprint-info {
  flex-grow: 1; /* Allow info to take available space */
  margin-right: 15px; /* Space between info and cost */
}

.blueprint-info h3 {
  margin: 0 0 5px 0;
  color: #fff;
  font-size: 1.1em;
}
.blueprint-desc {
  margin: 0;
  font-size: 0.9em;
  color: #aaa;
}

.resource-cost {
  display: flex;
  flex-direction: column; /* Stack costs vertically */
  align-items: flex-end; /* Align costs to the right */
  font-size: 0.9em;
  min-width: 100px; /* Ensure some minimum width */
  text-align: right;
}

.resource-cost span {
  margin-bottom: 3px; /* Space between resource lines */
  color: #ff6b6b; /* Default to red (not enough) */
  white-space: nowrap; /* Prevent wrapping */
}
.resource-cost span:last-child {
  margin-bottom: 0;
}

.resource-cost span.has-resource {
  color: #69f0ae; /* Green if enough */
}

.resource-cost span.no-cost {
  color: #aaa; /* Grey for no cost text */
  font-style: italic;
}

.close-button {
  display: block; /* Make it a block element */
  margin: 20px auto 0 auto; /* Center the button */
  padding: 10px 20px;
  background-color: #555;
  border: 1px solid #777;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.close-button:hover {
  background-color: #666;
}

/* Style for the no blueprints message */
.blueprint-list li p {
  text-align: center;
  color: #aaa;
  padding: 20px;
  font-style: italic;
}
</style>

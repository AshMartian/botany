## 🚧 Phase 1: Core Gameplay Loop – Technical Plan 🌌

### 🎒 Inventory & Hotbar System

**Inventory Implementation**

- Establish foundational Vue.js components to facilitate a cohesive and intuitive inventory interface, ensuring a clear visual taxonomy of item slots and categories. This approach allows for organized grouping of related items (e.g., crafting ingredients, raw materials, and finished products) and encourages an efficient workflow for players.
- Define a robust data model within the Vuex store to systematically manage acquired resources, crafted implements, and specialized tools, incorporating typed definitions for each resource type. This enables straightforward extensibility when introducing additional items or resource categories in subsequent development phases.
- Integrate drag-and-drop functionality throughout the interface to ensure seamless player interactions and efficient item management. The system should accommodate stack splitting, combining like items, and show real-time indicators of valid item placements, thereby mitigating confusion and promoting clarity.

To make things easy, the Inventory should open with `esc` or `I` Key events.
For "I" we need to ensure that we release the cursor from the game scene.

**Hotbar Integration**

- Construct a dedicated hotbar component to expedite item access during gameplay, ensuring that the layout is unobtrusive but still readily visible for quick reference. A visually appealing representation of equipped items fosters an immersive experience.
- Enable direct association of inventory items with hotbar slots, thereby promoting swift engagement and real-time adaptability. Consider integrating an icon-based representation or item thumbnail mechanism, complemented by concise tooltips to clarify each slot's contents and usage.
- Develop keyboard shortcuts and mouse-based input logic for rapid item usage, enhancing gameplay fluidity and responsiveness. Additional customization—for instance, allowing players to rebind keys—can further refine user experience and accessibility.

## Implementation Outline for Inventory & Hotbar – Flexible & Generic Classes

Below is an outline of how you can structure your classes and interfaces for an extensible item system, along with code snippets demonstrating potential TypeScript implementations. The intent is to provide a robust foundation for managing a wide variety of inventory items, including tools that extend base functionality.

---

## 1. `InventoryItem` Base Class

**Purpose:** Serve as a generic, extensible representation of an item. By abstracting shared properties and methods at the base level, you can create specialized item types (e.g., tools, consumables, resources) without duplicating boilerplate.

**Key Properties & Methods:**

- **id:** Unique identifier.
- **name:** Display name.
- **iconPath:** Path or reference to an image/icon for UI.
- **stackable:** Whether items of this type can be stacked.
- **maxStackSize:** Maximum number of items per stack.
- **quantity:** Current stack quantity.
- **use()** (optional): Common logic for using or consuming an item.

```ts
// models/inventory/InventoryItem.ts

export interface IInventoryItem {
  id: string;
  name: string;
  iconPath?: string;
  stackable: boolean;
  maxStackSize: number;
  quantity: number;
  use?(): void;
}

export class InventoryItem implements IInventoryItem {
  constructor(
    public id: string,
    public name: string,
    public iconPath: string = '',
    public stackable: boolean = true,
    public maxStackSize: number = 99,
    public quantity: number = 1
  ) {}

  // Optional method for item use
  public use(): void {
    // Default: do nothing
    // Extended classes can override
  }
}
```

### Rationale

- An **interface** (`IInventoryItem`) plus a **concrete class** (`InventoryItem`) ensures you can type-check and also instantiate items with default behavior.
- The base class includes minimal logic, encouraging specialized extensions.

---

## 2. `Tool` Class (Extending `InventoryItem`)

**Purpose:** Represent a specialized item used for terraforming, mining, or other in-game actions. Tools might have durability, cooldowns, or advanced effects beyond generic items.

**Key Additional Properties & Methods:**

- **durability:** Tool health.
- **cooldown:** Time-based restriction on repeated uses.
- **use()**: Overridden method applying tool logic.
- **repair()**: Possibly restore durability.

```ts
// models/inventory/Tool.ts

import { InventoryItem } from './InventoryItem';

export class Tool extends InventoryItem {
  public durability: number;
  public cooldown: number;
  public lastUsed: number;

  constructor(
    id: string,
    name: string,
    iconPath: string = '',
    stackable = false, // Typically, tools are not stackable
    maxStackSize = 1,
    quantity = 1,
    durability = 100,
    cooldown = 1000 // e.g. 1000ms
  ) {
    super(id, name, iconPath, stackable, maxStackSize, quantity);
    this.durability = durability;
    this.cooldown = cooldown;
    this.lastUsed = 0;
  }

  public use(): void {
    const now = Date.now();
    // Check cooldown
    if (now - this.lastUsed < this.cooldown) {
      console.log(`Tool ${this.name} is on cooldown.`);
      return;
    }

    // Deduct durability
    this.durability -= 1;
    this.lastUsed = now;

    // Trigger custom logic for mining, terraforming, etc.
    console.log(`Using tool: ${this.name}`);

    // If durability hits zero, handle break or removal
    if (this.durability <= 0) {
      console.log(`${this.name} has broken!`);
      // Possibly remove from inventory or mark as unusable
    }
  }

  public repair(amount: number): void {
    this.durability = Math.min(this.durability + amount, 100);
  }
}
```

### Rationale

- Overriding the **use()** method enables custom behavior for different tool types.
- **durability** and **cooldown** illustrate some typical expansions. Additional stats (e.g., mining power, terraforming strength) can be appended as needed.

---

## 3. Managing Items in Vuex

**Purpose:** Provide centralized state management for inventory data, ensuring reactivity and a consistent game-wide source of truth.

### Example: `store/modules/inventory.ts`

```ts
// store/modules/inventory.ts
import { Module } from 'vuex';
import { RootState } from '@/store/types';
import { IInventoryItem, InventoryItem } from '@/models/inventory/InventoryItem';

export interface InventoryState {
  items: IInventoryItem[];
  // Potentially track more specialized state, e.g., activeTool, selectedSlot, etc.
}

export const inventory: Module<InventoryState, RootState> = {
  namespaced: true,

  state: (): InventoryState => ({
    items: [],
  }),

  mutations: {
    addItem(state, newItem: IInventoryItem) {
      // Attempt to stack if item already exists
      if (newItem.stackable) {
        const existing = state.items.find(
          (i) => i.id === newItem.id && i.quantity < i.maxStackSize
        );
        if (existing) {
          // Increment quantity up to max
          const spaceLeft = existing.maxStackSize - existing.quantity;
          const amountToAdd = Math.min(spaceLeft, newItem.quantity);
          existing.quantity += amountToAdd;
          const leftover = newItem.quantity - amountToAdd;
          if (leftover > 0) {
            // If leftover, create a new item instance
            state.items.push({ ...newItem, quantity: leftover });
          }
          return;
        }
      }
      state.items.push(newItem);
    },

    removeItem(state, itemId: string) {
      state.items = state.items.filter((i) => i.id !== itemId);
    },

    updateItemQuantity(state, payload: { itemId: string; quantity: number }) {
      const target = state.items.find((i) => i.id === payload.itemId);
      if (!target) return;
      target.quantity = payload.quantity;
      // If quantity hits zero, remove
      if (target.quantity <= 0) {
        state.items = state.items.filter((i) => i !== target);
      }
    },

    useItem(state, itemId: string) {
      const target = state.items.find((i) => i.id === itemId);
      if (!target || !target.use) return;
      target.use();
    },
  },

  actions: {
    // Optional async actions if needed (e.g., saving inventory to IndexedDB)
  },

  getters: {
    allItems: (state) => state.items,
    getItemById: (state) => (id: string) => state.items.find((i) => i.id === id),
  },
};
```

### Rationale

- Mutations handle synchronous changes (adding/removing items, updating quantities).
- **useItem** delegates logic to the item’s own **use()** method, enabling dynamic behavior for different item types.
- Further expansions could track hotbar assignments, or store specialized data for tools vs. generic items.

---

## 4. Hotbar Integration

**Purpose:** Provide rapid item usage during gameplay, distinct from the broader inventory.

### Example: `store/modules/hotbar.ts`

```ts
// store/modules/hotbar.ts
import { Module } from 'vuex';
import { RootState } from '@/store/types';
import { IInventoryItem } from '@/models/inventory/InventoryItem';

export interface HotbarSlot {
  slotIndex: number;
  itemId: string | null;
}

export interface HotbarState {
  slots: HotbarSlot[];
}

export const hotbar: Module<HotbarState, RootState> = {
  namespaced: true,

  state: (): HotbarState => ({
    slots: [
      { slotIndex: 0, itemId: null },
      { slotIndex: 1, itemId: null },
      { slotIndex: 2, itemId: null },
      { slotIndex: 3, itemId: null },
      // ... add more slots if desired
    ],
  }),

  mutations: {
    assignItemToSlot(state, payload: { slotIndex: number; itemId: string }) {
      const slot = state.slots.find((s) => s.slotIndex === payload.slotIndex);
      if (slot) {
        slot.itemId = payload.itemId;
      }
    },
    removeItemFromSlot(state, slotIndex: number) {
      const slot = state.slots.find((s) => s.slotIndex === slotIndex);
      if (slot) {
        slot.itemId = null;
      }
    },
  },

  actions: {
    // E.g. equip an item from the inventory module
    equipItemToSlot({ commit }, { slotIndex, itemId }) {
      commit('assignItemToSlot', { slotIndex, itemId });
    },
  },

  getters: {
    getSlot: (state) => (slotIndex: number) => state.slots.find((s) => s.slotIndex === slotIndex),
  },
};
```

**UI Components**

```vue
<!-- views/gui/Hotbar.vue -->
<template>
  <div class="hotbar">
    <div v-for="slot in slots" :key="slot.slotIndex" class="hotbar-slot">
      <div v-if="slot.itemId">
        <!-- Render item icon or name -->
        {{ getItemById(slot.itemId)?.name }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useStore } from 'vuex';

export default defineComponent({
  name: 'Hotbar',
  setup() {
    const store = useStore();

    const slots = computed(() => store.state.hotbar.slots);
    const getItemById = (id: string) => store.getters['inventory/getItemById'](id);

    return {
      slots,
      getItemById,
    };
  },
});
</script>

<style>
.hotbar {
  display: flex;
  /* layout styling */
}
.hotbar-slot {
  border: 1px solid #ccc;
  width: 64px;
  height: 64px;
  margin: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
```

### Rationale

- A separate **hotbar** module in Vuex allows for easy retrieval of assigned items.
- The example `Hotbar.vue` demonstrates how a UI might retrieve assigned items and render them.
- Keyboard or mouse input can trigger calls to `useItem` in the inventory module, passing the item ID from the hotbar.

## 5. Summary & Future Extensions

1. **InventoryItem** & **Tool** Classes
   - Provide a flexible foundation for diverse item types.
   - Additional classes (e.g., `Consumable`, `Weapon`) can be introduced similarly.
2. **Vuex Integration**
   - Centralizes state (inventory, hotbar) for easy, reactive updates.
   - Clear separation of concerns for item storage vs. quick usage.
3. **UI Overlay**
   - Distinct components for **Inventory Panel** and **Hotbar** with drag-and-drop, stack management, and real-time display of item states.
4. **Customization & Accessibility**
   - Rebindable keys, alternative UI layouts, or unique item categories can be introduced as your game evolves.
5. **Performance Considerations**
   - If item counts escalate, optimize how you track, filter, and sort large inventories.
   - Use watchers or computed properties judiciously in Vue to minimize unnecessary re-renders.

With these classes and store modules in place, you’ll be well-positioned to develop a robust, extensible inventory and hotbar system. Additional logic—like tool efficacy or specialized item interactions—can be introduced incrementally, maintaining a consistent design pattern that supports future expansion.

### 🔧 Initial Interaction Tools

**Terraforming Tool Development**

- Devise a foundational system for vertex selection on the terrain, recognizing relevant coordinates through Babylon.js. This system must account for distance thresholds and player orientation to avoid unintended modifications to distant vertices.
- Implement a crosshair user interface element that dynamically presents granular data on the targeted terrain vertex, encompassing:
  - **Nitrates:** Declarations of low, medium, or high concentrations, remediable by the application of nitrate compounds sourced from chemical extraction processes or refined from local Martian materials.
  - **Nutrients:** States ranging from depleted to rich, improvable via organic compost or similarly effective amendments. A specialized composting system could be introduced in later updates, deriving nutrient-rich matter from harvested fungal biomass.
  - **Moisture:** Gradations from dry to moist, augmentable through irrigation apparatuses or water distribution systems. These systems might rely on the presence of water nodes discovered during resource gathering, which can be piped to targeted vertices.
  - **Phosphates:** Levels denoting excess, balance, or deficiency, subject to correction through chemical adjustments. Overapplication of phosphate could hinder certain flora types, necessitating a balanced approach.
  - **Fungus Growth:** Evolutionary progression from absence to sporulation and mature fungal presence, contingent on inoculation. This property directly influences overall soil health, as mature fungi facilitate nutrient cycling and water retention.
  - **Fertilization Status:** Sliding scale from unfertilized to fully fertilized, influenced by targeted fertilizer application. Distinct fertilizer formulas can yield varying growth rates or specialized benefits for specific plant families.
- Introduce methods (e.g., applying nitrates or fungal spores) that materially alter these attributes, conferring direct environmental feedback through shader updates. Integrate safety checks to ensure that repeated applications do not generate unintended exponential effects on the terrain.
- Provide immediate visual confirmation in Babylon.js when terraforming activities affect terrain appearance or parameters, such as shifting hues to reflect moisture increments or subtle glows to indicate heightened nutrient presence.

**Resource Gathering Tools**

- Incorporate procedural generation algorithms (e.g., Perlin or Simplex noise) to selectively spawn deposits of silicon, metals, and other critical resources within each 128×128 terrain chunk. Each deposit should carry a probability weight, reflecting geological plausibility, thereby delivering a consistent challenge.
- Randomly allocate water-rich regions based on probabilistic moisture thresholds, ensuring a realistic but varied gameplay experience. Developers could factor in altitude and temperature considerations in advanced versions, enabling more intricate resource distribution patterns.
- Create specialized mining or extraction tools enabling resource collection from generated deposits, while offering real-time feedback through animations and audio cues. Mining durations or tool durability could vary based on the deposit's density or player skill progression, introducing a layer of strategic resource management.
- Synchronize extraction events with the IndexedDB schema, ensuring that resource node locations, quantities, and states persist across sessions. This synchronization must be optimized to reduce potential performance bottlenecks if numerous extractions occur in quick succession.

### 📦 Persistent Terrain State Management

**IndexedDB Setup**

- Initialize an IndexedDB database to maintain durable records of gameplay progress, chunk metadata, and relevant resource data. Employ an appropriately versioned schema, allowing for non-disruptive structural changes as the simulation expands.
- Establish a structured data schema for each terrain chunk (128×128), encapsulating per-vertex soil properties (nitrates, nutrients, moisture, phosphates, fungus) and resource node details (ore deposits, water patches), along with any procedural or dynamic alterations. Each chunk stores a unique identifier (`chunkID`), a comprehensive array of vertex data, and a collection of resource node objects.
- Serialize changes and partial updates as JSON objects to facilitate consistent retrieval and modification whenever a terrain segment is loaded or updated. Batching these write operations can mitigate performance overhead, especially in large-scale terraforming events.

**Saving & Loading Terrain State**

- Implement event-driven or interval-based saving methodologies to ensure a minimal performance impact while maintaining data persistence. For instance, saving can be triggered upon concluding a mining action, applying a major terraforming change, or crossing chunk boundaries.
- Retrieve and reconstruct chunk configurations upon game initialization, accurately reflecting all terraforming and resource adjustments introduced in prior sessions. Chunks that have not been generated yet should invoke procedural creation logic to ensure a seamless and continuous world-building experience.

```javascript
// Example chunk data schema
{
  chunkID: "unique-chunk-identifier", // e.g., "1-2" for chunk row 1, column 2
  width: 128,
  height: 128,
  vertexData: [
    // Flattened or two-dimensional array storing each vertex's properties
    {
      x: 0,
      y: 0,
      nitrates: 0.1,
      nutrients: 0.2,
      moisture: 0.05,
      phosphates: 0.02,
      fungusGrowth: 0,
      fertilizationStatus: 0,
      // Additional properties or states as needed
    },
    {
      x: 0,
      y: 1,
      ...
    },
    // ... etc. for each vertex
  ],
  resourceNodes: [
    {
      nodeID: "ore-0123",
      type: "metal",
      quantity: 120,
      x: 64,
      y: 50,
      // Possibly 3D if dealing with height: z: 10,
      mined: false,
    },
    {
      nodeID: "water-0456",
      type: "water",
      quantity: 50,
      x: 90,
      y: 90,
      // Additional resource-specific flags
    },
    // Additional resource nodes...
  ],
  updatedAt: "2025-03-22T12:34:56.789Z"
}
```

### 🕹️ Gameplay & Player Interaction Testing

**Testing Infrastructure**

- Develop a rigorous testing protocol comprising both automated test suites and manual evaluation. Automated tests leverage Jest and Vue Test Utils to validate component functionality and state management logic:

  ```bash
  npm install --save-dev jest @vue/test-utils vue-jest babel-jest
  ```

  ```javascript
  // example.spec.js
  import { shallowMount } from '@vue/test-utils';
  import Inventory from '@/components/Inventory.vue';

  describe('Inventory.vue', () => {
    it('renders inventory items correctly', () => {
      const wrapper = shallowMount(Inventory, {
        propsData: { items: ['tool1', 'tool2'] },
      });
      expect(wrapper.text()).toContain('tool1');
      expect(wrapper.text()).toContain('tool2');
    });
  });
  ```

- Initiate structured playtesting sessions to discern usability, performance bottlenecks, and emergent gameplay patterns. Playtests might include tasks such as terraforming a single chunk to a sustainable level or fully depleting a metallic deposit.
- Document areas requiring optimization, categorize issues by severity, and integrate solutions iteratively. This may involve rebalancing resource spawn rates, refining UI feedback loops, or streamlining data synchronization procedures.

### 📈 Milestone Objectives

- A fully operational inventory and hotbar system enabling seamless resource and item management, offering players immediate visual clarity and efficient interactivity.
- Functional terraforming and resource extraction mechanics, incorporating both vertex-based modifications and node-based generation. The combined impact of these mechanics should yield emergent gameplay dynamics that encourage exploration and strategic planning.
- A robust IndexedDB-driven system for saving, retrieving, and updating persistent terrain states. This includes well-structured chunk data and comprehensive record-keeping for resource distribution and player interventions.
- Initial testing cycle completed, encompassing both automated and manual strategies, culminating in a stable, playable foundation for further development. Recommendations for optimization and next-phase expansions are identified, ensuring that the project can transition seamlessly into subsequent development milestones.

## 1. Terrain-Related Files

### `models/terrain/TerrainChunk.ts`

Manages individual 128×128 chunks, including:

- **Chunk Data Schema** (vertex data, resource deposits)
- **Procedural Generation** logic (Perlin/Simplex noise)
- **Load/Save Mechanisms** for chunk state (IndexedDB integration)

### `models/terrain/TerrainManager.ts`

Coordinates interactions across multiple `TerrainChunk` instances:

- **Chunk Retrieval** based on player location
- **Procedural Generation** triggers for uninitialized chunks
- **Batch Updates** to terrain data (e.g., after mining or terraforming actions)

### `models/terrain/TerrainMaterial.ts`

Applies shader logic for real-time visual feedback:

- **Custom Shaders** reflecting nitrates, moisture, fungus growth
- **Runtime Updates** triggered by crosshair-based terraforming tools

---

## 2. Inventory & Resource Management

### `store/vuex/level/index.ts`, `store/vuex/level/mutations.ts`

While currently used for level-related data, these can serve as references or a starting point for:

- **Inventory State** storing items, resources, and crafting materials
- **Action & Mutation Logic** for adding/removing items, partial updates, and UI reactivity

### `store/store.ts`

Centralizes Vuex configuration:

- **New Modules** for inventory/hotbar or resource management can be introduced here
- **Global State** hooks for terrain modifications, resource extraction events

---

## 3. Player & Tools

### `models/player/Player.ts`

Handles core player logic:

- **Integration Points** for item usage in the inventory/hotbar system
- **Equip/Unequip** logic for terraforming/mining tools
- **Callback Hooks** for triggered interactions, such as on crosshair aim

### `models/playerSelf/Controller.ts`, `models/playerSelf/ControllerKeyboard.ts`

Manages real-time controls:

- **Key Bindings** for hotbar slots
- **Tool Use** logic on keypress/mouse click

### `models/mehanics/Points.ts` (and other mechanics files)

- Potential reference for how points or interactive objects are managed, possibly extended for **resource deposit** interactions or **terraforming zones**.

---

## 4. Scene & Rendering

### `models/scene/Canvas.ts`

Sets up the core Babylon.js canvas:

- **Attach Crosshair UI** for vertex data feedback
- **Register Rendering Loops** for dynamic terrain updates

### `models/scene/Scene.ts`

Oversees scene initialization:

- **Terrain Manager Hooks** for chunk generation/loading
- **Post-Processing** or **Shader Effects** relevant to the terraforming system

### `models/scene/Materials.ts`

- May already contain material definitions or placeholders you can adapt for **dynamic terrain** visuals.

---

## 5. Audio

### `models/sounds/SoundMain.ts`, `models/sounds/Player.ts`

- Add SFX triggers for **mining**, **tool usage**, or **terraforming** events.
- **Audio Feedback** can enhance user immersion during resource extraction.

---

## 6. Views & UI

### `views/gui/...` (e.g. `MenuLevel.vue`, `TopBar.vue`, etc.)

- Serve as references for implementing new UI elements (inventory panel, hotbar overlay).
- Could be extended or mirrored to create **Inventory.vue** or **ResourcePanel.vue** for core gameplay.

### `views/LevelPage.vue`

- Potential location for hooking in the new **inventory** or **crosshair** overlay, or for toggling them on/off.

---

**Summary:**

1. The **terrain** subfolder is key for chunk generation, data structures, and real-time updates.
2. **Vuex store** modules and the main store are prime integration points for new inventory/hotbar logic.
3. **Player** and **mechanics** files offer natural injection points for tool usage and resource collection systems.
4. The **scene** and **Babylon.js** integration files govern rendering, crosshair interaction, and real-time shading.
5. Relevant UI files in `views/gui` can be extended or referenced for the new inventory and resource panels.

By focusing on these areas, you can implement Phase 1’s core objectives—inventory/hotbar systems, terraforming tools, resource gathering, and persistent terrain data—while making efficient use of the existing file structure.

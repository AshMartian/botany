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

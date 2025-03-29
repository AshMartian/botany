## 🚀 Phase 2: Crafting & Building System

### 🎯 High-Level Objectives

1. **Replicator (3D Printer) Mechanic** for crafting small items/tools in a controlled environment.
2. **Structure Building System** allowing players to develop large-scale constructions and bases.
3. **Balanced Resource Management** that organically promotes exploration, strategic planning, and incremental growth.

---

## 1. Crafting System

### 1.1 Crafting Workflow

1. **Resource Gathering**: Players traverse the Martian surface to harvest fundamental materials (Iron, Silicon, Water, Carbon, etc.). These expeditions also facilitate deeper engagement with the planet’s topography, incentivizing the search for scarce components.
2. **Replicator Access**: Interact with a dedicated replicator interface (initially housed within the Starship) to convert raw resources into usable items. In advanced phases, additional replicators can be built at outposts for localized manufacturing.
3. **Recipe Selection**: Choose from a curated list of item blueprints, each requiring specific resources to craft. Recipes gradually unlock as players progress, providing a measured sense of accomplishment.
4. **Inventory Check**: Confirm that all required materials are present in the player’s storage. If resources are insufficient, the replicator interface gives feedback, directing further expeditions.
5. **Crafting**: Deduct resources from the player’s inventory, then trigger an animated crafting sequence or progress bar. This visual feedback underscores the transformative process.
6. **Result**: The newly created tool, consumable, or component is deposited directly into the player’s inventory, primed for immediate use or future assembly tasks.

### 1.2 Recipe Data Structure

- Maintain a structured repository (JSON, TS object, or a server-driven configuration) mapping item names to resource prerequisites.
  ```json
  {
    "Pickaxe": { "Iron": 2, "Silicon": 1 },
    "SoilAnalyzer": { "Silicon": 2, "Iron": 1, "Water": 1 },
    "PortableReplicator": { "Iron": 5, "Silicon": 5, "Carbon": 2 }
  }
  ```
- This format fosters ease of modification, allowing rapid iteration on item requirements without invasive code changes.
- Certain items (e.g., advanced drills or specialized terraforming gear) might require both standard resources and rarer components, tying progression to exploration.

### 1.3 Technical Integration

- **Replicator UI**:
  - A Vue-based interface showcasing available recipes, dynamically updated according to the player’s current inventory.
  - Incorporate a small 3D preview or item icon to enhance immersion.
  - Display an animated bar (or rotating gear) during active crafting, reinforcing the theme of futuristic fabrication.
- **Vuex Store**:
  - Centralize crafting logic in a `crafting` module or integrate within an existing `inventory` module for synergy.
  - Provide asynchronous actions if real-time ‘crafting timers’ or advanced logic (like queueing items) are introduced.
- **Item/Tool Classes**:
  - Extend your `InventoryItem` base class for specialized stats (e.g., durability, mining efficiency).
  - This object-oriented approach preserves a scalable item hierarchy, accommodating expansions like weaponry or high-tier building gadgets.

---

## 2. Structure Building System

### 2.1 Build Mode & Menu

- Players toggle build mode through a distinct input (e.g., pressing [B] or equipping a “Build Tool”). A dedicated UI (e.g., `BuildMenu.vue`) opens, enumerating blueprint options like **Greenhouse Domes**, **Solar Arrays**, or **Storage Modules**.
- Each blueprint may show a required resource list, a brief description, and potential synergy with other structures (e.g., Greenhouse Domes benefit from adjacency to Water Extractors). This synergy can incentivize strategic base layout.

### 2.2 Placement & Construction

1. **Preview Ghost**: Render a semi-transparent mesh or bounding shape, updating position based on raycasts from the camera/crosshair to the terrain.
   - Allow rotation or flipping of the preview with mouse scroll or designated hotkeys.
2. **Validation**: Evaluate collisions with existing structures or terrain obstructions. Enforce resource checks to deter incomplete builds.
3. **Confirm Build**: Deduct the specified resources upon user confirmation. Spawn a fully realized mesh in the scene with final textures, collision geometry, and any relevant scripts (e.g., power generation, door animations).
4. **Persist**: Save the new structure’s position, rotation, type, and ownership data in IndexedDB or a server database for permanent world state.

### 2.3 Potential Structures & Requirements

- **Solar Panel**: (4 Silicon, 4 Iron)
  - Generates power necessary for advanced outposts.
- **Greenhouse Dome**: (6 Iron, 4 Silicon, 2 Carbon, 2 Water)
  - Facilitates soil-based or hydroponic plant growth, crucial for terraforming milestones.
- **Storage Module**: (5 Iron, 2 Silicon, 2 Carbon)
  - Expands item capacity, enabling the player to store more resources and crafted components.
- **Replicator**: (5 Iron, 5 Silicon, 2 Carbon)
  - Deployable away from the Starship, further decentralizing crafting capabilities and encouraging multi-base strategies.

### 2.4 Terrain Modification

When certain structures are built—particularly large buildings or those requiring a stable foundation—the terrain must flatten or adjust to accommodate the new placement. Rather than relying solely on a purely visual approach, our simulation can directly manipulate the underlying vertex data in the `terrainStore`, applying a height offset for each relevant vertex.

### Implementation Outline

1. **Identify Affected Vertices**

   - When the player confirms construction, the system calculates which vertices fall beneath or near the projected footprint of the structure. This can be accomplished via bounding boxes, circular radii, or polygon-based footprints.
   - The terrain system already segments data per vertex in each chunk, so the build algorithm can locate vertices by chunk and index.

2. **Compute Flatten Offset**

   - For each affected vertex, compute a target height (e.g., the median or minimum height within the footprint, or a specific elevation) to ensure the base is level.
   - Deduce the per-vertex "delta" from its current elevation to the target elevation.

3. **Apply Height Adjustments**

   - Update each vertex in the `terrainStore` by adding the computed offset (positive or negative).
   - If partial smoothing is desired, gradually blend the boundary between adjusted and untouched terrain to avoid abrupt transitions.

4. **Update Mesh in Real-time**

   - After modifying vertex heights in `terrainStore`, signal the rendering engine (e.g., through `TerrainChunk.ts`) to recalculate normals and refresh the relevant mesh data.
   - This ensures that visually, the terrain flattens around the placed structure in real-time.

5. **IndexedDB Persistence**

   - As with other terrain edits, the updated vertex heights and chunk data must be saved to IndexedDB.
   - On reload, these changes persist so the terrain remains flattened.

### Algorithmic Considerations

- **Flattening Radius**: Decide how large the footprint is—some structures may have simple bounding circles, while others may require a rectangular or custom shape.
- **Height Choice**: A flatten algorithm can use the average, minimum, or a custom-based approach (e.g., aligning to the lowest vertex) to ensure uniform surfaces.
- **Smoothing Factor**: If the transition between new and old heights is too steep, consider a gradient approach where vertices near the boundary only partially shift, reducing harsh "cliffs."
- **Performance**: For large structures, keep updates bounded to only those chunks and vertices within the footprint area.

By integrating this terrain-flattening logic directly into the existing chunk and vertex system, buildings can rest on stable ground, improving immersion and ensuring that new constructions realistically alter the Martian landscape.

---

## 3. Balancing & Progression

- **Resource Rarity & Distribution**:
  - Fine-tune spawn frequencies of primary vs. rare materials, guiding players to advanced items at a measured pace.
  - Encourage exploration by placing unique or highly concentrated resource deposits in remote or challenging-to-reach zones.
- **Escalating Recipe Complexity**:
  - Early tools require smaller, more common resources (Iron, Water), gradually introducing rarer materials like Carbon or exotic isotopes.
- **Incentivized Outpost Placement**:
  - Players benefit from situating advanced structures near resource hotspots, fostering base-building in strategic locations.

---

## 4. Technical Details – Key Points

### 4.1 Crafting Implementation

```typescript
// store/modules/crafting.ts
export default {
  namespaced: true,
  state: {
    recipes: {
      Pickaxe: { Iron: 2, Silicon: 1 },
      // ... more recipes
    },
  },
  actions: {
    craftItem({ state, rootState, commit }, itemName) {
      const recipe = state.recipes[itemName];
      if (!recipe) return false;
      // Validate inventory resources
      if (!hasRequiredResources(rootState.inventory.items, recipe)) {
        return false;
      }
      // Deduct resources
      commit('inventory/removeResources', recipe, { root: true });
      // Possibly add a small crafting timer or animated sequence
      commit('inventory/addItem', { name: itemName, quantity: 1 }, { root: true });
      return true;
    },
  },
};

function hasRequiredResources(inventoryItems, recipe) {
  for (const [resource, amt] of Object.entries(recipe)) {
    const invItem = inventoryItems.find((i) => i.name === resource);
    if (!invItem || invItem.quantity < amt) {
      return false;
    }
  }
  return true;
}
```

**Considerations**:

- Incorporate an **item queue** or timed production for more immersive crafting.
- Distinguish between starship replicator recipes (basic items) and advanced replicators (complex gear), unlocking new recipes upon achieving certain milestones.
- Provide user feedback if crafting fails due to insufficient resources or inventory space.

### 4.2 Building Placement Mechanics

- **Raycasting**: Project from the camera or crosshair onto the terrain to obtain a valid 3D placement position.
- **Ghost Mesh**: Create or clone a semitransparent mesh of the intended structure for real-time previews.
- **Collision & Resource Checks**: Evaluate whether the build site is free of obstructions and ensure the player’s inventory has enough materials.
- **Final Placement**:

  ```typescript
  class Builder {
    private selectedStructure: string;

    constructor(private scene: BABYLON.Scene) {}

    showPreview(position: BABYLON.Vector3) {
      // Move or rotate ghost mesh to position
    }

    placeStructure(position: BABYLON.Vector3) {
      // Confirm resource availability
      // If valid, consume resources, instantiate final mesh
      // Save new structure data to IndexedDB or server
    }
  }
  ```

- **IndexedDB Persistence**: Keep a record of each placed structure, so on reload or multiplayer sync, the scene re-creates them with correct positions and properties.

### 4.3 Additional Considerations

- **Lighting & Shadows**: Large structures may cast significant shadows. Ensure your lighting setup (sunlight or local lights) is performance-friendly.
- **Performance**: Instancing or chunked loading might be relevant if the player can place vast numbers of structures. Off-screen culling or bounding volume checks can prevent performance degradation in expansive bases.

---

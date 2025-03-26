### 🔧 Initial Interaction Tools

**Terraforming Tool Development**

- Devise a foundational system for vertex selection on the terrain, recognizing relevant coordinates through Babylon.js. This system must account for distance thresholds and player orientation to avoid unintended modifications to distant vertices.
- Implement a crosshair user interface element that dynamically presents granular data on the targeted terrain vertex, encompassing:
  - **Perchlorates**: Martian soil is harmful for plants and people. This is because it contains a lot of chlorine in molecules called perchlorates. These toxic molecules, which kill microorganisms, will need to be removed before the soil can be used to grow food crops on Mars.
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
- We already have a solid inventory system and the ability to collect regolith. The initial Player process as follows:
  - Player finds raw iron ore that spawns randomly initially per chunks, but is stored in the terrain state so the material deposits persist accross sessions.
  - Collects small ore and crafts into a water pump out of metals
    - Water pump improves surrounding soil moisture
  - Collects Regolith from the ground
  - Uses water to clean regolith and purge of perclorates, byproduct is clean soil and perclorate water (can be used later and cleaned)
  - Clean soil can be added back to ground sections to improve top-soil quality (reducing plerclorates, increased moisture)

### 📦 Persistent Terrain State Management

**IndexedDB Setup**

- Initialize an IndexedDB database to maintain durable records of gameplay progress, chunk metadata, and relevant resource data. Employ an appropriately versioned schema, allowing for non-disruptive structural changes as the simulation expands.
- Follow InventoryStore setup
- Establish a structured data schema for each terrain chunk (128×128), encapsulating per-vertex soil properties (nitrates, nutrients, moisture, phosphates, fungus) and resource node details (ore deposits, water patches), along with any procedural or dynamic alterations. Each chunk stores a unique identifier (`chunkID`), a comprehensive array of vertex data, and a collection of resource node objects.
- Serialize changes and partial updates as JSON objects to facilitate consistent retrieval and modification whenever a terrain segment is loaded or updated. Batching these write operations can mitigate performance overhead, especially in large-scale terraforming events.

**Saving & Loading Terrain State**

- Implement event-driven or interval-based saving methodologies to ensure a minimal performance impact while maintaining data persistence. For instance, saving can be triggered upon concluding a mining action, applying a major terraforming change, or crossing chunk boundaries.
- Retrieve and reconstruct chunk configurations upon game initialization, accurately reflecting all terraforming and resource adjustments introduced in prior sessions. Chunks that have not been generated yet should invoke procedural creation logic to ensure a seamless and continuous world-building experience.

```javascript
// Example chunk data schema
{
  chunkID: "unique-chunk-identifier", // e.g., "1_2" for chunk row 1, column 2
  width: 128,
  height: 128,
  defaultVertexData: { // Each chunk can have a different default set of conditions that we can define through randomization. The player will stratigically find the most moist and resource rich chunks
      nitrates: 0.1,
      nutrients: 0,
      moisture: 0.05,
      phosphates: 0.02,
      perchlorates: 100,
      fungusGrowth: 0,
      fertilizationStatus: 0,
  },
  vertexData: [
    // Flattened or two-dimensional array storing the overriden vertex properties
    {
      x: 0,
      y: 0,
      nitrates: 0.1,
      nutrients: 0.2,
      moisture: 0.05,
      phosphates: 0.02,
      perchlorates: 70,
      fungusGrowth: 0,
      fertilizationStatus: 0,
      // Additional properties or states as needed
    },
    {
      x: 0,
      y: 1,
      ...
    },
    // ... etc. for each vertex that has been changed from the chunk defaults
  ],
  resourceNodes: [ // Random length
    { // The more iron that spawns, the less water, and vice versa
      nodeID: "ore-uuid",
      type: "iron",
      quantity: 120, // Direct corelation with render size
      x: 64,
      y: 50,
      z: 20
      mined: false,
      loose: false // If true, the player can just pick up directly and not need a tool to mine, but only yields one
    },
    { // Dense water deposits suitable for extraction
      nodeID: "water-uuid",
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

- Initiate structured playtesting sessions to discern usability, performance bottlenecks, and emergent gameplay patterns. Playtests might include tasks such as terraforming a single chunk to a sustainable level or fully depleting a metallic deposit.
- Document areas requiring optimization, categorize issues by severity, and integrate solutions iteratively. This may involve rebalancing resource spawn rates, refining UI feedback loops, or streamlining data synchronization procedures.

### 📈 Milestone Objectives

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

### `stores/inventoryStore.ts`

While currently used for level-related data, these can serve as references or a starting point for:

- **Inventory State** storing items, resources, and crafting materials
- **Action & Mutation Logic** for adding/removing items, partial updates, and UI reactivity

### `stores/appStore.ts`

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

### `services/CrosshairService.ts`

Manages where the player is looking where other classes can hook into the UI and provide actions for the user to perform based on where they are looking given class defined conditions.

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

---

**Summary:**

1. The **terrain** subfolder is key for chunk generation, data structures, and real-time updates.
2. **Vuex store** modules and the main store are prime integration points for new inventory/hotbar logic.
3. **Player** and **mechanics** files offer natural injection points for tool usage and resource collection systems.
4. The **scene** and **Babylon.js** integration files govern rendering, crosshair interaction, and real-time shading.
5. Relevant UI files in `views/gui` can be extended or referenced for the new inventory and resource panels.

By focusing on these areas, you can implement Phase 1’s core objectives—inventory/hotbar systems, terraforming tools, resource gathering, and persistent terrain data—while making efficient use of the existing file structure.

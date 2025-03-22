### 🚀 Mars Terraforming Sim V2 - Project Overview 🌌

---

## 🌠 Project Vision

We're building an immersive Mars exploration and terraforming simulation that blends RPG, survival, and sandbox elements to offer a comprehensive, interactive experience. Inspired by acclaimed games like **Surviving Mars**, **Subnautica**, and **No Man's Sky**, our vision is to place players into a dynamic, believable near-future scenario centered around realistic and detailed terraforming and colonization of Mars. Players will be challenged to transform an inhospitable Martian surface into a thriving, self-sustaining ecosystem, making strategic decisions to balance survival, exploration, and environmental transformation.

---

## 🎯 High-Level Goals

- **Mars Exploration:** Navigate an expansive, detailed Martian landscape dynamically generated and rendered using Babylon.js, offering diverse geographical features and interactive terrain.
- **Realistic Terraforming:** Implement scientifically-informed soil treatment mechanics, requiring careful management of nitrates, nutrients, fungi cultivation, and plant growth progression.
- **Resource Collection & Management:** Harvest and utilize essential raw materials including Metal, Silicon, Carbon, Oxygen, H2O, and Hydrogen, to craft tools, equipment, structures, and vehicles essential for survival and colonization.
- **Comprehensive Base-Building:** Construct and manage essential structures like greenhouses, domes, habitats, and infrastructure with an emphasis on modularity, customization, and expansion, centered around the Starship as a versatile home-base.
- **Detailed Player Progression:** Develop a robust RPG system featuring inventory management, customizable gear, and progression mechanics designed to encourage exploration, resourcefulness, and strategic gameplay.

---

## 🌱 Gameplay Mechanics & Features

### Exploration & Travel

- Dynamic terrain interaction using vertex-based terraforming mechanics, where each player's action directly alters the Martian landscape.
- Accessible player-controlled teleportation through an intuitive Mars globe UI, allowing exploration of diverse regions.
- Utilize a fully functional Starship as an initial home-base, inventory management hub, and primary means of long-distance travel across Mars, which requires strategic fuel management and resource collection.

### Terraforming & Agriculture

- Progressive, realistic soil enhancement mechanics:
  - **Regolith Treatment:** Carefully apply nitrates and nutrients while managing phosphorous removal to prepare the soil.
  - **Fungal Fertilization:** Introduce beneficial fungi to enrich and stabilize the soil ecosystem.
  - **Dynamic Plant Progression:** Cultivate an evolving range of vegetation types, progressing through stages—moss, grass, flowers, bushes, and finally, sustainable tree growth.

### RPG Elements

- **Advanced Inventory System:** Manage detailed inventories of raw materials, crafted items, harvested plants, and personal gear.
- **Interactive Hotbar & Specialized Tools:** Quick-access system designed for efficient handling of essential terraforming, resource gathering, and survival tools.
- **Equipment Customization:** Equip and upgrade specialized gear to enhance player capabilities, ensuring survival and success in harsh Martian conditions.

### Base Management

- Comprehensive Starship functionality including extensive inventory storage, autonomous fuel generation using Moxie units and solar arrays, and comfortable living quarters.
- Build and maintain controlled agricultural environments through greenhouses and protective domes, optimizing food production and sustainability.
- Modular construction system allowing players to expand and upgrade habitats, research facilities, and resource processing centers.

---

## 🛠️ Technical Structure & Organization

### Core Modules

- **Player Mechanics:** Comprehensive player controls, intuitive movement systems, robust inventory management, and interactive terrain manipulation.
- **Terrain Management:** Dynamic, realistic terrain generation combined with detailed vertex-based state tracking to reflect player-driven terraforming.
- **Persistent Game State:** Efficient save/load system leveraging IndexedDB to reliably track and persist player progress, environmental changes, and terraforming milestones.
- **Detailed Inventory & Crafting System:** Flexible crafting mechanics allowing creative resource combination, tool-making, and item customization.
- **Innovative Building System:** Modular structure deployment with intuitive in-game physics interactions, supporting complex base-building and environmental manipulation.

### Project Structure Highlights

- Utilization of Babylon.js for high-quality 3D rendering, interactive gameplay, and dynamic visual effects.
- Integration of Vue.js for creating responsive, intuitive graphical interfaces including inventory systems, menus, and interactive UI elements.
- IndexedDB as a robust, browser-based storage solution ensuring persistent tracking of detailed terraforming data and player progression.

---

## 🗒️ Plan of Action

### 🚧 Phase 1: Core Gameplay Loop

- Design and implement essential player inventory systems, hotbar functionalities, and initial interaction tools.
- Develop basic terraforming interactions with immediate environmental feedback.
- Implement foundational terrain state-saving and loading systems using IndexedDB.

### 🧬 Phase 2: Advanced Terraforming Mechanics

- Expand detailed nutrient management mechanics, enhancing soil health realism.
- Incrementally introduce plant life with realistic growth dynamics from fungi through full tree ecosystems.
- Enhance visualization and feedback on terraforming progress through dynamic shader-based terrain textures and environmental effects.

### 🏗️ Phase 3: Base-Building & Resource Management

- Establish comprehensive resource gathering mechanics with advanced crafting capabilities.
- Integrate Starship home-base functionality, emphasizing fuel production and inventory logistics.
- Construct detailed, modular habitats including advanced greenhouses and protective domes.

### 🚀 Phase 4: Extended Gameplay & Polish

- Refine and expand RPG progression systems, equipment customization options, and enhance gameplay depth.
- Optimize game performance, improve visual fidelity, and polish user experience across interfaces.
- Engage with player communities to gather valuable feedback, iteratively refining gameplay mechanics, balance, and overall player satisfaction.

---

Together, we’re crafting a thrilling, engaging Martian adventure—meticulously transforming barren Martian landscapes into thriving, sustainable ecosystems, step by careful step. 🌿✨🌌

---

## **Key Features**

### **Collisions**

- Player collision system. Any level of complexity for collisions can be implemented.
- Camera collision system with collision objects.

### **Interactive Elements**

- A door that opens when the player approaches.
- A jump pad that propels the character.

---

### **Character Movement**

- Features implemented:

  - Jumping.
  - Speed boosts (upon collecting power-ups).
  - Running.
  - Walking.
  - Idle state animations.

- **Camera**: smooth zooming in and out when the player accelerates.

---

### **Dynamic Lighting**

- Overcomes limitations on the number of light sources with dynamic position changes:
  - Lights activate when the player approaches.
  - Lights deactivate when the player moves away.

---

### **Particle Effects**

- Particles appear:
  - When collecting power-ups.
  - Upon character landing.

---

### **Sound Design**

- **Action Sounds**:
  - Character footsteps.
  - Door opening and closing.
- **Background Audio**:
  - Atmospheric music.
  - Environmental sound effects.

---

### **Blender Integration**

- Uses the official plugin for exporting scenes from Blender to Babylon.js.
- Blender scene source files are included in the project.

---

### **Additional Technical Features**

- **LOD (Levels of Detail)**: model optimization based on player distance.
- **Prefabs**: convenient creation and management of repeating scene elements.

### **Custom Container Manager**

- Ensures that called containers (GLTF) load only once, with subsequent requests creating instances from the original.

---

### **Multiplayer**

- Basic multiplayer implemented with the **ColiseusJS** library:
  - Key press data transmission and player position synchronization.
  - Ability to create rooms with passwords for private sessions.
- Suitable as a foundation for developing more complex server systems.
- Currently operates without validation and fully trusts clients. Use with caution!

[Server Repository](https://github.com/wdda/lola-server)

---

### **Interface**

- **Vue.js** is used for creating in-game and menu interfaces.
- Support for mobile device controls via a virtual joystick (**Nipple.js**).

---

### **Additional Features**

- Easy level addition with a configuration file for levels and their names.
- Environment settings configurable via a file.

---

## **In-Game Store**

- **Game state management** is implemented using an in-game store.
- **Event subscription**:
  - Ability to subscribe to in-game events (e.g., level completion, power-up collection).
  - Designed for flexible game process management.

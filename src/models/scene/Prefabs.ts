import {
  AbstractMesh,
  InstantiatedEntries,
  Mesh,
  Scene,
  SceneLoader,
  AssetContainer,
} from '@babylonjs/core';
import ContainerManager from '@/models/scene/ContainerManager'; // Keep if ContainerManager is still used elsewhere

export interface PrefabItem {
  id: number;
  container: InstantiatedEntries;
}

// Static class approach
export default class Prefabs {
  private static scene: Scene;
  private static loadedContainers: Map<string, AssetContainer> = new Map();
  private static originalPrefabs: Map<string, AbstractMesh> = new Map(); // Store original meshes marked as 'prefab'

  // Keep the constructor for potential legacy use or direct instantiation needs,
  // but primary functionality will be static.
  // Declaring instance properties that might not be used if only static methods are called.
  private scene: Scene; // Instance scene
  private prefabs: AbstractMesh[]; // Instance prefabs list

  constructor(callback: any) {
    // This constructor might be called if legacy code uses `new Prefabs(...)`
    // It should likely align with the static initialization or be removed.
    console.warn(
      'Prefabs constructor called - consider using static Prefabs.initialize() instead.'
    );
    this.scene = globalThis.scene; // Assign to instance property
    Prefabs.scene = globalThis.scene; // Also assign to static property for safety
    this.prefabs = [];

    // These calls might be redundant if initialize() is called separately
    this.setPrefabs(); // Calls instance method which calls static method

    // --- DISABLE THIS CALL ---
    // this.setItems().then(() => {
    //   // Calls instance method
    //   if (callback) callback();
    // });
    // --- END DISABLE ---
    // --- ADD IMMEDIATE CALLBACK INSTEAD ---
    if (callback) {
      // Use Promise.resolve().then() to ensure callback runs after current microtasks
      Promise.resolve().then(callback);
    }
    // --- END ADD ---
  }

  // Static initialization method - Preferred way to set up
  public static initialize(scene: Scene) {
    Prefabs.scene = scene;
    Prefabs.findAndDisableOriginalPrefabs();
  }

  // Find original meshes tagged 'prefab' and disable them
  private static findAndDisableOriginalPrefabs() {
    if (!Prefabs.scene) {
      console.warn('Prefabs static scene not set during findAndDisableOriginalPrefabs.');
      return;
    }
    const meshes = Prefabs.scene.getMeshesByTags('prefab');
    console.log(`Found ${meshes.length} original prefab meshes.`);
    meshes.forEach((mesh) => {
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      Prefabs.originalPrefabs.set(mesh.name, mesh); // Store them if needed later
    });
  }

  // Legacy instance method - adapt if needed, or remove if fully static
  private setPrefabs() {
    // This instance method now calls the static method.
    // Ensure this.scene is set before calling if used via constructor.
    if (!this.scene) this.scene = globalThis.scene; // Fallback
    Prefabs.scene = this.scene; // Ensure static scene is also set
    Prefabs.findAndDisableOriginalPrefabs(); // Call static method
    // Populate instance prefabs list if needed by instance methods like setItems
    this.prefabs = Array.from(Prefabs.originalPrefabs.values());
  }

  // Legacy instance method - adapt if needed, or remove if fully static
  private async setItems() {
    // This method uses the instance `this.prefabs` list populated by `setPrefabs`
    let id = 0;

    // Use the instance prefabs list
    for (const prefab of this.prefabs) {
      // Assuming prefab name corresponds to the file name structure
      const nameModel = `${prefab.name}.gltf`; // Adjust logic if name doesn't match file
      // Construct path - Ensure VUE_APP_RESOURCES_PATH ends with '/' if needed
      const path = `${import.meta.env.VUE_APP_RESOURCES_PATH || 'resources/'}graphics/prefabs/${nameModel}`;

      try {
        // Use the static loader method
        const container = await Prefabs.loadAssetContainer(path);

        if (!container) {
          console.error(`Error loading container ${nameModel} via static method.`);
          continue;
        }

        // Instantiate into the scene, parented to the original disabled prefab mesh
        const instance = container.instantiateModelsToScene(
          (name) => `instance_${prefab.name}_${id}_${name}`,
          false,
          { doNotInstantiate: false }
        );
        const rootNode = instance?.rootNodes?.[0] as Mesh;

        if (rootNode) {
          rootNode.parent = prefab; // Parent the instance root to the original disabled mesh
          rootNode.setEnabled(true); // Ensure the instance is enabled

          const meshes = rootNode.getChildMeshes(true).concat(rootNode.geometry ? [rootNode] : []); // Include root if it has geometry
          globalThis.collisions?.appendCollisionByMeshes(meshes); // Add instance meshes to collision

          prefab.id = 'prefab_' + id; // Assign ID to the original prefab mesh? Or the instance? Check usage.

          const loopAnimation = container.animationGroups.find((group) => group.name === 'start');
          if (loopAnimation) {
            // Target the animation group on the *instance* if animations were cloned/retargeted
            const instanceAnimationGroup = instance.animationGroups.find(
              (ag) => ag.name === 'start'
            );
            instanceAnimationGroup?.play(true);
          }
        } else {
          console.error(`Failed to instantiate root node for ${nameModel}`);
        }

        id++;
      } catch (error) {
        console.error(`Error processing prefab ${nameModel}:`, error);
      }
    }
  }

  // Static method to load (or get cached) asset container
  public static async loadAssetContainer(path: string): Promise<AssetContainer | null> {
    if (!Prefabs.scene) {
      console.error('Prefabs service not initialized with a scene.');
      return null;
    }
    // Normalize path separators just in case
    const normalizedPath = path.replace(/\\/g, '/'); // Keep the leading slash if present, don't remove /resources/

    if (Prefabs.loadedContainers.has(normalizedPath)) {
      console.log(`[CACHE DISABLED] Returning cached AssetContainer for: ${normalizedPath}`);
      return Prefabs.loadedContainers.get(normalizedPath)!;
    }

    try {
      // Extract filename and directory path
      const lastSlashIndex = normalizedPath.lastIndexOf('/');
      // Ensure rootUrl ends with a slash. If path starts with '/', keep it.
      const rootUrl = normalizedPath.substring(0, lastSlashIndex + 1);
      const sceneFilename = normalizedPath.substring(lastSlashIndex + 1);

      const container = await SceneLoader.LoadAssetContainerAsync(
        rootUrl, // Use the extracted directory path
        sceneFilename, // Use the extracted filename
        Prefabs.scene
      );

      // --- ADD IMMEDIATE CONTAINER INSPECTION LOG ---
      if (container) {
        console.log(
          `[Prefabs Load] Container loaded for ${sceneFilename}. Inspecting immediately:`
        );
        console.log(`  - Root Nodes (${container.rootNodes.length}):`);
        container.rootNodes.forEach((node, index) => {
          console.log(
            `    Root Node ${index}: ${node.name} (Type: ${node.constructor.name}, ID: ${node.uniqueId})`
          );
          const descendants = node.getDescendants(true);
          console.log(
            `      - Descendants (${descendants.length}): [${descendants.map((d) => `${d.name} (${d.constructor.name})`).join(', ')}]`
          );
          if (node instanceof Mesh) {
            console.log(`      - Geometry:`, node.geometry);
            console.log(`      - hasVertices: ${node.getTotalVertices() > 0}`);
          }
        });
        console.log(`  - Meshes in Container (${container.meshes.length}):`);
        container.meshes.forEach((mesh, index) => {
          console.log(
            `    Mesh ${index}: ${mesh.name} (Type: ${mesh.constructor.name}, ID: ${mesh.uniqueId}, Parent: ${mesh.parent?.name || 'null'})`
          );
          console.log(`      - Geometry:`, mesh.geometry);
          console.log(`      - hasVertices: ${mesh.getTotalVertices() > 0}`);
        });
      } else {
        console.error(
          `[Prefabs Load] SceneLoader.LoadAssetContainerAsync returned null or undefined for ${sceneFilename}`
        );
      }
      // --- END IMMEDIATE CONTAINER INSPECTION LOG ---

      // --- Existing Caching Logic ---
      Prefabs.loadedContainers.set(normalizedPath, container);

      // Keep assets in memory - manage disposal if needed later
      // container.addAllToScene(); // Don't add automatically, we instantiate manually
      return container;
    } catch (error) {
      console.error(`Failed to load AssetContainer: ${normalizedPath}`, error);
      return null;
    }
  }

  // Static method to dispose all cached containers
  public static disposeAll() {
    Prefabs.loadedContainers.forEach((container) => container.dispose());
    Prefabs.loadedContainers.clear();
    Prefabs.originalPrefabs.clear(); // Clear original prefab references too
    console.log('Disposed all cached AssetContainers and prefab references.');
  }
}

// --- Add HMR hook for Prefabs ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Dispose triggered for Prefabs.ts');
    Prefabs.disposeAll(); // Dispose containers on HMR
  });
}

import {
  Vector3,
  Scene,
  Mesh,
  StandardMaterial,
  Color3,
  VertexData,
  Texture,
  PhysicsImpostor,
  CannonJSPlugin,
  SceneLoader,
  PBRMaterial,
  Observable,
  CreatePolyhedronVertexData,
} from '@babylonjs/core';
import { ResourceNode } from '@/stores/terrainStore';
import { Spawner } from '../Spawner';
import alea from 'alea';
import { Iron } from '@/models/inventory/items/resources/Iron';
import { useInventoryStore } from '@/stores/inventoryStore';

/**
 * IronSpawner handles the spawning and management of iron resource nodes
 */
export class IronSpawner extends Spawner {
  private textureUrl = '/resources/graphics/textures/resources/iron.jpg';
  protected inventoryStore = useInventoryStore();
  private modelLoaded = false;
  private meshesAwaitingPhysics: Array<{ mesh: Mesh; isLoose: boolean }> = [];
  private physicsCheckInterval: number | null = null;

  constructor(scene: Scene) {
    super(scene);
    this.prefabPath = '/resources/graphics/prefabs/resources/iron.glb'; // Path to iron ore model

    // Immediate model loading
    this.loadPrefabModel()
      .then(() => {
        this.modelLoaded = true;
        console.log('Iron prefab model loaded successfully, ready for spawning');
      })
      .catch((err) => {
        console.error('Failed to load iron prefab:', err);
      });

    // Start checking for physics engine - we'll apply physics once it's available
    this.startPhysicsCheck();

    // Also listen for scene ready event to ensure we apply physics once everything is loaded
    this.scene.onReadyObservable.addOnce(() => {
      console.log('Scene ready, checking for physics engine availability');
      this.applyDeferredPhysics();
    });
  }

  /**
   * Start an interval to check for physics engine initialization
   */
  private startPhysicsCheck() {
    // Clear any existing interval
    if (this.physicsCheckInterval !== null) {
      window.clearInterval(this.physicsCheckInterval);
    }

    // Check every second for physics engine
    this.physicsCheckInterval = window.setInterval(() => {
      if (this.scene.getPhysicsEngine()) {
        console.log('Physics engine detected, applying deferred physics to iron meshes');
        this.applyDeferredPhysics();

        // Clear the interval once physics is available
        if (this.physicsCheckInterval !== null) {
          window.clearInterval(this.physicsCheckInterval);
          this.physicsCheckInterval = null;
        }
      }
    }, 1000);
  }

  /**
   * Apply physics to all meshes that were created before physics was available
   */
  private applyDeferredPhysics() {
    if (!this.scene.getPhysicsEngine()) {
      console.log('Physics still not available, keeping meshes in queue');
      return;
    }

    console.log(`Applying deferred physics to ${this.meshesAwaitingPhysics.length} iron meshes`);

    this.meshesAwaitingPhysics.forEach((item) => {
      try {
        if (item.isLoose) {
          // For loose iron pieces - full physics with mass
          item.mesh.physicsImpostor = new PhysicsImpostor(
            item.mesh,
            PhysicsImpostor.ConvexHullImpostor,
            { mass: 1, friction: 0.5, restitution: 0.3 },
            this.scene
          );
        } else {
          // For fixed deposits - static physics for collision only
          item.mesh.physicsImpostor = new PhysicsImpostor(
            item.mesh,
            PhysicsImpostor.MeshImpostor,
            { mass: 0, friction: 0.8, restitution: 0.1 },
            this.scene
          );
        }
        console.log(`Successfully applied physics to iron mesh ${item.mesh.name}`);
      } catch (err) {
        console.error(`Failed to apply physics to mesh ${item.mesh.name}:`, err);
      }
    });

    // Clear the array after applying physics
    this.meshesAwaitingPhysics = [];
  }

  getResourceType() {
    return 'iron';
  }

  calculateProbability(chunkX: number, chunkY: number, noiseValue: number): number {
    // Base 50% chance, up to 40% based on noise value
    return 0.5 + noiseValue * 0.7;
  }

  getMinimumCount(): number {
    return 1; // At least 1 iron deposit per chunk
  }

  getMaximumCount(): number {
    return 5; // Maximum 5 iron deposits per chunk
  }

  /**
   * Create a single iron resource node
   */
  protected createResourceNode(
    chunkX: number,
    chunkY: number,
    index: number,
    width: number,
    height: number,
    seed: string,
    noise3D: (x: number, y: number, z: number) => number
  ): ResourceNode {
    const rng = alea(`${seed}_${this.getResourceType()}_${index}`);

    // Position within chunk - ensure edge padding
    const padding = 10; // Keep resources away from chunk edges
    const posX = padding + rng() * (width - padding * 2);
    const posY = padding + rng() * (height - padding * 2);

    // Use noise for height and other properties
    // const noiseVal =
    //   noise3D(chunkX + posX / width, chunkY + posY / height, index * 0.1) * 0.5 + 0.5;

    // Iron deposits rise above the terrain
    const posZ = 5; // 2-20 units above ground

    // Determine quantity and whether it's a loose piece
    const quantity =
      rng() < 0.8
        ? 1 // 80% chance for loose pieces
        : 30 + Math.floor(rng() * 90); // 30-120 for deposits

    const loose = quantity === 1;

    // Create node ID
    const nodeId = `${this.getResourceType()}_${chunkX}_${chunkY}_${index}`;

    // Create and return the resource node
    return {
      nodeId,
      type: this.getResourceType(),
      quantity,
      x: posX,
      y: posY,
      z: posZ,
      mined: false,
      loose,
    };
  }

  /**
   * Creates a procedurally generated iron mesh with approximately 1000 vertices
   * @param name Name of the mesh
   * @param size Base size of the mesh
   * @param seed Seed for randomization
   */
  private createProceduralIronMesh(name: string, size: number, seed: string): Mesh {
    const mesh = new Mesh(name, this.scene);
    const rng = alea(seed);

    // Create a polyhedron as a starting point (~1000 vertices)
    const baseData = CreatePolyhedronVertexData({
      type: 3, // Icosahedron
      size: size,
      sizeX: size * (0.8 + rng() * 0.4),
      sizeY: size * (0.8 + rng() * 0.4),
      sizeZ: size * (0.8 + rng() * 0.4),
    });

    // Deform vertices with noise to create a rocky appearance
    const positions = baseData.positions;
    if (positions) {
      for (let i = 0; i < positions.length; i += 3) {
        const vertex = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const vertexDir = vertex.normalize();

        // Apply more consistent noise
        const noiseValue =
          0.2 *
          size *
          (Math.sin(vertex.x * 5 + seed.charCodeAt(0)) +
            Math.cos(vertex.y * 5 + seed.charCodeAt(1)) +
            Math.sin(vertex.z * 5 + seed.charCodeAt(2)));

        positions[i] += vertexDir.x * noiseValue;
        positions[i + 1] += vertexDir.y * noiseValue;
        positions[i + 2] += vertexDir.z * noiseValue;
      }
    }

    // Recalculate normals for proper lighting and smooth shading
    VertexData.ComputeNormals(positions, baseData.indices, baseData.normals);

    // Apply the modified vertex data to our mesh
    baseData.applyToMesh(mesh);

    return mesh;
  }

  async preloadAssets(): Promise<void> {
    // Make sure to preload the model for loose pieces
    if (this.prefabPath && !this.modelLoaded) {
      try {
        console.log(`Preloading iron model from: ${this.prefabPath}`);
        await this.loadPrefabModel();
        this.modelLoaded = true;
      } catch (error) {
        console.error(`Failed to preload iron model: ${error}`);
      }
    }
  }

  /**
   * Loads the iron prefab model
   */
  private async loadPrefabModel(): Promise<void> {
    if (!this.prefabPath) return;

    try {
      // Parse the prefab path into root and filename parts for SceneLoader
      const pathParts = this.prefabPath.split('/');
      const filename = pathParts.pop() || '';
      const rootUrl = pathParts.join('/') + '/';

      console.log(`Loading model from rootUrl: ${rootUrl}, filename: ${filename}`);

      const result = await SceneLoader.ImportMeshAsync('', rootUrl, filename, this.scene);
      if (result.meshes && result.meshes.length > 0) {
        // Get the root mesh and cast it to Mesh type
        const rootMesh = result.meshes[0];

        // Find the actual mesh we want to use (often in a hierarchy)
        let targetMesh = null;

        // Look through all meshes to find one with geometry (not just a transform node)
        for (const mesh of result.meshes) {
          if (mesh.getTotalVertices() > 0) {
            targetMesh = mesh;
            break;
          }
        }

        this.preloadedModel = (targetMesh || rootMesh) as Mesh;

        // Make sure it exists before calling methods on it
        if (this.preloadedModel) {
          this.preloadedModel.setEnabled(false); // Hide the original model
          console.log(
            `Successfully loaded iron prefab from ${this.prefabPath} with ${this.preloadedModel.getTotalVertices()} vertices`
          );
        }
      } else {
        console.warn(`Loaded iron prefab but no meshes found`);
      }
    } catch (error) {
      console.error(`Error loading iron prefab model: ${error}`);
    }
  }

  async spawn(node: ResourceNode, position: Vector3): Promise<Mesh | null> {
    try {
      let mesh: Mesh;

      // Create or clone the mesh based on whether it's loose or not
      if (node.loose) {
        if (this.preloadedModel) {
          // Use the prefab model for loose pieces
          console.log(`Creating loose iron using prefab model from ${this.prefabPath}`);
          mesh = this.preloadedModel.clone(`resource_${node.nodeId}`) as Mesh;
          mesh.scaling.setAll(0.3); // Small scale for loose pieces
          mesh.setEnabled(true); // Make sure it's visible
        } else {
          console.warn(`No preloaded model available for loose iron, using fallback`);
          // Fallback to procedural if prefab isn't available
          const size = 0.3;
          mesh = this.createProceduralIronMesh(`resource_${node.nodeId}`, size, node.nodeId);

          // Apply material for the fallback
          const material = new PBRMaterial(`iron_material_${node.nodeId}`, this.scene);
          material.albedoColor = new Color3(0.6, 0.3, 0.3);
          material.metallic = 0.7;
          material.roughness = 0.3;
          material.useRoughnessFromMetallicTextureAlpha = false;
          mesh.material = material;
        }
      } else {
        // Create procedural mesh for deposits
        const size = 0.5 + (node.quantity / 120) * 1.5;
        mesh = this.createProceduralIronMesh(`resource_${node.nodeId}`, size, node.nodeId);

        // Create and apply PBR material with texture for better appearance
        const material = new PBRMaterial(`iron_material_${node.nodeId}`, this.scene);

        // Apply texture for deposits
        const texture = new Texture(this.textureUrl, this.scene);
        texture.uScale = 2;
        texture.vScale = 2;
        material.albedoTexture = texture;
        material.bumpTexture = texture; // Use same texture for bump to add detail
        material.bumpTexture.level = 0.4; // Adjust bump intensity
        material.useRoughnessFromMetallicTextureAlpha = false;
        material.metallic = 0.7; // More metallic appearance
        material.roughness = 0.3; // Less rough for shininess
        material.subSurface.isRefractionEnabled = true;
        material.subSurface.refractionIntensity = 0.1;

        mesh.material = material;
      }

      // Increase position Y to avoid clipping with terrain
      const terrainHeight = position.y;
      const offset = node.loose ? 0.5 : 1; // Adjust based on loose or deposit
      position.y = terrainHeight + offset;
      mesh.position = position;

      // Add random rotation for variety
      const rng = alea(node.nodeId);
      mesh.rotation.x = rng() * Math.PI * 2;
      mesh.rotation.y = rng() * Math.PI * 2;
      mesh.rotation.z = rng() * Math.PI * 2;

      // Check if physics is enabled before creating physics impostor
      if (!this.scene.getPhysicsEngine()) {
        console.log(
          `Physics not yet available, queueing physics for iron mesh resource_${node.nodeId}`
        );
        // Queue the mesh for physics to be applied later
        this.meshesAwaitingPhysics.push({
          mesh: mesh,
          isLoose: node.loose,
        });
      } else {
        try {
          // Add physics impostor based on type
          if (node.loose) {
            // For loose iron pieces - full physics with mass
            mesh.physicsImpostor = new PhysicsImpostor(
              mesh,
              PhysicsImpostor.ConvexHullImpostor,
              { mass: 1, friction: 0.5, restitution: 0.3 },
              this.scene
            );
          } else {
            // For fixed deposits - static physics for collision only
            mesh.physicsImpostor = new PhysicsImpostor(
              mesh,
              PhysicsImpostor.MeshImpostor,
              { mass: 0, friction: 0.8, restitution: 0.1 },
              this.scene
            );
          }
        } catch (err) {
          console.error('Failed to create physics impostor:', err);
        }
      }

      // Set interaction metadata
      mesh.metadata = {
        isResource: true,
        resourceId: node.nodeId,
        resourceType: this.getResourceType(),
        chunkId: node.nodeId.split('_').slice(1, 3).join('_'),
        isInteractable: true,
        isLoose: node.loose,
      };

      // Cast shadows
      mesh.receiveShadows = true;
      mesh.isPickable = true;

      return mesh;
    } catch (error) {
      console.error(`Error spawning iron node ${node.nodeId}:`, error);
      return null;
    }
  }

  protected async handleResourceInteraction(
    node: ResourceNode,
    playerId: string
  ): Promise<boolean> {
    // Create iron item
    const ironAmount = node.loose ? 1 : 2;
    const iron = new Iron(ironAmount);

    // Add to player inventory
    await this.inventoryStore.addItem(playerId, iron.serialize());

    return true;
  }

  updateMesh(mesh: Mesh, node: ResourceNode): void {
    // Only adjust scale if it's not a loose piece
    if (!node.loose && mesh) {
      const scale = 0.5 + (node.quantity / 120) * 1.5;
      mesh.scaling.setAll(scale);
    }
  }

  // Cleanup resources on dispose
  dispose() {
    if (this.physicsCheckInterval !== null) {
      window.clearInterval(this.physicsCheckInterval);
      this.physicsCheckInterval = null;
    }
  }
}

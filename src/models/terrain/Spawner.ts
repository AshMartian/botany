import { Vector3, Scene, Mesh, SceneLoader, AbstractMesh } from '@babylonjs/core';
import { ResourceNode, VertexProperties, useTerrainStore } from '@/stores/terrainStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import alea from 'alea';

/**
 * Base abstract Spawner class that all specific spawners will extend.
 * Provides common functionality and required method signatures for spawners.
 */
export abstract class Spawner {
  protected scene: Scene;
  protected prefabPath = '';
  protected preloadedModel: Mesh | null = null;
  protected terrainStore = useTerrainStore();
  protected inventoryStore = useInventoryStore();

  constructor(scene: Scene) {
    this.scene = scene;
    this.initialize();
  }

  /**
   * Initialize the spawner and preload any required models
   */
  protected async initialize(): Promise<void> {
    if (this.prefabPath) {
      await this.preloadModel();
    }
  }

  /**
   * Preload the resource model for faster instantiation
   */
  protected async preloadModel(): Promise<void> {
    try {
      if (!this.prefabPath) return;

      const result = await SceneLoader.ImportMeshAsync('', this.prefabPath, '', this.scene);

      if (result.meshes[0]) {
        // Store reference to root mesh
        this.preloadedModel = result.meshes[0] as Mesh;

        // Hide the original model - we'll clone it when needed
        this.preloadedModel.setEnabled(false);

        console.log(`${this.constructor.name} model preloaded successfully`);
      }
    } catch (error) {
      console.warn(`Failed to preload model for ${this.constructor.name}:`, error);
      this.preloadedModel = null;
    }
  }

  /**
   * Returns the resource type that this spawner handles
   */
  abstract getResourceType(): string;

  /**
   * Calculates the probability of this resource spawning in a chunk
   * @param chunkX The X coordinate of the chunk
   * @param chunkY The Y coordinate of the chunk
   * @param noiseValue A noise value (0-1) for this chunk
   * @returns A probability value (0-1)
   */
  abstract calculateProbability(chunkX: number, chunkY: number, noiseValue: number): number;

  /**
   * Returns the minimum number of this resource that should spawn in a chunk
   */
  abstract getMinimumCount(): number;

  /**
   * Returns the maximum number of this resource that should spawn in a chunk
   */
  abstract getMaximumCount(): number;

  /**
   * Create a single resource node with all necessary properties
   * @param chunkX The X coordinate of the chunk
   * @param chunkY The Y coordinate of the chunk
   * @param index Node index within the chunk
   * @param width Chunk width
   * @param height Chunk height
   * @param seed Seed string for consistent generation
   * @param noise3D 3D noise function for additional randomness
   */
  protected abstract createResourceNode(
    chunkX: number,
    chunkY: number,
    index: number,
    width: number,
    height: number,
    seed: string,
    noise3D: (x: number, y: number, z: number) => number
  ): ResourceNode;

  /**
   * Generate all resource nodes for a chunk
   * @param chunkX The X coordinate of the chunk
   * @param chunkY The Y coordinate of the chunk
   * @param width Chunk width
   * @param height Chunk height
   * @param seed Seed string for consistent generation
   * @param noise2D 2D noise function for main resource probability
   * @param noise3D 3D noise function for detailed resource placement
   * @returns Array of resource nodes for the chunk
   */
  public generateResourceNodes(
    chunkX: number,
    chunkY: number,
    width: number,
    height: number,
    seed: string,
    noise2D: (x: number, y: number) => number,
    noise3D: (x: number, y: number, z: number) => number
  ): ResourceNode[] {
    const nodes: ResourceNode[] = [];
    const rng = alea(`${seed}_${this.getResourceType()}`);

    // Get the noise value for this chunk for resource probability
    const noiseValue = (noise2D(chunkX * 0.1, chunkY * 0.1) + 1) * 0.5; // normalize to 0-1

    // Calculate probability for this resource type
    const probability = this.calculateProbability(chunkX, chunkY, noiseValue);

    // Determine if this resource should spawn in this chunk
    if (rng() <= probability) {
      // Determine how many nodes to spawn
      const minCount = this.getMinimumCount();
      const maxCount = this.getMaximumCount();
      const count = minCount + Math.floor(rng() * (maxCount - minCount + 1));

      // Generate each node
      for (let i = 0; i < count; i++) {
        const node = this.createResourceNode(chunkX, chunkY, i, width, height, seed, noise3D);
        nodes.push(node);
      }
    }

    return nodes;
  }

  /**
   * Apply resource effects to terrain vertices (if applicable)
   * @param defaultVertexData Default vertex data for the chunk
   * @param node The resource node
   * @param width Chunk width
   * @param height Chunk height
   */
  public applyResourceEffects(
    defaultVertexData: VertexProperties,
    node: ResourceNode,
    width: number,
    height: number
  ): void {
    // Base implementation does nothing
    // Override in subclasses if resource affects terrain properties
  }

  /**
   * Spawn a resource node at the specified position
   * @param node The resource node data
   * @param position The world position
   * @returns The spawned mesh or null if failed
   */
  abstract spawn(node: ResourceNode, position: Vector3): Promise<Mesh | null>;

  /**
   * Update a resource mesh based on changes to the resource data
   * @param mesh The resource mesh to update
   * @param node The updated resource node data
   */
  updateMesh(mesh: AbstractMesh, node: ResourceNode): void {
    // Default implementation does nothing
    // Override in subclasses if resource mesh needs to be updated
  }

  /**
   * Handle player interaction with a resource node
   * @param nodeId The ID of the resource node
   * @param playerId The ID of the interacting player
   * @param mesh The mesh being interacted with
   * @returns True if interaction was successful
   */
  public async interactWithResource(
    nodeId: string,
    playerId: string,
    mesh: AbstractMesh
  ): Promise<boolean> {
    if (!mesh.metadata) return false;

    const { chunkId } = mesh.metadata;
    const node = await this.terrainStore.getResourceNode(chunkId, nodeId);

    if (!node || node.mined) return false;

    // Handle the interaction based on the resource type
    const success = await this.handleResourceInteraction(node, playerId, mesh);

    if (success) {
      // Update the resource node state
      const remainingQuantity = await this.updateResourceState(node, playerId);

      if (remainingQuantity <= 0) {
        // Resource is fully depleted
        await this.terrainStore.mineResourceNode(chunkId, nodeId);
        this.disposeMesh(mesh);
      } else {
        // Update the mesh to reflect new quantity
        this.updateMesh(mesh, { ...node, quantity: remainingQuantity });
      }

      return true;
    }

    return false;
  }

  /**
   * Handle the actual resource collection logic
   * Override this in resource-specific spawners
   */
  protected abstract handleResourceInteraction(
    node: ResourceNode,
    playerId: string,
    mesh: AbstractMesh
  ): Promise<boolean>;

  /**
   * Update the resource state after an interaction
   * Override this in resource-specific spawners if needed
   */
  protected async updateResourceState(node: ResourceNode, playerId: string): Promise<number> {
    // Default implementation reduces quantity by 1 for loose items, 5 for deposits
    return Math.max(0, node.quantity - (node.loose ? 1 : 5));
  }

  /**
   * Clean up a mesh when it's no longer needed
   */
  protected disposeMesh(mesh: AbstractMesh): void {
    if (mesh) {
      mesh.dispose();
    }
  }

  /**
   * Cleanup resources when disposed
   */
  dispose(): void {
    if (this.preloadedModel) {
      this.preloadedModel.dispose();
      this.preloadedModel = null;
    }
  }
}

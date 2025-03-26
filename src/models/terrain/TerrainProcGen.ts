import { Vector3, Scene, Mesh, AbstractMesh, Ray } from '@babylonjs/core';
import { ResourceNode, useTerrainStore } from '@/stores/terrainStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import WorldManager from './WorldManager';
import * as spawners from './spawners';
import { Spawner } from './Spawner';
import { crosshairService } from '@/services/CrosshairService';

/**
 * TerrainProcGen handles procedural generation of terrain features
 * and spawning of resources in the world.
 */
export default class TerrainProcGen {
  private scene: Scene;
  private resourceMeshes: Map<string, Mesh> = new Map();
  private terrainStore = useTerrainStore();
  private inventoryStore = useInventoryStore();
  private spawnerInstances: Map<string, Spawner> = new Map();
  private static instance: TerrainProcGen | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.initializeSpawners();
    this.registerInteractionHandler();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(scene?: Scene): TerrainProcGen {
    if (!TerrainProcGen.instance && scene) {
      TerrainProcGen.instance = new TerrainProcGen(scene);
    }
    return TerrainProcGen.instance!;
  }

  /**
   * Initialize all resource spawners
   */
  private initializeSpawners(): void {
    // Get all spawner classes (excluding the base Spawner class)
    const validSpawnerClasses = Object.values(spawners);

    // Create instances of each spawner
    for (const SpawnerClass of validSpawnerClasses) {
      try {
        const spawner = new SpawnerClass(this.scene);
        this.spawnerInstances.set(spawner.getResourceType(), spawner);
      } catch (error) {
        console.error(`Error initializing spawner ${SpawnerClass.name}:`, error);
      }
    }

    console.log(`TerrainProcGen: Initialized ${this.spawnerInstances.size} resource spawners`);
  }

  /**
   * Register interaction handler with CrosshairService
   */
  private registerInteractionHandler(): void {
    crosshairService.registerInteractionHandler({
      canInteract: (hit) => {
        return hit.pickedMesh?.metadata?.isResource === true;
      },
      getInteractionText: (hit) => {
        const mesh = hit.pickedMesh;
        if (!mesh?.metadata) return ['', ''];

        const { resourceType, isLoose } = mesh.metadata;
        const verb = isLoose ? 'Collect' : 'Mine';
        return [`[F] ${verb} ${resourceType}`, 'F'];
      },
      onInteract: (hit) => {
        const mesh = hit.pickedMesh;
        if (!mesh?.metadata?.resourceId) return;

        const { resourceId, resourceType } = mesh.metadata;
        const spawner = this.spawnerInstances.get(resourceType);

        if (spawner) {
          // Use the spawner's interaction handler
          spawner.interactWithResource(resourceId, 'player', mesh);
        }
      },
    });
  }

  /**
   * Process a terrain chunk - check if it exists in the store,
   * if not, generate new data and save it.
   */
  public async processChunk(x: number, y: number): Promise<void> {
    try {
      // Get or create chunk data using the terrainStore
      const chunkData = await this.terrainStore.getOrCreateChunk(x, y);

      // After ensuring chunk data exists, spawn any unmined resources for this chunk
      await this.spawnResourceNodes(chunkData.resourceNodes, x, y);
    } catch (error) {
      console.error(`Failed to process chunk ${x},${y}:`, error);
    }
  }

  /**
   * Spawn resource meshes for a chunk's resource nodes
   */
  private async spawnResourceNodes(
    nodes: ResourceNode[],
    chunkX: number,
    chunkY: number
  ): Promise<void> {
    // Filter for unmined nodes only
    const unminedNodes = nodes.filter((node) => !node.mined);

    for (const node of unminedNodes) {
      // Skip if already spawned
      if (this.resourceMeshes.has(node.nodeId)) continue;

      // Calculate global position
      const globalPos = new Vector3(
        chunkX * 128 + node.x, // X position within chunk
        node.z, // Z is height
        chunkY * 128 + node.y // Y position within chunk
      );

      // Convert to engine coordinates
      const enginePos = WorldManager.toEngine(globalPos);

      try {
        await this.spawnResourceNode(node, enginePos);
      } catch (error) {
        console.error(`Failed to spawn resource node ${node.nodeId}:`, error);
      }
    }
  }

  /**
   * Spawn a single resource node in the world
   */
  private async spawnResourceNode(node: ResourceNode, position: Vector3): Promise<void> {
    // Get the appropriate spawner for this resource type
    const spawner = this.spawnerInstances.get(node.type);

    if (!spawner) {
      console.error(`No spawner found for resource type: ${node.type}`);
      return;
    }

    try {
      // First, perform raycast to find terrain height
      const rayStart = position.clone();
      rayStart.y = 1000; // Start from high up
      const ray = new Ray(rayStart, Vector3.Down(), 2000); // Ray length of 2000 units

      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return mesh.name.includes('terrain_chunk');
      });

      if (!hit?.pickedPoint) {
        console.warn(`No terrain found for resource at position ${position.toString()}`);
        return;
      }

      // Calculate the final position based on resource type
      const finalPosition = hit.pickedPoint.clone();

      // Use the spawner to create the resource mesh at the correct height
      const mesh = await spawner.spawn(node, finalPosition);

      if (mesh) {
        // Store reference to the mesh
        this.resourceMeshes.set(node.nodeId, mesh);
      }
    } catch (error) {
      console.error(`Error spawning resource node: ${error}`);
    }
  }

  /**
   * Handle interaction with a resource node
   */
  public async interactWithNode(
    nodeId: string,
    playerId: string,
    mesh: AbstractMesh
  ): Promise<boolean> {
    if (!mesh.metadata) return false;

    const { resourceType } = mesh.metadata;
    const spawner = this.spawnerInstances.get(resourceType);

    if (spawner) {
      // Use the spawner's interaction handler
      return await spawner.interactWithResource(nodeId, playerId, mesh);
    }

    return false;
  }

  /**
   * Get a spawner instance by resource type
   */
  public getSpawner(resourceType: string): Spawner | undefined {
    return this.spawnerInstances.get(resourceType);
  }

  /**
   * Dispose of a resource mesh
   */
  private disposeMesh(nodeId: string): void {
    const mesh = this.resourceMeshes.get(nodeId);
    if (mesh) {
      // Check for particle systems to dispose
      if (mesh.metadata?.particleSystem) {
        mesh.metadata.particleSystem.dispose();
      }

      // Find and dispose parent container if it exists
      if (mesh.parent && mesh.parent.name.includes('container')) {
        mesh.parent.dispose();
      }

      mesh.dispose();
      this.resourceMeshes.delete(nodeId);
    }
  }

  /**
   * Clean up resources for a chunk when it's unloaded
   */
  public cleanupChunk(chunkX: number, chunkY: number): void {
    const chunkId = `${chunkX}_${chunkY}`;

    // Find all resource meshes for this chunk
    for (const [nodeId, mesh] of this.resourceMeshes.entries()) {
      if (mesh.metadata?.chunkId === chunkId) {
        // Check for particle systems to dispose
        if (mesh.metadata?.particleSystem) {
          mesh.metadata.particleSystem.dispose();
        }

        // Find and dispose parent container if it exists
        if (mesh.parent && mesh.parent.name.includes('container')) {
          mesh.parent.dispose();
        }

        mesh.dispose();
        this.resourceMeshes.delete(nodeId);
      }
    }
  }

  /**
   * Dispose all resources when shutting down
   */
  public dispose(): void {
    // Dispose all spawners
    for (const spawner of this.spawnerInstances.values()) {
      spawner.dispose();
    }
    this.spawnerInstances.clear();

    // Dispose all spawned resources
    for (const mesh of this.resourceMeshes.values()) {
      // Check for particle systems to dispose
      if (mesh.metadata?.particleSystem) {
        mesh.metadata.particleSystem.dispose();
      }

      // Find and dispose parent container if it exists
      if (mesh.parent && mesh.parent.name.includes('container')) {
        mesh.parent.dispose();
      }

      mesh.dispose();
    }
    this.resourceMeshes.clear();
  }
}

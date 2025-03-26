import {
  Vector3,
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  SceneLoader,
} from '@babylonjs/core';
import { ResourceNode } from '@/stores/terrainStore';
import { Spawner } from '../Spawner';
import alea from 'alea';
import { Iron } from '@/models/inventory/items/resources/Iron';

/**
 * IronSpawner handles the spawning and management of iron resource nodes
 */
export class IronSpawner extends Spawner {
  constructor(scene: Scene) {
    super(scene);
    this.prefabPath = '/resources/graphics/prefabs/iron_ore.glb'; // Path to iron ore model
  }

  getResourceType() {
    return 'iron';
  }

  calculateProbability(chunkX: number, chunkY: number, noiseValue: number): number {
    // Base 10% chance, up to 40% based on noise value
    return 0.1 + noiseValue * 0.3;
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
    const noiseVal =
      noise3D(chunkX + posX / width, chunkY + posY / height, index * 0.1) * 0.5 + 0.5;

    // Iron deposits rise above the terrain
    const posZ = 5 + noiseVal * 15; // 5-20 units above ground

    // Determine quantity and whether it's a loose piece
    const quantity =
      rng() < 0.2
        ? 1 // 20% chance for loose pieces
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

  async spawn(node: ResourceNode, position: Vector3): Promise<Mesh | null> {
    try {
      let mesh: Mesh;

      // Create or clone the mesh based on whether it's loose or not
      if (this.preloadedModel && !node.loose) {
        mesh = this.preloadedModel.clone(`resource_${node.nodeId}`) as Mesh;
        const scale = 0.5 + (node.quantity / 120) * 1.5;
        mesh.scaling.setAll(scale);
      } else {
        const size = node.loose ? 0.3 : 0.5 + (node.quantity / 120) * 1.5;
        mesh = MeshBuilder.CreateBox(`resource_${node.nodeId}`, { size: size * 2 }, this.scene);

        const material = new StandardMaterial(`iron_material_${node.nodeId}`, this.scene);
        material.diffuseColor = new Color3(0.6, 0.3, 0.3);
        material.specularColor = new Color3(0.8, 0.6, 0.6);
        mesh.material = material;
      }

      // Increase position Y to avoid clipping with terrain
      const terrainHeight = position.y;
      const offset = node.loose ? 0.5 : 5; // Adjust based on loose or deposit
      position.y = terrainHeight + offset;
      mesh.position = position;

      // Set interaction metadata
      mesh.metadata = {
        isResource: true,
        resourceId: node.nodeId,
        resourceType: this.getResourceType(),
        chunkId: node.nodeId.split('_').slice(1, 3).join('_'),
        isInteractable: true,
        isLoose: node.loose,
      };

      mesh.isPickable = true;

      return mesh;
    } catch (error) {
      console.error(`Error spawning iron node ${node.nodeId}:`, error);
      return null;
    }
  }

  protected async handleResourceInteraction(
    node: ResourceNode,
    playerId: string,
    mesh: Mesh
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
}

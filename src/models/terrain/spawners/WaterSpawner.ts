import {
  Vector3,
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  ParticleSystem,
  Texture,
} from '@babylonjs/core';
import { ResourceNode, VertexProperties } from '@/stores/terrainStore';
import { Spawner } from '../Spawner';
import { Water } from '@/models/inventory/items/resources/Water';
import alea from 'alea';

/**
 * WaterSpawner handles the spawning and management of water resource nodes
 */
export class WaterSpawner extends Spawner {
  private particleSystems: Map<string, ParticleSystem> = new Map();

  constructor(scene: Scene) {
    super(scene);
    // Water doesn't use a prefab model, it uses particles instead
  }

  getResourceType(): string {
    return 'water';
  }

  calculateProbability(chunkX: number, chunkY: number, noiseValue: number): number {
    // Water is more rare, 5% base chance up to 20% based on noise
    return 0.05 + noiseValue * 0.15;
  }

  getMinimumCount(): number {
    return 0; // Not all chunks need water
  }

  getMaximumCount(): number {
    return 2; // Maximum 2 water sources per chunk
  }

  /**
   * Create a single water resource node
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
    const padding = 15; // Larger padding for water sources
    const posX = padding + rng() * (width - padding * 2);
    const posY = padding + rng() * (height - padding * 2);

    // Use noise for height and other properties
    const noiseVal =
      noise3D(chunkX + posX / width, chunkY + posY / height, index * 0.1) * 0.5 + 0.5;

    // Water sources are closer to the ground
    const posZ = -2 + noiseVal * 4; // Water sources are typically in depressions

    // Determine quantity (water is never loose)
    const quantity = 100 + Math.floor(rng() * 400); // 100-500 units of water

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
      loose: false, // Water is never loose
    };
  }

  /**
   * Apply water effects to surrounding terrain vertices
   */
  applyResourceEffects(
    defaultVertexData: VertexProperties,
    node: ResourceNode,
    width: number,
    height: number
  ): void {
    // Water sources increase moisture in surrounding terrain
    const radius = 10; // Affect terrain within 10 units
    const intensity = node.quantity / 500; // More water = stronger effect

    // Update vertex properties within radius
    for (
      let x = Math.max(0, Math.floor(node.x - radius));
      x < Math.min(width, Math.ceil(node.x + radius));
      x++
    ) {
      for (
        let y = Math.max(0, Math.floor(node.y - radius));
        y < Math.min(height, Math.ceil(node.y + radius));
        y++
      ) {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
        if (distance <= radius) {
          const factor = (1 - distance / radius) * intensity;
          defaultVertexData.moisture = Math.min(1, defaultVertexData.moisture + factor * 0.3);
        }
      }
    }
  }

  async spawn(node: ResourceNode, position: Vector3): Promise<Mesh | null> {
    try {
      // Create a small invisible sphere as the base mesh
      const mesh = MeshBuilder.CreateSphere(
        `resource_${node.nodeId}`,
        { diameter: 0.5 },
        this.scene
      );

      // Make the mesh mostly transparent (we'll visualize with particles)
      const material = new StandardMaterial(`water_material_${node.nodeId}`, this.scene);
      material.alpha = 0.1;
      material.diffuseColor = new Color3(0.4, 0.6, 0.9);
      material.emissiveColor = new Color3(0.1, 0.2, 0.3);
      mesh.material = material;

      // Position is now provided by TerrainProcGen with correct height
      mesh.position = position;

      // Create water particles
      const particleSystem = new ParticleSystem(`water_particles_${node.nodeId}`, 2000, this.scene);

      // Texture
      particleSystem.particleTexture = new Texture(
        '/resources/graphics/textures/waterDrop.png',
        this.scene
      );

      // Colors
      particleSystem.color1 = new Color4(0.7, 0.8, 1.0, 1.0);
      particleSystem.color2 = new Color4(0.2, 0.5, 1.0, 1.0);
      particleSystem.colorDead = new Color4(0, 0, 0.2, 0.0);

      // Size and lifetime
      particleSystem.minSize = 0.1;
      particleSystem.maxSize = 0.3;
      particleSystem.minLifeTime = 0.3;
      particleSystem.maxLifeTime = 1.2;

      // Emission
      particleSystem.emitter = mesh;
      particleSystem.emitRate = 100;
      particleSystem.minEmitBox = new Vector3(-0.2, -0.2, -0.2);
      particleSystem.maxEmitBox = new Vector3(0.2, 0.2, 0.2);

      // Gravity and speed
      particleSystem.gravity = new Vector3(0, -9.81, 0);
      particleSystem.direction1 = new Vector3(-0.5, 1, -0.5);
      particleSystem.direction2 = new Vector3(0.5, 1, 0.5);
      particleSystem.minEmitPower = 1;
      particleSystem.maxEmitPower = 2;

      // Start the particle system
      particleSystem.start();
      this.particleSystems.set(node.nodeId, particleSystem);

      // Set interaction metadata
      mesh.metadata = {
        isResource: true,
        resourceId: node.nodeId,
        resourceType: node.type,
        chunkId: node.nodeId.split('_').slice(1, 3).join('_'),
        isInteractable: true,
        isLoose: false,
      };

      mesh.isPickable = true;
      return mesh;
    } catch (error) {
      console.error(`Error spawning water node ${node.nodeId}:`, error);
      return null;
    }
  }

  protected async handleResourceInteraction(
    node: ResourceNode,
    playerId: string,
    mesh: Mesh
  ): Promise<boolean> {
    // Create water item (5-10 units per collection)
    const waterAmount = 5 + Math.floor(Math.random() * 6);
    const water = new Water(waterAmount);

    // Add to player inventory
    await this.inventoryStore.addItem(playerId, water.serialize());

    return true;
  }

  updateMesh(mesh: Mesh, node: ResourceNode): void {
    if (mesh) {
      // Update particle emission rate based on quantity
      const particleSystem = this.scene.getParticleSystemByID(`water_particles_${node.nodeId}`);
      if (particleSystem) {
        particleSystem.emitRate = 20 + node.quantity / 5;
      }
    }
  }

  protected disposeMesh(mesh: Mesh): void {
    if (mesh?.metadata?.resourceId) {
      const particleSystem = this.particleSystems.get(mesh.metadata.resourceId);
      if (particleSystem) {
        particleSystem.dispose();
        this.particleSystems.delete(mesh.metadata.resourceId);
      }
    }
    super.disposeMesh(mesh);
  }

  dispose(): void {
    // Clean up all particle systems
    for (const particleSystem of this.particleSystems.values()) {
      particleSystem.dispose();
    }
    this.particleSystems.clear();
    super.dispose();
  }
}

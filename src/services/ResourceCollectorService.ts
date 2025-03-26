import { Scene, Ray, Vector3 } from '@babylonjs/core';
import { useTerrainStore } from '@/stores/terrainStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import TerrainProcGen from '@/models/terrain/TerrainProcGen';

/**
 * ResourceCollectorService handles interactions between the player
 * and resource nodes in the world.
 */
export class ResourceCollectorService {
  private scene: Scene;
  private terrainStore = useTerrainStore();
  private inventoryStore = useInventoryStore();
  private procGen: TerrainProcGen;
  private interactionDistance = 3; // Maximum distance for resource collection
  private interactionCooldown = false;
  private cooldownTime = 500;
  private playerId: string | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.procGen = TerrainProcGen.getInstance(scene);
  }

  /**
   * Set the current player ID for inventory operations
   */
  public setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  /**
   * Check for resources at the point where the player is looking
   */
  public async checkForResources(origin: Vector3, direction: Vector3): Promise<boolean> {
    if (this.interactionCooldown || !this.playerId) return false;

    // Create a ray from the player's position in the looking direction
    const ray = new Ray(origin, direction, this.interactionDistance);

    // Perform the raycast
    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.isPickable && mesh.metadata?.isResource === true;
    });

    if (hit?.pickedMesh?.metadata) {
      const { resourceId } = hit.pickedMesh.metadata;

      // Start interaction cooldown
      this.interactionCooldown = true;
      setTimeout(() => {
        this.interactionCooldown = false;
      }, this.cooldownTime);

      // Use TerrainProcGen to handle the interaction
      return await this.procGen.interactWithNode(resourceId, this.playerId, hit.pickedMesh);
    }

    return false;
  }

  /**
   * Handle player interaction key press
   */
  public async handleInteraction(position: Vector3, forward: Vector3): Promise<boolean> {
    return await this.checkForResources(position, forward);
  }

  /**
   * Clean up resources when service is no longer needed
   */
  public dispose(): void {
    // No need to dispose spawners as they're managed by TerrainProcGen
  }
}

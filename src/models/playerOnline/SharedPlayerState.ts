import { AbstractMesh, Vector3, Scene as BabylonScene } from '@babylonjs/core';
import WorldManager from '@/models/terrain/WorldManager';

/**
 * Singleton class to centralize player state and position management
 */
export default class SharedPlayerState {
  private static instance: SharedPlayerState;
  private scene: BabylonScene | null = null;
  private lastFoundMesh: AbstractMesh | null = null;
  private lastFoundTimestamp = 0;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SharedPlayerState {
    if (!SharedPlayerState.instance) {
      SharedPlayerState.instance = new SharedPlayerState();
    }
    return SharedPlayerState.instance;
  }

  /**
   * Set the scene reference
   */
  public setScene(scene: BabylonScene): void {
    this.scene = scene;
  }

  /**
   * Find player mesh with caching for performance
   */
  public findPlayerMesh(): AbstractMesh | null {
    if (!this.scene) return null;

    // Cache the result for 500ms to avoid excessive lookups
    const now = Date.now();
    if (this.lastFoundMesh && now - this.lastFoundTimestamp < 500) {
      return this.lastFoundMesh;
    }

    // Try to find by playerId from store
    const playerId = window.store?.getPlayerId() || '';
    const playerMesh = this.scene.getMeshByName('playerFoot_' + playerId);

    if (playerMesh) {
      this.lastFoundMesh = playerMesh;
      this.lastFoundTimestamp = now;
      return playerMesh;
    }

    // Try broader search for any player mesh
    const playerMeshes = this.scene.meshes.filter((mesh) => mesh.name.includes('playerFoot_'));

    if (playerMeshes.length > 0) {
      this.lastFoundMesh = playerMeshes[0];
      this.lastFoundTimestamp = now;
      return playerMeshes[0];
    }

    return null;
  }

  /**
   * Get player's virtual position (in Mars coordinates)
   */
  public getVirtualPosition(): Vector3 | null {
    const playerMesh = this.findPlayerMesh();
    if (!playerMesh) return null;

    return WorldManager.toVirtual(playerMesh.position);
  }

  /**
   * Get player's normalized position (0-1 range for globe coordinates)
   */
  public getNormalizedPosition(): { x: number; z: number } | null {
    const virtualPos = this.getVirtualPosition();
    if (!virtualPos) return null;

    const normalizedX = virtualPos.x / WorldManager.WORLD_WIDTH;
    const normalizedZ = virtualPos.z / WorldManager.WORLD_HEIGHT;

    // Ensure values are within 0-1 range
    return {
      x: Math.max(0, Math.min(1, normalizedX)),
      z: Math.max(0, Math.min(1, normalizedZ)),
    };
  }

  /**
   * Set player position (in engine coordinates)
   */
  public setPlayerPosition(position: Vector3): boolean {
    const playerMesh = this.findPlayerMesh();
    if (!playerMesh) return false;

    playerMesh.position.copyFrom(position);
    return true;
  }

  /**
   * Set virtual position (in Mars coordinates)
   */
  public setVirtualPosition(virtualPos: Vector3): boolean {
    const enginePos = WorldManager.toEngine(virtualPos);
    return this.setPlayerPosition(enginePos);
  }
}

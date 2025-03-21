import { Vector3 } from '@babylonjs/core';

export default class WorldManager {
  // Mars dimensions from documentation: 144 patches wide (X), 72 patches tall (Z)
  static readonly WORLD_WIDTH = 144 * 128; // Total world width in units (144 patches * 128 units/patch)
  static readonly WORLD_HEIGHT = 72 * 128; // Total world height in units (72 patches * 128 units/patch)

  // Debug flag to help with coordinate system issues
  static readonly DEBUG_COORDINATES = true;

  // Track player's global position on Mars
  private static globalPlayerPosition = new Vector3(
    WorldManager.WORLD_WIDTH / 2,
    0,
    WorldManager.WORLD_HEIGHT / 2
  );

  /**
   * Set the player's global position on Mars
   */
  static setGlobalPlayerPosition(position: Vector3): void {
    this.globalPlayerPosition = position.clone();
    // console.log('Updated player global position:', position.toString());
  }

  /**
   * Get the player's global position on Mars
   */
  static getGlobalPlayerPosition(): Vector3 {
    return this.globalPlayerPosition.clone();
  }

  /**
   * Convert engine coordinates (relative to player) to global Mars coordinates
   */
  static toGlobal(enginePosition: Vector3): Vector3 {
    // Validate input
    if (
      !enginePosition ||
      !isFinite(enginePosition.x) ||
      !isFinite(enginePosition.y) ||
      !isFinite(enginePosition.z)
    ) {
      console.warn('Invalid position in toGlobal, using fallback', enginePosition?.toString());
      return this.globalPlayerPosition.clone();
    }

    return new Vector3(
      this.globalPlayerPosition.x + enginePosition.x,
      enginePosition.y,
      this.globalPlayerPosition.z + enginePosition.z
    );
  }

  /**
   * Convert global Mars coordinates to engine coordinates (relative to player)
   */
  static toEngine(globalPosition: Vector3): Vector3 {
    // Validate input
    if (
      !globalPosition ||
      !isFinite(globalPosition.x) ||
      !isFinite(globalPosition.y) ||
      !isFinite(globalPosition.z)
    ) {
      console.warn('Invalid position in toEngine, using fallback', globalPosition?.toString());
      return Vector3.Zero();
    }

    return new Vector3(
      globalPosition.x - this.globalPlayerPosition.x,
      globalPosition.y,
      globalPosition.z - this.globalPlayerPosition.z
    );
  }

  /**
   * Get chunk coordinates from a global position
   */
  static getChunkCoordinates(globalPosition: Vector3, chunkSize: number): { x: number; y: number } {
    return {
      x: Math.floor(globalPosition.x / chunkSize),
      y: Math.floor(globalPosition.z / chunkSize),
    };
  }

  /**
   * Initialize the world coordinate system around a player position
   */
  static initialize(globalPosition: Vector3): void {
    this.setGlobalPlayerPosition(globalPosition);
    console.log('World initialized with global player position:', globalPosition.toString());
  }

  /**
   * For backward compatibility - convert old virtual coordinates to global
   */
  static toVirtual(enginePosition: Vector3): Vector3 {
    return this.toGlobal(enginePosition);
  }
}

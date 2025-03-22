import { Vector3 } from '@babylonjs/core';

export default class WorldManager {
  // Mars dimensions from documentation: 144 patches wide (X), 72 patches tall (Z)
  static readonly WORLD_WIDTH = 144 * 128; // Total world width in units (144 patches * 128 units/patch)
  static readonly WORLD_HEIGHT = 72 * 128; // Total world height in units (72 patches * 128 units/patch)
  static readonly chunkSize = 128; // Size of a terrain chunk

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
    // Validate position - catch NaN or Infinity
    if (!position || !isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
      console.error('Invalid global position:', position?.toString());
      return; // Don't update with invalid values
    }

    this.globalPlayerPosition = position.clone();
    // console.log('Updated player global position:', clampedPosition.toString());
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

    // Calculate raw global position
    const globalPosition = new Vector3(
      this.globalPlayerPosition.x + enginePosition.x,
      enginePosition.y,
      this.globalPlayerPosition.z + enginePosition.z
    );

    return globalPosition;
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

    // Create a fresh copy to avoid modifying the input
    const enginePosition = new Vector3(
      globalPosition.x - this.globalPlayerPosition.x,
      globalPosition.y,
      globalPosition.z - this.globalPlayerPosition.z
    );

    return enginePosition;
  }

  /**
   * Get chunk coordinates from a global position
   */
  static getChunkCoordinates(globalPosition: Vector3): { x: number; y: number } {
    return {
      x: Math.floor(globalPosition.x / this.chunkSize),
      y: Math.floor(globalPosition.z / this.chunkSize),
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

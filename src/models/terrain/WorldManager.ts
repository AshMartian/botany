import { Vector3 } from "@babylonjs/core";

export default class WorldManager {
  // Mars dimensions from documentation: 144 patches wide (X), 72 patches tall (Z)
  static readonly WORLD_WIDTH = 144 * 71; // Total world width in units (144 patches * 71 units/patch)
  static readonly WORLD_HEIGHT = 72 * 71; // Total world height in units (72 patches * 71 units/patch)
  private static offset = Vector3.Zero();
  private static readonly PRECISION_THRESHOLD = 500; // Reset when player moves beyond this

  /**
   * Initialize the world coordinate system around a player position
   */
  static initialize(playerPosition: Vector3) {
    // Calculate offset to center world around player
    this.offset = new Vector3(-playerPosition.x, 0, -playerPosition.z);
    console.log("World initialized with offset:", this.offset.toString());
  }

  /**
   * Convert engine coordinates to virtual Mars coordinates
   * Ensures all values are finite and within reasonable bounds
   */
  static toVirtual(position: Vector3): Vector3 {
    // Validate input
    if (!position || !isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
      console.warn("Invalid position in toVirtual, using fallback", position?.toString());
      return new Vector3(
        this.WORLD_WIDTH / 2,
        0,
        this.WORLD_HEIGHT / 2
      );
    }
    
    // Apply offset with validation
    const result = new Vector3(
      position.x + this.offset.x,
      position.y,
      position.z + this.offset.z
    );
    
    // Ensure result is within world bounds
    result.x = Math.max(0, Math.min(this.WORLD_WIDTH, result.x));
    result.z = Math.max(0, Math.min(this.WORLD_HEIGHT, result.z));
    
    return result;
  }
  
  /**
   * Debug position conversion for troubleshooting
   */
  static debugPositionConversion(position: Vector3): void {
    console.log(`Position conversion debug:
  Raw: ${position.toString()}
  Virtual: ${this.toVirtual(position).toString()}
  Engine: ${this.toEngine(this.toVirtual(position)).toString()}
  Offset: ${this.offset.toString()}`);
  }

  /**
   * Convert virtual Mars coordinates to engine-safe coordinates
   * Ensures all values are finite and within reasonable bounds
   */
  static toEngine(position: Vector3): Vector3 {
    // Validate input
    if (!position || !isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
      console.warn("Invalid position in toEngine, using fallback", position?.toString());
      return Vector3.Zero();
    }
    
    // Apply offset with validation
    const result = new Vector3(
      position.x - this.offset.x,
      position.y,
      position.z - this.offset.z
    );
    
    // Ensure result is within reasonable bounds for engine
    const MAX_ENGINE_COORD = 10000; // Reasonable limit for engine coordinates
    result.x = Math.max(-MAX_ENGINE_COORD, Math.min(MAX_ENGINE_COORD, result.x));
    result.z = Math.max(-MAX_ENGINE_COORD, Math.min(MAX_ENGINE_COORD, result.z));
    
    return result;
  }

  /**
   * Get chunk coordinates from a world position
   */
  static getChunkCoordinates(
    position: Vector3,
    chunkSize: number
  ): { x: number; y: number } {
    const virtualPos = this.toVirtual(position);
    return {
      x: Math.floor(virtualPos.x / chunkSize),
      y: Math.floor(virtualPos.z / chunkSize), // Use Z for Y-axis consistently
    };
  }

  static getValidChunkIndex(value: number, maxChunks: number): number {
    return Math.max(0, Math.min(maxChunks - 1, value));
  }

  /**
   * Update world origin when player moves too far from origin
   * Returns true if world was shifted
   */
  static updateOrigin(playerPosition: Vector3): boolean {
    // Use horizontal distance only to prevent Y-axis affecting calculations
    const horizontalDistance = Math.sqrt(playerPosition.x**2 + playerPosition.z**2);
    if (horizontalDistance > this.PRECISION_THRESHOLD) {
      // Calculate offset delta - only use X and Z components
      const delta = new Vector3(playerPosition.x, 0, playerPosition.z);

      // Update the global offset
      this.offset.addInPlace(delta);

      // Shift world objects
      this.shiftWorld(-delta.x, -delta.z);

      console.log("World shifted, new offset:", this.offset.toString());
      return true;
    }
    return false;
  }

  /**
   * Shift all world objects to maintain precision
   */
  private static shiftWorld(dx: number, dz: number) {
    // Shift all terrain chunks and static objects
    globalThis.scene.meshes.forEach((mesh) => {
      // Skip player meshes to prevent player position issues
      if (mesh.name.startsWith("playerFoot_")) return;
      
      if (
        mesh.name.startsWith("terrain_chunk_") ||
        mesh.name.startsWith("static_") ||
        mesh.name.startsWith("prop_")
      ) {
        mesh.position.x += dx;
        mesh.position.z += dz;
      }
    });
  }

  /**
   * Get current world offset
   */
  static getCurrentOffset(): Vector3 {
    return this.offset.clone();
  }
}

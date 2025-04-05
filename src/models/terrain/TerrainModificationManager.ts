import { Mesh, Vector3, VertexData, Scene as BabylonScene } from '@babylonjs/core';
import { useTerrainStore } from '@/stores/terrainStore'; // Keep the import

/**
 * Singleton class that handles all terrain modifications in one place
 * to prevent conflicts and ensure consistency
 */
export default class TerrainModificationManager {
  private static instance: TerrainModificationManager;
  private scene: BabylonScene | null = null;
  // --- REMOVED terrainStore class property ---

  // Track pending updates by chunk to batch efficiently
  private pendingUpdates: Map<string, Map<number, number[]>> = new Map();
  private updateTimers: Map<string, number> = new Map();

  // Lock for preventing concurrent modifications
  private modificationLocks: Map<string, boolean> = new Map();

  // Performance optimization flags
  private isProcessing = false;
  private batchTimeoutMs = 50; // Increased to reduce update frequency

  // Cross-chunk handling for boundary modifications
  private chunkSize = 512; // Standard chunk size
  private resolution = 128; // Standard resolution

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): TerrainModificationManager {
    if (!TerrainModificationManager.instance) {
      TerrainModificationManager.instance = new TerrainModificationManager();
    }
    return TerrainModificationManager.instance;
  }

  /**
   * Initialize with the game scene
   */
  public setScene(scene: BabylonScene): void {
    this.scene = scene;
  }

  /**
   * Modify terrain at a specific point in a chunk
   * This is the main public API for terrain modification
   */
  public modifyTerrainAtPoint(
    chunkId: string,
    worldX: number,
    worldZ: number,
    radius: number,
    heightDelta: number
  ): void {
    // Find the mesh for this chunk
    const mesh = this.findChunkMesh(chunkId);
    if (!mesh) return;

    const [chunkX, chunkY] = chunkId.split('_').map(Number);
    if (isNaN(chunkX) || isNaN(chunkY)) return;

    // Convert world position to local chunk position
    const localX = worldX - chunkX * this.chunkSize;
    const localZ = worldZ - chunkY * this.chunkSize;

    // Convert to vertex grid coordinates
    const spacing = this.chunkSize / (this.resolution - 1);
    const vertexX = Math.round(localX / spacing);
    const vertexZ = Math.round(localZ / spacing);

    // Calculate radius in vertex space
    const radiusVertices = Math.ceil(radius / spacing);

    // Check if modification might affect neighboring chunks
    const affectsNeighbors = this.checkNeighborChunks(vertexX, vertexZ, radiusVertices);

    // Modify the primary chunk
    this.modifyTerrainInRadius(chunkId, radiusVertices, vertexX, vertexZ, heightDelta);

    // Handle neighbor chunks if needed
    if (affectsNeighbors.length > 0) {
      this.handleNeighborChunks(
        affectsNeighbors,
        chunkX,
        chunkY,
        vertexX,
        vertexZ,
        radiusVertices,
        heightDelta
      );
    }
  }

  /**
   * Check if modification affects neighboring chunks
   */
  private checkNeighborChunks(centerX: number, centerZ: number, radius: number): string[] {
    const affectedNeighbors: string[] = [];

    // Check edge proximity (we consider a vertex "near edge" if it's within radius of chunk border)
    const nearLeftEdge = centerX - radius <= 0;
    const nearRightEdge = centerX + radius >= this.resolution - 1;
    const nearTopEdge = centerZ - radius <= 0;
    const nearBottomEdge = centerZ + radius >= this.resolution - 1;

    if (nearLeftEdge) affectedNeighbors.push('left');
    if (nearRightEdge) affectedNeighbors.push('right');
    if (nearTopEdge) affectedNeighbors.push('top');
    if (nearBottomEdge) affectedNeighbors.push('bottom');

    // Also check diagonals
    if (nearLeftEdge && nearTopEdge) affectedNeighbors.push('topLeft');
    if (nearRightEdge && nearTopEdge) affectedNeighbors.push('topRight');
    if (nearLeftEdge && nearBottomEdge) affectedNeighbors.push('bottomLeft');
    if (nearRightEdge && nearBottomEdge) affectedNeighbors.push('bottomRight');

    return affectedNeighbors;
  }

  /**
   * Handle modifications that affect neighboring chunks
   */
  private handleNeighborChunks(
    neighbors: string[],
    chunkX: number,
    chunkY: number,
    vertexX: number,
    vertexZ: number,
    radius: number,
    heightDelta: number
  ): void {
    for (const neighbor of neighbors) {
      let neighborChunkX = chunkX;
      let neighborChunkY = chunkY;
      let neighborVertexX = vertexX;
      let neighborVertexZ = vertexZ;

      switch (neighbor) {
        case 'left':
          neighborChunkX--;
          neighborVertexX += this.resolution - 1;
          break;
        case 'right':
          neighborChunkX++;
          neighborVertexX -= this.resolution - 1;
          break;
        case 'top':
          neighborChunkY--;
          neighborVertexZ += this.resolution - 1;
          break;
        case 'bottom':
          neighborChunkY++;
          neighborVertexZ -= this.resolution - 1;
          break;
        case 'topLeft':
          neighborChunkX--;
          neighborChunkY--;
          neighborVertexX += this.resolution - 1;
          neighborVertexZ += this.resolution - 1;
          break;
        case 'topRight':
          neighborChunkX++;
          neighborChunkY--;
          neighborVertexX -= this.resolution - 1;
          neighborVertexZ += this.resolution - 1;
          break;
        case 'bottomLeft':
          neighborChunkX--;
          neighborChunkY++;
          neighborVertexX += this.resolution - 1;
          neighborVertexZ -= this.resolution - 1;
          break;
        case 'bottomRight':
          neighborChunkX++;
          neighborChunkY++;
          neighborVertexX -= this.resolution - 1;
          neighborVertexZ -= this.resolution - 1;
          break;
      }

      // Find the neighboring chunk and modify it too
      const neighborChunkId = `${neighborChunkX}_${neighborChunkY}`;
      // Check if the neighbor chunk exists in the scene
      if (this.findChunkMesh(neighborChunkId)) {
        this.modifyTerrainInRadius(
          neighborChunkId,
          radius,
          neighborVertexX,
          neighborVertexZ,
          heightDelta
        );
      }
    }
  }

  /**
   * Modify terrain in a radius around a center point
   * Creates smooth transitions using distance-based falloff
   */
  public modifyTerrainInRadius(
    chunkId: string,
    radiusInVertices: number,
    centerX: number,
    centerZ: number,
    heightDelta: number
  ): void {
    // Avoid modifying locked chunks
    if (this.modificationLocks.get(chunkId)) return;

    const mesh = this.findChunkMesh(chunkId);
    if (!mesh) return;

    const positions = mesh.getVerticesData('position');
    if (!positions) return;

    // Create or get the map for this chunk's pending updates
    if (!this.pendingUpdates.has(chunkId)) {
      this.pendingUpdates.set(chunkId, new Map());
    }
    const chunkUpdates = this.pendingUpdates.get(chunkId)!;

    // Apply modification to all vertices within radius with distance-based falloff
    for (
      let z = Math.max(0, centerZ - radiusInVertices);
      z <= Math.min(this.resolution - 1, centerZ + radiusInVertices);
      z++
    ) {
      for (
        let x = Math.max(0, centerX - radiusInVertices);
        x <= Math.min(this.resolution - 1, centerX + radiusInVertices);
        x++
      ) {
        // Calculate distance to center (squared)
        const distSq = (x - centerX) ** 2 + (z - centerZ) ** 2;

        // Skip if outside radius
        if (distSq > radiusInVertices ** 2) continue;

        // Calculate falloff based on distance (smoother brush)
        const distance = Math.sqrt(distSq);
        const falloff = Math.pow(1 - Math.min(1, distance / radiusInVertices), 2); // Quadratic falloff

        // Apply falloff to height delta
        const scaledDelta = heightDelta * falloff;

        // Skip very small changes
        if (Math.abs(scaledDelta) < 0.01) continue;

        // Add to pending updates (vertices are identified by their index)
        const vertexIndex = z * this.resolution + x;

        // If we already have an update for this vertex, add to it
        const currentDelta = chunkUpdates.get(vertexIndex) || [x, z, 0];
        currentDelta[2] += scaledDelta;
        chunkUpdates.set(vertexIndex, currentDelta);
      }
    }

    // Schedule batch update if not already scheduled
    this.scheduleBatchUpdate(chunkId);
  }

  /**
   * Schedule a batch update for a chunk after a short delay
   * This allows multiple modifications to be batched together
   */
  private scheduleBatchUpdate(chunkId: string): void {
    // Clear existing timer if any
    if (this.updateTimers.has(chunkId)) {
      window.clearTimeout(this.updateTimers.get(chunkId));
    }

    // Set new timer
    const timerId = window.setTimeout(() => {
      this.processBatchUpdate(chunkId);
      this.updateTimers.delete(chunkId);
    }, this.batchTimeoutMs);

    this.updateTimers.set(chunkId, timerId);
  }

  /**
   * Process all pending updates for a chunk in a single batch
   */
  private processBatchUpdate(chunkId: string): void {
    // --- ADDED Store Access Here ---
    const terrainStore = useTerrainStore();
    // --- END ADD ---

    if (this.isProcessing) {
      // Re-schedule for later if currently processing
      this.scheduleBatchUpdate(chunkId);
      return;
    }

    const mesh = this.findChunkMesh(chunkId);
    if (!mesh) return;

    const updates = this.pendingUpdates.get(chunkId);
    if (!updates || updates.size === 0) return;

    // Lock this chunk during processing
    this.isProcessing = true;
    this.modificationLocks.set(chunkId, true);

    try {
      // Get a copy of positions to avoid reference issues
      const positions = [...(mesh.getVerticesData('position') || [])];
      const indices = mesh.getIndices();

      if (!positions.length || !indices) {
        // --- ADDED Lock Release ---
        this.isProcessing = false;
        this.modificationLocks.set(chunkId, false);
        // --- END ADD ---
        return;
      }

      // Prevent noise by debouncing small changes
      const significantUpdates = Array.from(updates.entries()).filter(
        ([_, [__, ___, delta]]) => Math.abs(delta) >= 0.05
      ); // Filter out tiny changes

      // If no significant updates, skip processing
      if (significantUpdates.length === 0) {
        this.pendingUpdates.set(chunkId, new Map());
        // --- ADDED Lock Release ---
        this.isProcessing = false;
        this.modificationLocks.set(chunkId, false);
        // --- END ADD ---
        return;
      }

      // Apply all updates in one batch
      for (const [vertexIndex, [x, z, delta]] of significantUpdates) {
        // Calculate the positions array index (Y component)
        const posIndex = vertexIndex * 3 + 1;

        // Skip invalid indices
        if (posIndex < 0 || posIndex >= positions.length) continue;

        // Update the height
        positions[posIndex] += delta;

        // Update the store (without triggering events)
        // Get existing data first
        // --- REPLACED this.terrainStore with terrainStore ---
        const vertexData = terrainStore.getVertexData(chunkId, x, z);
        // const storedHeight = vertexData.height || 0; // Not needed if storing absolute

        // Update with the absolute height (not delta)
        // --- REPLACED this.terrainStore with terrainStore ---
        terrainStore.updateVertexData(chunkId, x, z, { height: positions[posIndex] });
        // --- END REPLACE ---
      }

      // Apply positions update in one batch
      // Clone the array to ensure Babylon gets a fresh reference
      mesh.updateVerticesData('position', [...positions], false, false); // Use spread to clone

      // Recalculate normals once for the entire update
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      mesh.updateVerticesData('normal', normals, false, false);

      // Update mesh bounding info
      mesh.refreshBoundingInfo();

      // Clear pending updates for this chunk
      this.pendingUpdates.set(chunkId, new Map());
    } catch (error) {
      console.error(`Error updating terrain chunk ${chunkId}:`, error);
    } finally {
      // Unlock the chunk
      this.isProcessing = false;
      this.modificationLocks.set(chunkId, false);
    }
  }

  /**
   * Find a terrain chunk mesh by its ID
   */
  private findChunkMesh(chunkId: string): Mesh | null {
    if (!this.scene) return null;

    // Try to find the mesh directly
    const mesh = this.scene.getMeshByName(`terrain_chunk_${chunkId}`);
    if (mesh && mesh instanceof Mesh) {
      return mesh;
    }

    // Alternative search by parsing chunkId
    const [chunkX, chunkY] = chunkId.split('_').map(Number);
    if (isNaN(chunkX) || isNaN(chunkY)) return null;

    const altMesh = this.scene.getMeshByName(`terrain_chunk_${chunkX}_${chunkY}`);
    if (altMesh && altMesh instanceof Mesh) {
      return altMesh;
    }

    return null;
  }

  /**
   * Process any remaining updates and clean up
   */
  public flush(): void {
    // Process any remaining updates
    for (const chunkId of this.pendingUpdates.keys()) {
      if (this.pendingUpdates.get(chunkId)?.size) {
        this.processBatchUpdate(chunkId);
      }
    }

    // Clear all timers
    for (const timerId of this.updateTimers.values()) {
      window.clearTimeout(timerId);
    }

    this.updateTimers.clear();
    this.modificationLocks.clear();
  }
}

import {
  Vector3,
  Scene as BabylonScene,
  MeshBuilder,
  Color3,
  StandardMaterial,
} from '@babylonjs/core';
import TerrainChunk from './TerrainChunk';
import WorldManager from './WorldManager';
import TerrainProcGen from './TerrainProcGen';

declare global {
  interface Window {
    terrainManager?: TerrainManager;
    playerController?: {
      teleportTo: (x: number, z: number) => void;
      enableControls: () => void;
    };
  }
}

export interface TerrainChunkDTO {
  x: number;
  y: number;
  heightmap: ArrayBuffer; // Compressed Int16Array
  textureSeed: number;
  noiseSeed: number;
  checksum: number;
}

export default class TerrainManager {
  // Core chunk storage
  public loadedChunks: Map<string, TerrainChunk>;
  private loadingChunks: Set<string>; // Tracks chunks currently in the loadChunk process
  private fullyLoadedChunks: Set<string> = new Set(); // Tracks chunks confirmed ready via markChunkLoaded
  private targetChunksToLoad: Set<string> = new Set(); // Used during initialization

  // Scene reference and configuration
  private scene: BabylonScene;
  private chunkSize: number;
  private renderDistance: number;

  // Tracking state
  private lastPlayerChunkX = -999;
  private lastPlayerChunkY = -999;
  private initialized = false;
  private _isTeleporting = false;
  public debugMode = false; // Enable for visualization

  // Performance and safety limits
  private maxConcurrentChunks = 50; // Safety limit - 6x6 grid maximum
  private chunkLoadThrottleTime = 200; // ms between chunk batches
  private lastUpdateTime = 0; // Track last update time
  private debugVerbose = false; // Control verbose logging

  // Lock to prevent concurrent updates
  private loadingLock = false;

  private static procGen: TerrainProcGen | null = null;

  constructor(scene: BabylonScene, chunkSize = 128, renderDistance = 3) {
    this.scene = scene;
    this.loadedChunks = new Map();
    this.loadingChunks = new Set();
    this.chunkSize = chunkSize;
    this.renderDistance = renderDistance;

    if (!TerrainManager.procGen) {
      TerrainManager.procGen = new TerrainProcGen(scene);
    }

    console.log(
      `TerrainManager initialized with chunk size ${chunkSize} and render distance ${renderDistance}`
    );
  }

  /**
   * Initialize terrain at a specific global position
   */
  public async initialize(
    globalPosition: Vector3 = WorldManager.getGlobalPlayerPosition()
  ): Promise<void> {
    await this.clearAllChunks();

    this.initialized = true;
    console.log('Terrain initialization process started');
  }

  /**
   * Update chunks based on player position - call this frequently!
   */
  public updateChunks(playerEnginePosition: Vector3): void {
    if (!this.initialized || this._isTeleporting) return;

    // Rate limit updates to prevent overloading
    const now = performance.now();
    if (now - this.lastUpdateTime < 250) return; // Limit to 4 updates per second max
    this.lastUpdateTime = now;

    // CRITICAL: Protect against concurrent updates with a lock
    if (this.loadingLock) {
      if (this.debugVerbose) console.log('Skipping update - terrain locked');
      return;
    }

    // ⭐ IMPORTANT: First, store a consistent copy of the player position to use throughout this method
    const playerEngineCopy = playerEnginePosition.clone();

    // Convert engine position to global position
    const playerGlobalPos = WorldManager.toGlobal(playerEngineCopy);

    // Calculate current chunk coordinates
    const playerChunkX = Math.floor(playerGlobalPos.x / this.chunkSize);
    const playerChunkY = Math.floor(playerGlobalPos.z / this.chunkSize);

    // Sanity check coordinates to catch corrupted positions
    if (
      !isFinite(playerChunkX) ||
      !isFinite(playerChunkY) ||
      playerChunkX < 0 ||
      playerChunkX >= 144 ||
      playerChunkY < 0 ||
      playerChunkY >= 72
    ) {
      console.error('CRITICAL: Invalid chunk coordinates:', { x: playerChunkX, y: playerChunkY });
      return; // Skip this update entirely
    }

    // Check for too many chunks - emergency cleanup if needed
    if (this.loadedChunks.size > this.maxConcurrentChunks) {
      console.warn(
        `EMERGENCY: Too many chunks (${this.loadedChunks.size}/${this.maxConcurrentChunks}), forcing cleanup`
      );
      this.emergencyCleanup(playerChunkX, playerChunkY);
    }

    // IMPORTANT: Always ensure the current chunk is loaded or loading
    // const currentChunkKey = this.getChunkKey(playerChunkX, playerChunkY);
    // if (!this.loadedChunks.has(currentChunkKey) && !this.loadingChunks.has(currentChunkKey)) {
    //   if (this.debugVerbose)
    //     console.log(`Current chunk ${currentChunkKey} not loaded, loading immediately`);
    //   // Don't await here, let it load in the background
    //   this.loadChunk(playerChunkX, playerChunkY, true);
    // }

    // Only update chunk loading/unloading if player moved to a different chunk
    if (playerChunkX !== this.lastPlayerChunkX || playerChunkY !== this.lastPlayerChunkY) {
      console.log(
        `Player moved to new chunk (${playerChunkX}, ${playerChunkY}) from (${this.lastPlayerChunkX}, ${this.lastPlayerChunkY})`
      );
      this.lastPlayerChunkX = playerChunkX;
      this.lastPlayerChunkY = playerChunkY;

      // Set loading lock to prevent concurrent updates during surrounding/unload calls
      this.loadingLock = true;
      try {
        this.loadSurroundingChunks(playerChunkX, playerChunkY); // Starts async loading
        this.unloadDistantChunks(playerChunkX, playerChunkY);
      } finally {
        this.loadingLock = false; // Ensure lock is released
      }
    }
  }

  /**
   * Load a single terrain chunk. This is the primary public loading method.
   * It handles creation, generation (including internal readiness waits),
   * positioning, and adding to the loaded map.
   */
  public async loadChunk(x: number, y: number): Promise<TerrainChunk | null> {
    // Validate chunk coordinates
    if (x < 0 || x >= 144 || y < 0 || y >= 72) {
      console.error(`Invalid chunk request: ${x},${y}`);
      return null;
    }

    const key = this.getChunkKey(x, y);

    // Check if already loaded and ready (using the simplified check)
    const existingChunk = this.loadedChunks.get(key);
    if (existingChunk && existingChunk.isFullyReady()) {
      // console.log(`Chunk ${key} already loaded and ready.`);
      return existingChunk;
    }

    // If chunk is already loading, wait for it to finish
    if (this.loadingChunks.has(key)) {
      if (this.debugVerbose) console.log(`Chunk ${key} is already loading, waiting...`);
      while (this.loadingChunks.has(key)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // After waiting, check if it's now loaded and ready
      const potentiallyLoadedChunk = this.loadedChunks.get(key);
      if (potentiallyLoadedChunk && potentiallyLoadedChunk.isFullyReady()) {
        if (this.debugVerbose) console.log(`Chunk ${key} finished loading and is ready.`);
        return potentiallyLoadedChunk;
      } else {
        console.warn(`Chunk ${key} finished loading process but is not ready.`);
        return null; // Indicate failure after waiting
      }
    }

    // If not loaded/ready, proceed to load/generate
    if (this.debugVerbose) console.log(`Loading terrain chunk (${x}, ${y})...`);
    this.loadingChunks.add(key);

    try {
      // Dispose any existing mesh remnants (safety check)
      const existingMesh = this.scene.getMeshByName(`terrain_chunk_${x}_${y}`);
      if (existingMesh) {
        console.warn(`Disposing existing mesh remnant for chunk (${x}, ${y})`);
        if (existingMesh.material) existingMesh.material.dispose();
        existingMesh.dispose(true, true);
      }

      // Create and generate the chunk - await ensures it's fully ready internally
      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
      await chunk.generate(); // This now waits for mesh/material readiness internally

      // --- Position the chunk AFTER it's fully generated and ready ---
      const globalChunkPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);
      const enginePos = WorldManager.toEngine(globalChunkPos);
      chunk.setPosition(enginePos); // Set position

      if (this.debugVerbose)
        console.log(`Chunk ${key} generated and positioned at ${enginePos.toString()}`);
      // --- End Positioning ---

      // Store in loaded chunks map ONLY after successful generation and positioning
      this.loadedChunks.set(key, chunk);
      this.markChunkLoaded(x, y); // Update tracking

      // Process procedural generation elements
      if (TerrainManager.procGen) {
        await TerrainManager.procGen.processChunk(x, y);
      }

      console.log(`Successfully loaded chunk ${key}`);
      return chunk; // Return the ready and positioned chunk
    } catch (error) {
      console.error(`Failed to load chunk (${x}, ${y}):`, error);
      // Chunk dispose is handled within generate's catch block now
      return null; // Indicate failure
    } finally {
      this.loadingChunks.delete(key); // Ensure loading flag is removed
    }
  }

  /**
   * Load chunks surrounding the player asynchronously.
   */
  private loadSurroundingChunks(centerX: number, centerY: number): void {
    // Avoid loading too many chunks - impose hard limit
    if (this.loadedChunks.size + this.loadingChunks.size >= this.maxConcurrentChunks) {
      console.warn(
        `Too many chunks in process (${this.loadedChunks.size} loaded, ${this.loadingChunks.size} loading), skipping new loads`
      );
      return;
    }

    interface ChunkToLoad {
      x: number;
      y: number;
      distance: number;
    }

    const chunksToLoad: ChunkToLoad[] = [];

    // Use smaller render distance when we have many chunks already
    const adjustedRenderDistance =
      this.loadedChunks.size > this.maxConcurrentChunks * 0.7
        ? Math.min(1, this.renderDistance) // Reduce to 1 when approaching limit
        : this.renderDistance;

    // Only consider a maximum of 12 new chunks to avoid memory issues
    const maxNewChunks = 12;

    // First collect chunks that need loading
    for (let r = 0; r <= adjustedRenderDistance; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          // Only check chunks at the exact radius r boundary
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
            const x = centerX + dx;
            const y = centerY + dy;

            // Skip invalid coordinates
            if (x < 0 || x >= 144 || y < 0 || y >= 72) continue;

            const key = this.getChunkKey(x, y);

            // Skip if already loaded or currently loading
            if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
              chunksToLoad.push({
                x,
                y,
                distance: r, // Use radius as distance
              });

              // Stop if we hit our limit
              if (chunksToLoad.length >= maxNewChunks) break;
            }
          }
        }
        if (chunksToLoad.length >= maxNewChunks) break;
      }
      if (chunksToLoad.length >= maxNewChunks) break;
    }

    if (chunksToLoad.length === 0) {
      if (this.debugVerbose) console.log('No new surrounding chunks to load.');
      return;
    }

    // Sort by distance (closest first)
    chunksToLoad.sort((a, b) => a.distance - b.distance);

    if (this.debugVerbose)
      console.log(
        `Queueing ${chunksToLoad.length} surrounding chunks for loading:`,
        chunksToLoad.map((c) => `${c.x}_${c.y}`)
      );

    // Load chunks sequentially or in small batches using the consolidated loadChunk
    const loadNextBatch = async (index = 0) => {
      if (index >= chunksToLoad.length) {
        if (this.debugVerbose) console.log('Finished loading surrounding chunk batches.');
        return;
      }

      const batchSize = 2; // Load 2 at a time
      const batch = chunksToLoad.slice(index, index + batchSize);

      if (this.debugVerbose)
        console.log(
          `Loading batch ${index / batchSize + 1}:`,
          batch.map((c) => `${c.x}_${c.y}`)
        );

      // Use Promise.all for the small batch, calling the consolidated loadChunk
      // We don't need the result here, just fire and forget (errors logged in loadChunk)
      await Promise.all(
        batch.map(async ({ x, y }) => {
          try {
            await this.loadChunk(x, y); // Await the consolidated function
          } catch (error) {
            // Error is already logged in loadChunk, no need to log again unless desired
            // console.error(`Error loading chunk ${x},${y} in background batch:`, error);
          }
        })
      );

      // Schedule next batch
      setTimeout(() => loadNextBatch(index + batchSize), this.chunkLoadThrottleTime);
    };

    // Start the first batch
    loadNextBatch();
  }

  /**
   * Unload chunks that are too far from the player
   */
  private unloadDistantChunks(
    playerChunkX: number,
    playerChunkY: number,
    bufferDistance?: number // Keep optional buffer override if used elsewhere
  ): void {
    // Use a safer unloading policy - keep more chunks loaded but be strict about distant ones
    const coreDistance = 1; // Always keep chunks within 1 unit of player

    // *** INCREASE BUFFER DISTANCE ***
    // Increase the buffer from +1 to +2 (or even +3 if needed)
    const maxDistance = bufferDistance || this.renderDistance + 2; // Increased buffer

    if (this.debugVerbose)
      console.log(
        `Unloading chunks outside distance ${maxDistance} from (${playerChunkX}, ${playerChunkY})`
      );

    // Create a map of chunks that must be kept
    const criticalChunks = new Set<string>();

    // Mark critical chunks we must never unload (player chunk + immediate neighbors)
    for (let dx = -coreDistance; dx <= coreDistance; dx++) {
      for (let dy = -coreDistance; dy <= coreDistance; dy++) {
        const x = playerChunkX + dx;
        const y = playerChunkY + dy;

        // Skip invalid coordinates
        if (x < 0 || x >= 144 || y < 0 || y >= 72) continue;

        criticalChunks.add(this.getChunkKey(x, y));
      }
    }

    // Get a list of all chunk coordinates from loadedChunks
    const allLoadedKeys = Array.from(this.loadedChunks.keys());
    const chunksToUnload: string[] = [];

    for (const key of allLoadedKeys) {
      // Never unload critical chunks
      if (criticalChunks.has(key)) continue;

      const [xStr, yStr] = key.split('_');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Calculate distance
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));

      // Use the updated maxDistance
      if (distance > maxDistance) {
        chunksToUnload.push(key);
      }
    }

    if (chunksToUnload.length > 0) {
      console.log(`Unloading ${chunksToUnload.length} distant chunks:`, chunksToUnload);
      for (const key of chunksToUnload) {
        const chunk = this.loadedChunks.get(key);
        if (chunk) {
          chunk.dispose();
        }
        this.loadedChunks.delete(key);
        this.fullyLoadedChunks.delete(key); // Also remove from fully loaded tracking
      }
    } else if (this.debugVerbose) {
      console.log('No distant chunks to unload.');
    }
  }

  /**
   * Fallback terrain when chunk loading fails
   */
  private createEmergencyTerrain(): void {
    console.warn('Creating emergency terrain at origin');

    const existingEmergency = this.scene.getMeshByName('emergency_terrain');
    if (existingEmergency) return; // Don't create multiple

    const emergencyGround = MeshBuilder.CreateGround(
      'emergency_terrain',
      { width: this.chunkSize * 3, height: this.chunkSize * 3 },
      this.scene
    );

    const material = new StandardMaterial('emergency_material', this.scene);
    material.diffuseColor = new Color3(0.8, 0.4, 0.3);
    emergencyGround.material = material;
    emergencyGround.checkCollisions = true;
    emergencyGround.isPickable = true;
    // Position it at the engine origin
    emergencyGround.position = Vector3.Zero();
  }

  /**
   * Clear all loaded chunks and reset state
   */
  public async clearAllChunks(): Promise<void> {
    console.log('Clearing all terrain chunks...');

    // Dispose all chunks
    for (const chunk of this.loadedChunks.values()) {
      chunk.dispose();
    }

    // Clear collections
    this.loadedChunks.clear();
    this.loadingChunks.clear();
    this.fullyLoadedChunks.clear();
    this.targetChunksToLoad.clear();

    // Reset tracking
    this.lastPlayerChunkX = -999;
    this.lastPlayerChunkY = -999;

    // Allow time for scene cleanup? Might not be necessary.
    // await new Promise(resolve => setTimeout(resolve, 50));
    console.log('Terrain chunks cleared.');
  }

  // State management methods
  public lockForTeleport(isLocked: boolean): void {
    console.log(`Terrain Manager ${isLocked ? 'locked' : 'unlocked'} for teleport.`);
    this._isTeleporting = isLocked;
  }

  public get hasInitialized(): boolean {
    return this.initialized;
  }

  public set hasInitialized(value: boolean) {
    // Only allow setting to true once? Or manage state carefully.
    if (value && !this.initialized) {
      console.log('Terrain Manager marked as initialized.');
    }
    this.initialized = value;
  }

  public get isTeleporting(): boolean {
    return this._isTeleporting;
  }

  public getChunkSize(): number {
    return this.chunkSize;
  }

  // Update loadPriorityChunk to use the consolidated loadChunk
  public loadPriorityChunk(x: number, y: number): Promise<TerrainChunk | null> {
    // Simply call the consolidated loadChunk, priority is handled internally if needed
    // Pass true for highPriority argument
    return this.loadChunk(x, y);
  }

  public loadSurroundingChunksAsync(centerX: number, centerY: number): void {
    // This method now just calls the private version which handles async loading
    this.loadSurroundingChunks(centerX, centerY);
  }

  // Compatibility methods with old API (if needed, review usage)
  public loadRemoteChunk(data: TerrainChunkDTO): void {
    // This bypasses the standard loading flow and readiness checks. Use with caution.
    console.warn('Using loadRemoteChunk - bypassing standard loading pipeline.');
    const key = `${data.x}_${data.y}`;
    if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
      const chunk = new TerrainChunk(data.x, data.y, this.chunkSize, this.scene);
      // applyNetworkData doesn't have the full readiness pipeline of generate()
      chunk.applyNetworkData(data);
      // Manually position? Assume network data implies position?
      const globalChunkPos = new Vector3(data.x * this.chunkSize, 0, data.y * this.chunkSize);
      const enginePos = WorldManager.toEngine(globalChunkPos);
      chunk.setPosition(enginePos);
      // Add to map, but it might not be "fully ready" in the new sense
      this.loadedChunks.set(key, chunk);
      // Mark as loaded? This might be incorrect.
      // this.markChunkLoaded(data.x, data.y);
    }
  }

  public unloadChunk(x: number, y: number): void {
    const key = `${x}_${y}`;
    if (this.loadedChunks.has(key)) {
      console.log(`Unloading chunk ${key} via direct call.`);
      this.loadedChunks.get(key)?.dispose();
      this.loadedChunks.delete(key);
      this.fullyLoadedChunks.delete(key);
    }
  }

  public hasChunk(x: number, y: number): boolean {
    // Check if it's in the loaded map AND considered fully ready
    const chunk = this.loadedChunks.get(this.getChunkKey(x, y));
    return !!(chunk && chunk.isFullyReady());
  }

  public getActiveChunkCoordinates(): { x: number; y: number }[] {
    const coordinates: { x: number; y: number }[] = [];
    for (const [key, chunk] of this.loadedChunks.entries()) {
      // Optionally, only return coordinates of chunks that are fully ready
      if (chunk.isFullyReady()) {
        const [x, y] = key.split('_').map(Number);
        coordinates.push({ x, y });
      }
    }
    return coordinates;
  }

  public isChunkReady(x: number, y: number): boolean {
    // Use the simplified check: is it in the map and isFullyReady?
    const chunk = this.loadedChunks.get(this.getChunkKey(x, y));
    return !!(chunk && chunk.isFullyReady());
  }

  // Update getRaycastableChunk to simply check the map and readiness
  public getRaycastableChunk(x: number, y: number): TerrainChunk | null {
    const key = this.getChunkKey(x, y);
    const chunk = this.loadedChunks.get(key);

    // If chunk exists in the map, it means loadChunk started.
    // Check if it's also fully ready before returning.
    if (chunk && chunk.isFullyReady()) {
      return chunk;
    } else if (chunk) {
      // Chunk exists but isn't ready (might still be loading/generating)
      if (this.debugVerbose)
        console.log(`Chunk ${key} found in map but isFullyReady() returned false.`);
      return null;
    } else {
      // Chunk not found in loaded map at all
      // if (this.debugVerbose) console.log(`Chunk ${key} not found in loadedChunks map.`);
      return null;
    }
  }

  /**
   * Emergency cleanup when too many chunks are loaded
   */
  private emergencyCleanup(playerChunkX: number, playerChunkY: number): void {
    console.warn('Performing emergency chunk cleanup');

    // Keep only the chunks closest to the player
    const chunkEntries = Array.from(this.loadedChunks.entries()).map(([key, chunk]) => {
      const [x, y] = key.split('_').map(Number);
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));
      return { key, chunk, distance };
    });

    // Sort by distance (closest first)
    chunkEntries.sort((a, b) => a.distance - b.distance);

    // Keep only the closest chunks within our limit
    const maxToKeep = Math.floor(this.maxConcurrentChunks / 2); // Keep half our max as safety
    const chunksToRemove = chunkEntries.slice(maxToKeep);

    // Dispose the distant chunks
    for (const { key, chunk } of chunksToRemove) {
      console.log(`Emergency cleanup: Disposing chunk ${key}`);
      chunk.dispose();
      this.loadedChunks.delete(key);
      this.fullyLoadedChunks.delete(key); // Also remove from fully loaded tracking
    }

    console.warn(`Emergency cleanup complete: Removed ${chunksToRemove.length} chunks`);
  }

  /**
   * Get debug status information
   */
  public debugStatus(): {
    loadedChunks: number;
    loadingChunks: number;
    fullyLoadedChunks: number;
    playerChunk: { x: number; y: number };
    loadedKeys: string[];
    loadingKeys: string[];
  } {
    return {
      loadedChunks: this.loadedChunks.size,
      loadingChunks: this.loadingChunks.size,
      fullyLoadedChunks: this.fullyLoadedChunks.size,
      playerChunk: { x: this.lastPlayerChunkX, y: this.lastPlayerChunkY },
      loadedKeys: Array.from(this.loadedChunks.keys()),
      loadingKeys: Array.from(this.loadingChunks),
    };
  }

  /**
   * Toggle verbose logging
   */
  public setDebugVerbose(verbose: boolean): void {
    this.debugVerbose = verbose;
    console.log(`TerrainManager verbose logging ${verbose ? 'enabled' : 'disabled'}`);
  }

  public processChunkUpdate(message: { type: string; payload: any }): void {
    // Review if this network update logic is still needed or compatible
    if (message.type === 'chunkData') {
      this.loadRemoteChunk(message.payload);
    } else if (message.type === 'chunkUnload') {
      this.unloadChunk(message.payload.x, message.payload.y);
    }
  }

  /**
   * Create a visual representation of world boundaries
   */
  public showWorldBoundaries(): void {
    // Remove any existing boundary visualization
    const existingBoundaries = this.scene.meshes.filter((m) =>
      m.name.startsWith('world_boundary_')
    );
    existingBoundaries.forEach((m) => m.dispose());

    // Create visible boundary lines
    const height = 500; // High enough to be visible
    const color = new Color3(1, 0, 0); // Red

    // Convert world corners to engine coordinates
    const corners = [
      WorldManager.toEngine(new Vector3(0, 0, 0)),
      WorldManager.toEngine(new Vector3(WorldManager.WORLD_WIDTH, 0, 0)),
      WorldManager.toEngine(new Vector3(WorldManager.WORLD_WIDTH, 0, WorldManager.WORLD_HEIGHT)),
      WorldManager.toEngine(new Vector3(0, 0, WorldManager.WORLD_HEIGHT)),
    ];

    // Create vertical lines at each corner
    corners.forEach((corner, i) => {
      const line = MeshBuilder.CreateLines(
        `world_boundary_corner_${i}`,
        {
          points: [corner.clone(), new Vector3(corner.x, height, corner.z)],
        },
        this.scene
      );
      line.color = color;
    });

    // Create boundary lines connecting corners
    for (let i = 0; i < corners.length; i++) {
      const start = corners[i];
      const end = corners[(i + 1) % corners.length];

      const line = MeshBuilder.CreateLines(
        `world_boundary_edge_${i}`,
        {
          points: [start.clone(), end.clone()],
        },
        this.scene
      );
      line.color = color;
    }

    console.log('World boundaries visualized');
  }

  /**
   * Create physical collision barriers at world boundaries
   */
  public createWorldBoundaries(): void {
    // Remove any existing barriers
    const existingBarriers = this.scene.meshes.filter((m) =>
      m.name.startsWith('world_boundary_barrier_')
    );
    existingBarriers.forEach((m) => m.dispose());

    // Create invisible barriers at world edges (solid collision meshes)
    const wallHeight = 100;
    const wallThickness = 10;

    // Convert world boundaries to engine space
    const southWest = WorldManager.toEngine(new Vector3(0, 0, 0));
    const northEast = WorldManager.toEngine(
      new Vector3(WorldManager.WORLD_WIDTH, 0, WorldManager.WORLD_HEIGHT)
    );

    // Create south wall (min Z)
    const southWall = MeshBuilder.CreateBox(
      'world_boundary_barrier_south',
      { width: northEast.x - southWest.x + 200, height: wallHeight, depth: wallThickness },
      this.scene
    );
    southWall.position = new Vector3(
      (southWest.x + northEast.x) / 2,
      wallHeight / 2,
      southWest.z - wallThickness / 2
    );
    southWall.isVisible = false;
    southWall.checkCollisions = true;

    // Create north wall (max Z)
    const northWall = MeshBuilder.CreateBox(
      'world_boundary_barrier_north',
      { width: northEast.x - southWest.x + 200, height: wallHeight, depth: wallThickness },
      this.scene
    );
    northWall.position = new Vector3(
      (southWest.x + northEast.x) / 2,
      wallHeight / 2,
      northEast.z + wallThickness / 2
    );
    northWall.isVisible = false;
    northWall.checkCollisions = true;

    // Create west wall (min X)
    const westWall = MeshBuilder.CreateBox(
      'world_boundary_barrier_west',
      { width: wallThickness, height: wallHeight, depth: northEast.z - southWest.z + 200 },
      this.scene
    );
    westWall.position = new Vector3(
      southWest.x - wallThickness / 2,
      wallHeight / 2,
      (southWest.z + northEast.z) / 2
    );
    westWall.isVisible = false;
    westWall.checkCollisions = true;

    // Create east wall (max X)
    const eastWall = MeshBuilder.CreateBox(
      'world_boundary_barrier_east',
      { width: wallThickness, height: wallHeight, depth: northEast.z - southWest.z + 200 },
      this.scene
    );
    eastWall.position = new Vector3(
      northEast.x + wallThickness / 2,
      wallHeight / 2,
      (southWest.z + northEast.z) / 2
    );
    eastWall.isVisible = false;
    eastWall.checkCollisions = true;

    console.log('World boundary barriers created');
  }

  public getChunkKey(x: number, y: number): string {
    return `${x}_${y}`;
  }

  // Mark chunk as fully loaded and ready for interaction
  private markChunkLoaded(x: number, y: number): void {
    const key = this.getChunkKey(x, y);
    this.fullyLoadedChunks.add(key);
    if (this.debugVerbose) console.log(`Marked chunk ${key} as fully loaded.`);

    // Check if all target chunks are loaded (relevant during initial load)
    if (this.targetChunksToLoad.size > 0) {
      const allTargetChunksLoaded = Array.from(this.targetChunksToLoad).every((targetKey) =>
        this.fullyLoadedChunks.has(targetKey)
      );
      if (allTargetChunksLoaded) {
        console.log('All target chunks initially requested are now fully loaded.');
        // Potentially set this.initialized = true here if initial load completion is defined this way
        // this.hasInitialized = true; // Be careful with multiple initialization flags
        this.targetChunksToLoad.clear(); // Clear targets once met
      }
    }
  }
}

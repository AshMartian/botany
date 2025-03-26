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
  private loadedChunks: Map<string, TerrainChunk>;
  private loadingChunks: Set<string>;

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
  private maxConcurrentChunks = 36; // Safety limit - 6x6 grid maximum
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
    // Store global position in world manager
    // WorldManager.setGlobalPlayerPosition(globalPosition);

    // Calculate chunk coordinates
    const chunkX = Math.floor(globalPosition.x / this.chunkSize);
    const chunkY = Math.floor(globalPosition.z / this.chunkSize);

    // Clear any existing chunks
    await this.clearAllChunks();

    try {
      // Load center chunk first and wait for it
      const centerChunk = await this.loadChunk(chunkX, chunkY, true);

      if (centerChunk) {
        this.lastPlayerChunkX = chunkX;
        this.lastPlayerChunkY = chunkY;

        // Load surrounding chunks without waiting
        setTimeout(() => this.loadSurroundingChunks(chunkX, chunkY), 100);
      } else {
        console.error('Failed to load center chunk - creating emergency terrain');
        this.createEmergencyTerrain();
      }
    } catch (error) {
      console.error('Error during terrain initialization:', error);
      this.createEmergencyTerrain();
    }

    this.initialized = true;
    console.log('Terrain initialization complete');
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

    // IMPORTANT: Always ensure the current chunk is loaded
    const currentChunkKey = `${playerChunkX}_${playerChunkY}`;
    if (!this.loadedChunks.has(currentChunkKey) && !this.loadingChunks.has(currentChunkKey)) {
      if (this.debugVerbose)
        // console.log(`Current chunk ${currentChunkKey} not loaded, loading immediately`);
        this.loadChunk(playerChunkX, playerChunkY, true);
    }

    // Only update chunk loading/unloading if player moved to a different chunk
    if (playerChunkX !== this.lastPlayerChunkX || playerChunkY !== this.lastPlayerChunkY) {
      console.log(
        `Player moved to new chunk (${playerChunkX}, ${playerChunkY}) from (${this.lastPlayerChunkX}, ${this.lastPlayerChunkY})`
      );
      this.lastPlayerChunkX = playerChunkX;
      this.lastPlayerChunkY = playerChunkY;

      // Set loading lock to prevent concurrent updates
      this.loadingLock = true;
      this.loadSurroundingChunks(playerChunkX, playerChunkY);
      this.unloadDistantChunks(playerChunkX, playerChunkY);
      this.loadingLock = false;
    }
  }

  /**
   * Load a single terrain chunk
   */
  private async loadChunk(
    x: number,
    y: number,
    highPriority = false
  ): Promise<TerrainChunk | null> {
    // Validate chunk coordinates
    if (x < 0 || x >= 144 || y < 0 || y >= 72) {
      console.error(`Invalid chunk request: ${x},${y}`);
      return null;
    }

    const key = `${x}_${y}`;

    // Safety check: if this is the last player chunk, prioritize it
    const isPlayerChunk = x === this.lastPlayerChunkX && y === this.lastPlayerChunkY;
    if (isPlayerChunk) {
      highPriority = true;
    }

    // Skip if already loaded
    if (this.loadedChunks.has(key)) {
      return this.loadedChunks.get(key) || null;
    }

    // If chunk is already loading, return null unless this is high priority
    if (this.loadingChunks.has(key)) {
      return null;
    }

    // console.log(`Loading terrain chunk (${x}, ${y})`);
    this.loadingChunks.add(key);

    try {
      // First clean up any existing mesh with the same name
      const existingMesh = this.scene.getMeshByName(`terrain_chunk_${x}_${y}`);
      if (existingMesh) {
        console.log(`Found existing mesh for chunk (${x}, ${y}) - disposing`);
        if (existingMesh.material) existingMesh.material.dispose();
        existingMesh.dispose(true, true);
      }

      // Create and generate the chunk
      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
      await chunk.generate();

      // Calculate proper position in global space
      const globalChunkPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);

      // Convert to engine coordinates
      const enginePos = WorldManager.toEngine(globalChunkPos);

      // Set position
      chunk.setPosition(enginePos);

      // Store in loaded chunks map
      this.loadedChunks.set(key, chunk);

      if (TerrainManager.procGen) {
        await TerrainManager.procGen.processChunk(x, y);
      }

      return chunk;
    } catch (error) {
      console.error(`Failed to load chunk (${x}, ${y}):`, error);
      return null;
    } finally {
      this.loadingChunks.delete(key);
    }
  }

  /**
   * Load chunks surrounding the player in priority order
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
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
            const x = centerX + dx;
            const y = centerY + dy;

            // Skip invalid coordinates
            if (x < 0 || x >= 144 || y < 0 || y >= 72) continue;

            const key = `${x}_${y}`;

            // Skip if already loaded or loading
            if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
              chunksToLoad.push({
                x,
                y,
                distance: Math.max(Math.abs(dx), Math.abs(dy)),
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

    // Sort by distance (closest first)
    chunksToLoad.sort((a, b) => a.distance - b.distance);

    // Only load a few at a time to prevent memory spikes
    const loadNextBatch = (index = 0) => {
      if (index >= chunksToLoad.length) return;

      // Only load 2 chunks at a time
      const batchSize = 2;
      const batch = chunksToLoad.slice(index, index + batchSize);

      for (const { x, y } of batch) {
        this.loadChunk(x, y);
      }

      // Schedule next batch with increased delay
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
    bufferDistance?: number
  ): void {
    // Use a safer unloading policy - keep more chunks loaded but be strict about distant ones
    const coreDistance = 1; // Always keep chunks within 1 unit of player
    const maxDistance = bufferDistance || this.renderDistance + 1;

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

        criticalChunks.add(`${x}_${y}`);
      }
    }

    // Get a list of all chunk coordinates
    const allChunks = Array.from(this.loadedChunks.entries()).map(([key, chunk]) => {
      const [x, y] = key.split('_').map(Number);
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));
      return { key, chunk, x, y, distance };
    });

    // Sort by distance (farthest first)
    allChunks.sort((a, b) => b.distance - a.distance);

    // Count how many would be removed
    const wouldRemove = allChunks.filter(
      (c) => c.distance > maxDistance && !criticalChunks.has(c.key)
    );

    if (wouldRemove.length > 0) {
      console.log(`Unloading ${wouldRemove.length} distant chunks beyond distance ${maxDistance}`);
    }

    // Unload chunks beyond max distance
    for (const { key, chunk, x, y, distance } of allChunks) {
      // Never unload critical chunks
      if (criticalChunks.has(key)) continue;

      if (distance > maxDistance) {
        console.log(`Unloading distant chunk (${x}, ${y}), distance: ${distance}`);
        chunk.dispose();
        this.loadedChunks.delete(key);
      }
    }
  }

  /**
   * Fallback terrain when chunk loading fails
   */
  private createEmergencyTerrain(): void {
    console.warn('Creating emergency terrain at origin');

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
  }

  /**
   * Clear all loaded chunks and reset state
   */
  public async clearAllChunks(): Promise<void> {
    console.log('Clearing all terrain chunks');

    // Dispose all chunks
    for (const chunk of this.loadedChunks.values()) {
      chunk.dispose();
    }

    // Clear collections
    this.loadedChunks.clear();
    this.loadingChunks.clear();

    // Reset tracking
    this.lastPlayerChunkX = -999;
    this.lastPlayerChunkY = -999;

    // Allow time for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // State management methods
  public lockForTeleport(isLocked: boolean): void {
    this._isTeleporting = isLocked;
  }

  public get hasInitialized(): boolean {
    return this.initialized;
  }

  public set hasInitialized(value: boolean) {
    this.initialized = value;
  }

  public get isTeleporting(): boolean {
    return this._isTeleporting;
  }

  public getChunkSize(): number {
    return this.chunkSize;
  }

  public loadPriorityChunk(x: number, y: number): Promise<TerrainChunk | null> {
    return this.loadChunk(x, y, true);
  }

  public loadSurroundingChunksAsync(centerX: number, centerY: number): void {
    this.loadSurroundingChunks(centerX, centerY);
  }

  // Compatibility methods with old API
  public loadRemoteChunk(data: TerrainChunkDTO): void {
    const key = `${data.x}_${data.y}`;
    if (!this.loadedChunks.has(key)) {
      const chunk = new TerrainChunk(data.x, data.y, this.chunkSize, this.scene);
      chunk.applyNetworkData(data);
      this.loadedChunks.set(key, chunk);
    }
  }

  public unloadChunk(x: number, y: number): void {
    const key = `${x}_${y}`;
    if (this.loadedChunks.has(key)) {
      this.loadedChunks.get(key)?.dispose();
      this.loadedChunks.delete(key);
    }
  }

  public hasChunk(x: number, y: number): boolean {
    return this.loadedChunks.has(`${x}_${y}`);
  }

  public getActiveChunkCoordinates(): { x: number; y: number }[] {
    const coordinates: { x: number; y: number }[] = [];
    for (const [key] of this.loadedChunks.entries()) {
      const [x, y] = key.split('_').map(Number);
      coordinates.push({ x, y });
    }
    return coordinates;
  }

  public isChunkReady(x: number, y: number): boolean {
    const key = `${x}_${y}`;
    const chunk = this.loadedChunks.get(key);
    const mesh = chunk?.getMesh();

    if (!chunk || !mesh) return false;

    return !!(
      mesh.isReady() &&
      mesh.getTotalVertices() > 0 &&
      mesh.isVisible &&
      mesh.material?.isReady(mesh)
    );
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
      chunk.dispose();
      this.loadedChunks.delete(key);
    }

    console.warn(`Emergency cleanup complete: Removed ${chunksToRemove.length} chunks`);
  }

  /**
   * Get debug status information
   */
  public debugStatus(): {
    loadedChunks: number;
    loadingChunks: number;
    playerChunk: { x: number; y: number };
    chunks: string[];
  } {
    return {
      loadedChunks: this.loadedChunks.size,
      loadingChunks: this.loadingChunks.size,
      playerChunk: { x: this.lastPlayerChunkX, y: this.lastPlayerChunkY },
      chunks: Array.from(this.loadedChunks.keys()),
    };
  }

  /**
   * Toggle verbose logging
   */
  public setDebugVerbose(verbose: boolean): void {
    this.debugVerbose = verbose;
    console.log(`TerrainManager verbose logging ${verbose ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load only the most critical chunks first (current chunk and immediate neighbors)
   */
  private loadCriticalChunks(centerX: number, centerY: number): void {
    console.log(`Loading critical chunks around (${centerX}, ${centerY})`);

    // Load current chunk immediately
    this.loadChunk(centerX, centerY, true);

    // Load immediate neighbors with high priority but don't await them
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        // Skip center chunk (already loaded)
        if (dx === 0 && dy === 0) continue;

        const x = centerX + dx;
        const y = centerY + dy;

        // Skip invalid coordinates
        if (x < 0 || x >= 144 || y < 0 || y >= 72) continue;

        this.loadChunk(x, y, false);
      }
    }
  }

  public processChunkUpdate(message: { type: string; payload: any }): void {
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
}

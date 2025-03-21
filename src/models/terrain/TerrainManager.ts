import {
  Vector3,
  Mesh,
  Scene as BabylonScene,
  MeshBuilder,
  Color3,
  StandardMaterial,
  DynamicTexture,
} from '@babylonjs/core';
import TerrainChunk from './TerrainChunk';
import WorldManager from './WorldManager';

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
  LOD: number;
  heightmap: ArrayBuffer; // Compressed Int16Array
  textureSeed: number;
  noiseSeed: number;
  checksum: number;
}

export default class TerrainManager {
  public loadedChunks: Map<string, TerrainChunk>;
  private loadingChunks: Set<string>;
  private scene: BabylonScene;
  public chunkSize: number;
  private renderDistance: number;
  private lastChunkUpdate = 0;
  public _hasInitialized = false;
  public isTeleporting = false;
  public lockedLODs = new Map<string, number>();

  public get hasInitialized(): boolean {
    return this._hasInitialized;
  }

  /**
   * Lock terrain manager during teleportation to prevent automatic updates
   */
  public lockForTeleport(isLocked: boolean): void {
    this.isTeleporting = isLocked;
    if (!isLocked) {
      // Clear LOD locks when teleport is done
      this.lockedLODs.clear();
    }
  }

  /**
   * Lock a chunk's LOD to a specific level
   */
  public lockChunkLOD(x: number, y: number, lod: number): void {
    this.lockedLODs.set(`${x}_${y}`, lod);
  }

  constructor(scene: BabylonScene, chunkSize = 213, renderDistance = 1) {
    this.scene = scene;
    this.loadedChunks = new Map();
    this.loadingChunks = new Set();
    this.chunkSize = chunkSize;
    this.renderDistance = renderDistance;
  }

  public async initialize(
    globalPosition: Vector3 = WorldManager.getGlobalPlayerPosition()
  ): Promise<void> {
    console.log('Initializing terrain at global position:', globalPosition.toString());

    // Ensure we're using the correct global position
    WorldManager.setGlobalPlayerPosition(globalPosition);

    // Calculate chunk coordinates for logging
    const chunkX = Math.floor(globalPosition.x / this.chunkSize);
    const chunkY = Math.floor(globalPosition.z / this.chunkSize);
    console.log(`Initializing terrain around chunk coordinates (${chunkX}, ${chunkY})`);

    // Clear any existing chunks first to ensure clean state
    await this.clearAllChunks();

    // Load ONLY the center chunk at high resolution and wait for it to be ready
    const centerChunk = await this.loadPriorityChunk(chunkX, chunkY);

    if (centerChunk) {
      console.log('Center chunk loaded successfully at high resolution');

      // Start loading surrounding chunks in background, but don't wait for them
      setTimeout(() => {
        this.loadSurroundingChunksAsync(chunkX, chunkY);
      }, 500);
    } else {
      console.error('Failed to load center chunk - falling back to emergency terrain');
      // Emergency fallback - create a simple flat plane
      this.createEmergencyTerrain();
    }

    this._hasInitialized = true;
    console.log('Terrain initialization complete');
  }

  // Add a new emergency terrain method
  private createEmergencyTerrain(): void {
    console.warn('Creating emergency terrain at origin');
    const emergencyGround = MeshBuilder.CreateGround(
      'emergency_terrain',
      {
        width: this.chunkSize * 3,
        height: this.chunkSize * 3,
      },
      this.scene
    );

    const groundMat = new StandardMaterial('emergencyMat', this.scene);
    groundMat.diffuseColor = new Color3(0.8, 0.4, 0.3); // Mars-like color
    emergencyGround.material = groundMat;
    emergencyGround.checkCollisions = true;
    emergencyGround.isPickable = true;
  }

  public updateChunks(playerEnginePosition: Vector3): void {
    // Skip during teleportation
    if (this.isTeleporting) return;

    // Throttle updates to improve performance
    const now = Date.now();
    if (now - this.lastChunkUpdate < 1000) return;
    this.lastChunkUpdate = now;

    // Get player's global position
    const playerGlobalPos = WorldManager.getGlobalPlayerPosition();
    if (!isFinite(playerGlobalPos.x) || !isFinite(playerGlobalPos.z)) return;

    // Calculate player's chunk
    const playerChunkX = Math.floor(playerGlobalPos.x / this.chunkSize);
    const playerChunkY = Math.floor(playerGlobalPos.z / this.chunkSize);

    console.log(`Player is on chunk (${playerChunkX}, ${playerChunkY})`);

    // STEP 1: Focus on the current chunk first
    const centerKey = `${playerChunkX}_${playerChunkY}`;
    if (!this.loadedChunks.has(centerKey) && !this.loadingChunks.has(centerKey)) {
      // Load center chunk at HIGH QUALITY if not already loaded
      this.loadPriorityChunk(playerChunkX, playerChunkY);
    } else if (this.loadedChunks.has(centerKey)) {
      // If we have this chunk, make sure it's high quality
      const chunk = this.loadedChunks.get(centerKey)!;
      if (chunk.getCurrentLOD() > 0) {
        chunk.setLOD(0); // Highest quality
        chunk.regenerateWithCurrentLOD();
      }
    }

    // STEP 2: Load ONLY the immediate surrounding chunks (8 chunks)
    const surroundingCoords = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        // Skip center chunk (already handled)
        if (dx === 0 && dy === 0) continue;

        const x = playerChunkX + dx;
        const y = playerChunkY + dy;

        // Ensure valid coordinates
        if (x >= 0 && x < 144 && y >= 0 && y < 72) {
          surroundingCoords.push({ x, y });
        }
      }
    }

    // Load max 2 surrounding chunks per update to avoid framerate drops
    let loadedCount = 0;
    for (const { x, y } of surroundingCoords) {
      const key = `${x}_${y}`;
      if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
        if (loadedCount < 2) {
          this.loadChunk(x, y, 1); // Medium quality for adjacent chunks
          loadedCount++;
        }
      }
    }

    // STEP 3: Aggressively unload distant chunks
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const [x, y] = key.split('_').map(Number);
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));

      // Unload anything beyond immediate vicinity
      if (distance > 2) {
        console.log(`Unloading distant chunk at (${x}, ${y})`);
        chunk.dispose();
        this.loadedChunks.delete(key);
      }
    }
  }

  public async loadChunk(x: number, y: number, lod = 0): Promise<TerrainChunk | null> {
    // Validate chunk coordinates
    if (x < 0 || x >= 144 || y < 0 || y >= 72) {
      console.error(`Invalid chunk request: ${x},${y}`);
      return null;
    }

    const key = `${x}_${y}`;

    // Check if already loaded with better or same LOD
    if (this.loadedChunks.has(key)) {
      const existingChunk = this.loadedChunks.get(key)!;
      if (existingChunk.getCurrentLOD() <= lod) {
        return existingChunk; // Already loaded with better or equal quality
      }
      // Otherwise continue and upgrade it
    }

    // Check if being loaded
    if (this.loadingChunks.has(key)) {
      return null; // Already in progress
    }

    console.log(`Loading chunk (${x}, ${y}) with LOD ${lod}`);
    this.loadingChunks.add(key);

    try {
      // Check for existing mesh and dispose if needed
      const existingMesh = this.scene.getMeshByName(`terrain_chunk_${x}_${y}`);
      if (existingMesh) {
        console.log(`Found existing terrain mesh for chunk ${x},${y} - disposing`);
        if (existingMesh.material) existingMesh.material.dispose();
        existingMesh.dispose(true, true);
        this.loadedChunks.delete(key);
      }

      // Create the chunk with specified LOD
      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
      chunk.setLOD(lod);

      // Generate mesh
      await chunk.generate();

      // Position the chunk precisely
      const globalChunkPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);
      const enginePos = WorldManager.toEngine(globalChunkPos);
      chunk.setPosition(enginePos);

      // Add to loaded chunks map
      this.loadedChunks.set(key, chunk);

      // Ensure the mesh is in the scene
      const mesh = chunk.getMesh();
      if (mesh && !this.scene.meshes.includes(mesh)) {
        console.log(`Adding terrain mesh ${x},${y} to scene`);
        this.scene.addMesh(mesh);
      }

      return chunk;
    } catch (error) {
      console.error(`Error generating chunk ${x},${y}:`, error);
      return null;
    } finally {
      this.loadingChunks.delete(key);
    }
  }

  /**
   * Load the priority chunk (the one the player is currently on) at highest resolution
   */
  public async loadPriorityChunk(x: number, y: number): Promise<TerrainChunk | null> {
    // Validate coordinates
    const validX = Math.max(0, Math.min(143, x));
    const validY = Math.max(0, Math.min(71, y));

    const key = `${validX}_${validY}`;

    // If already loaded, just ensure LOD is high
    if (this.loadedChunks.has(key)) {
      const chunk = this.loadedChunks.get(key)!;
      if (chunk.updateLOD(Vector3.Zero())) {
        chunk.regenerateWithCurrentLOD();
      }
      return chunk;
    }

    // Otherwise load at highest resolution
    try {
      console.log(`Loading priority chunk at (${validX}, ${validY})`);

      // Create new chunk with high resolution (LOD 0)
      const chunk = new TerrainChunk(validX, validY, this.chunkSize, this.scene);
      chunk.setLOD(0); // Highest resolution

      // Generate mesh
      await chunk.generate();

      // Position properly
      const globalChunkPos = new Vector3(validX * this.chunkSize, 0, validY * this.chunkSize);
      const enginePos = WorldManager.toEngine(globalChunkPos);
      chunk.setPosition(enginePos);

      // Store in manager
      this.loadedChunks.set(key, chunk);

      return chunk;
    } catch (error) {
      console.error(`Failed to load priority chunk at (${validX}, ${validY}):`, error);
      return null;
    }
  }

  /**
   * Unload chunks that are too far from the player
   */
  private unloadDistantChunks(playerChunkX: number, playerChunkY: number): void {
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const [x, y] = key.split('_').map(Number);
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));

      if (distance > this.renderDistance + 1) {
        chunk.dispose();
        this.loadedChunks.delete(key);
      }
    }
  }

  private stitchChunkWithNeighbors(chunk: TerrainChunk, x: number, y: number): void {
    // Check for existing neighbors and stitch with them

    // Left neighbor
    const leftKey = `${x - 1}_${y}`;
    if (this.loadedChunks.has(leftKey)) {
      const leftNeighbor = this.loadedChunks.get(leftKey)!;
      chunk.stitchWithNeighbor(leftNeighbor, 'left');
      leftNeighbor.stitchWithNeighbor(chunk, 'right');
    }

    // Right neighbor
    const rightKey = `${x + 1}_${y}`;
    if (this.loadedChunks.has(rightKey)) {
      const rightNeighbor = this.loadedChunks.get(rightKey)!;
      chunk.stitchWithNeighbor(rightNeighbor, 'right');
      rightNeighbor.stitchWithNeighbor(chunk, 'left');
    }

    // Top neighbor
    const topKey = `${x}_${y - 1}`;
    if (this.loadedChunks.has(topKey)) {
      const topNeighbor = this.loadedChunks.get(topKey)!;
      chunk.stitchWithNeighbor(topNeighbor, 'top');
      topNeighbor.stitchWithNeighbor(chunk, 'bottom');
    }

    // Bottom neighbor
    const bottomKey = `${x}_${y + 1}`;
    if (this.loadedChunks.has(bottomKey)) {
      const bottomNeighbor = this.loadedChunks.get(bottomKey)!;
      chunk.stitchWithNeighbor(bottomNeighbor, 'bottom');
      bottomNeighbor.stitchWithNeighbor(chunk, 'top');
    }
  }

  // Add this method to prioritize loading the center chunk at high resolution
  public async loadCenterChunkHighRes(): Promise<TerrainChunk | null> {
    // Get player's global position
    const playerGlobalPos = WorldManager.getGlobalPlayerPosition();

    // Calculate chunk coordinates
    const chunkX = Math.floor(playerGlobalPos.x / this.chunkSize);
    const chunkY = Math.floor(playerGlobalPos.z / this.chunkSize);

    // Clamp to valid ranges
    const validChunkX = Math.max(0, Math.min(143, chunkX));
    const validChunkY = Math.max(0, Math.min(71, chunkY));

    const key = `${validChunkX}_${validChunkY}`;
    console.log(`Loading center chunk (${validChunkX}, ${validChunkY}) at high resolution`);

    try {
      // Create a new chunk with forced high resolution (LOD 0)
      const chunk = new TerrainChunk(validChunkX, validChunkY, this.chunkSize, this.scene);
      chunk.setLOD(0); // Force highest resolution

      // Generate the mesh
      await chunk.generate();

      // Calculate global position of chunk corner
      const globalChunkPos = new Vector3(
        validChunkX * this.chunkSize,
        0,
        validChunkY * this.chunkSize
      );

      // Convert to engine coordinates
      const enginePos = WorldManager.toEngine(globalChunkPos);

      // Position the chunk
      chunk.setPosition(enginePos);

      // Add to loaded chunks
      this.loadedChunks.set(key, chunk);

      // Ensure the mesh is actually in the scene
      const mesh = chunk.getMesh();
      if (mesh && !this.scene.meshes.includes(mesh)) {
        this.scene.addMesh(mesh);
      }

      // Wait for the mesh to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      console.log(`Center chunk loaded at (${validChunkX}, ${validChunkY}) at high resolution`);
      return chunk;
    } catch (e) {
      console.error('Failed to load center chunk:', e);
      return null;
    }
  }

  /**
   * Load surrounding chunks with optimized async loading strategy
   */
  public loadSurroundingChunksAsync(centerX: number, centerY: number): void {
    // Create a queue of chunks to load with distance-based LOD
    const chunkQueue: Array<{ x: number; y: number; lod: number; distance: number }> = [];

    // Add surrounding chunks with progressively lower detail
    for (let ring = 1; ring <= this.renderDistance; ring++) {
      // Calculate LOD based on ring (higher ring = lower detail)
      const lod = Math.min(ring, 3);

      // Add chunks in this ring
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          // Only add chunks that are exactly on this ring (not inside it)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) {
            const x = centerX + dx;
            const y = centerY + dy;

            // Validate chunk coordinates
            if (x >= 0 && x < 144 && y >= 0 && y < 72) {
              const key = `${x}_${y}`;

              // Skip if already loaded or loading
              if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
                chunkQueue.push({
                  x,
                  y,
                  lod,
                  distance: Math.max(Math.abs(dx), Math.abs(dy)),
                });
              }
            }
          }
        }
      }
    }

    // Sort queue by distance
    chunkQueue.sort((a, b) => a.distance - b.distance);

    // Process queue with limited concurrency
    let loading = 0;
    const maxConcurrent = 3;

    const processNext = () => {
      if (chunkQueue.length === 0 || loading >= maxConcurrent) return;

      const { x, y, lod } = chunkQueue.shift()!;
      loading++;

      // Start loading this chunk
      const key = `${x}_${y}`;
      this.loadingChunks.add(key);

      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
      chunk.setLOD(lod);

      chunk
        .generate()
        .then(() => {
          const globalPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);
          const enginePos = WorldManager.toEngine(globalPos);
          chunk.setPosition(enginePos);

          this.loadedChunks.set(key, chunk);
          this.loadingChunks.delete(key);

          loading--;
          processNext(); // Process next chunk
        })
        .catch((err) => {
          console.warn(`Failed to load chunk at (${x}, ${y}):`, err);
          this.loadingChunks.delete(key);
          loading--;
          processNext(); // Process next chunk
        });

      // Try to start another load if possible
      processNext();
    };

    // Start processing the queue
    for (let i = 0; i < maxConcurrent; i++) {
      processNext();
    }
  }

  public async waitForInitialChunks(): Promise<void> {
    // Get player's global position
    const playerGlobalPos = WorldManager.getGlobalPlayerPosition();
    console.log(`Generating initial chunks around global position ${playerGlobalPos.toString()}`);

    // Calculate chunk coordinates
    const playerChunkX = Math.floor(playerGlobalPos.x / this.chunkSize);
    const playerChunkY = Math.floor(playerGlobalPos.z / this.chunkSize);

    // Clamp to valid ranges (Mars is 144x72 patches)
    const validChunkX = Math.max(0, Math.min(143, playerChunkX));
    const validChunkY = Math.max(0, Math.min(71, playerChunkY));

    console.log(`Loading initial chunks around chunk (${validChunkX}, ${validChunkY})`);

    // First clear any existing chunks
    await this.clearAllChunks();

    // IMPORTANT CHANGE: Load ONLY the center chunk first
    console.log(`Loading center chunk at (${validChunkX}, ${validChunkY})`);
    const centerChunk = await this.loadPriorityChunk(validChunkX, validChunkY);

    if (!centerChunk) {
      console.error('Failed to load center chunk');
      // Create emergency terrain
      this.createEmergencyTerrain();
      return;
    }

    // Then start loading first ring of surrounding chunks asynchronously
    console.log('Now loading surrounding chunks with lower LOD');
    this.loadSurroundingChunksAsync(validChunkX, validChunkY);

    // Add debug marker at origin
    const centerMarker = MeshBuilder.CreateBox('centerMarker', { size: 15 }, this.scene);
    centerMarker.position = new Vector3(0, 20, 0); // Above origin
    const centerMat = new StandardMaterial('centerMat', this.scene);
    centerMat.diffuseColor = new Color3(1, 1, 0); // Yellow
    centerMat.emissiveColor = new Color3(0.5, 0.5, 0);
    centerMarker.material = centerMat;

    console.log('Added debug marker at origin (0,0,0)');

    // Wait just long enough for raycast to succeed, but don't wait for all chunks
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

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
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const [x, y] = key.split('_').map(Number);
      coordinates.push({ x, y });
    }
    return coordinates;
  }

  public isChunkReady(x: number, y: number): boolean {
    const key = `${x}_${y}`;
    const chunk = this.loadedChunks.get(key);
    const mesh = chunk?.getMesh();

    // More thorough check for mesh readiness
    if (!chunk || !mesh) return false;

    // Check if mesh has vertices and is fully ready
    const isFullyReady =
      mesh.isReady() &&
      mesh.getTotalVertices() > 0 &&
      mesh.isVisible &&
      mesh.material?.isReady(mesh);

    return isFullyReady || false;
  }

  private async loadNextChunks(chunks: { x: number; y: number }[], count: number): Promise<void> {
    const batch = chunks.slice(0, count);

    if (batch.length === 0) return;

    // Load chunks in parallel
    await Promise.all(batch.map((chunk) => this.loadChunk(chunk.x, chunk.y)));

    // Schedule next batch with small delay
    if (chunks.length > count) {
      setTimeout(() => {
        this.loadNextChunks(chunks.slice(count), count);
      }, 100);
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
   * Load surrounding chunks with explicit LOD control for teleportation
   */
  public loadSurroundingChunksWithLOD(centerX: number, centerY: number): void {
    console.log(`Loading surrounding chunks around (${centerX}, ${centerY}) with LOD control`);

    // Track chunks to load with their LODs
    const chunksToLoad: Array<{ x: number; y: number; lod: number }> = [];

    // Add surrounding chunks with different LODs based on distance
    for (let ring = 1; ring <= this.renderDistance; ring++) {
      // For each ring around the center, assign appropriate LOD
      // Ring 1 (adjacent) = LOD 1 (medium quality)
      // Ring 2 = LOD 2 (low quality)
      // Ring 3+ = LOD 3 (lowest quality)
      const ringLOD = Math.min(ring, 3);

      // Top and bottom rows of this ring
      for (let dx = -ring; dx <= ring; dx++) {
        // Top row
        const topX = centerX + dx;
        const topY = centerY - ring;

        // Bottom row
        const bottomX = centerX + dx;
        const bottomY = centerY + ring;

        // Add if within world bounds and not already loaded
        if (topX >= 0 && topX < 144 && topY >= 0 && topY < 72) {
          chunksToLoad.push({ x: topX, y: topY, lod: ringLOD });
        }

        if (
          bottomX >= 0 &&
          bottomX < 144 &&
          bottomY >= 0 &&
          bottomY < 72 &&
          !(bottomX === topX && bottomY === topY)
        ) {
          // Avoid duplicates
          chunksToLoad.push({ x: bottomX, y: bottomY, lod: ringLOD });
        }
      }

      // Left and right columns of this ring (excluding corners already added)
      for (let dy = -ring + 1; dy <= ring - 1; dy++) {
        // Left column
        const leftX = centerX - ring;
        const leftY = centerY + dy;

        // Right column
        const rightX = centerX + ring;
        const rightY = centerY + dy;

        // Add if within world bounds and not already loaded
        if (leftX >= 0 && leftX < 144 && leftY >= 0 && leftY < 72) {
          chunksToLoad.push({ x: leftX, y: leftY, lod: ringLOD });
        }

        if (
          rightX >= 0 &&
          rightX < 144 &&
          rightY >= 0 &&
          rightY < 72 &&
          !(rightX === leftX && rightY === leftY)
        ) {
          // Avoid duplicates
          chunksToLoad.push({ x: rightX, y: rightY, lod: ringLOD });
        }
      }
    }

    // Process chunks in small batches to avoid freezing
    const processBatch = async (startIndex: number, batchSize: number) => {
      const endIndex = Math.min(startIndex + batchSize, chunksToLoad.length);

      console.log(
        `Processing terrain batch ${startIndex}-${endIndex - 1} of ${chunksToLoad.length} chunks`
      );

      // Process this batch
      for (let i = startIndex; i < endIndex; i++) {
        const { x, y, lod } = chunksToLoad[i];

        // Skip if already loaded
        if (this.loadedChunks.has(`${x}_${y}`)) continue;

        try {
          // Create chunk with specific LOD
          const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
          chunk.setLOD(lod);

          // Lock this LOD
          this.lockChunkLOD(x, y, lod);

          // Generate the chunk
          await chunk.generate();

          // Calculate position
          const globalChunkPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);
          const enginePos = WorldManager.toEngine(globalChunkPos);
          chunk.setPosition(enginePos);

          // Add to loaded chunks
          this.loadedChunks.set(`${x}_${y}`, chunk);

          // Stitch with neighbors
          this.stitchChunkWithNeighbors(chunk, x, y);
        } catch (e) {
          console.warn(`Failed to load chunk at (${x}, ${y}):`, e);
        }
      }

      // Process next batch if more chunks remain
      if (endIndex < chunksToLoad.length) {
        setTimeout(() => {
          processBatch(endIndex, batchSize);
        }, 50); // Small delay between batches
      }
    };

    // Start processing with small batches
    processBatch(0, 3);
  }

  public async clearAllChunks(): Promise<void> {
    console.log('Clearing all terrain chunks');

    // Dispose all terrain meshes
    for (const [_, chunk] of this.loadedChunks.entries()) {
      chunk.dispose();
    }

    // Clear tracking collections
    this.loadedChunks.clear();
    this.loadingChunks.clear();
    this.lockedLODs.clear();

    // Reset update timestamp
    this.lastChunkUpdate = 0;

    // Small delay to allow for cleanup
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

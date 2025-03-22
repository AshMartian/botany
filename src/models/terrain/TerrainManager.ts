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
  public debugMode = false; // Enable for visualization

  public get hasInitialized(): boolean {
    return this._hasInitialized;
  }

  /**
   * Lock terrain manager during teleportation to prevent automatic updates
   */
  public lockForTeleport(isLocked: boolean): void {
    this.isTeleporting = isLocked;
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

    // Convert player's engine position to global position for chunk calculations
    const playerGlobalPos = WorldManager.toVirtual(playerEnginePosition);

    // Calculate player's chunk coordinates
    const playerChunkX = Math.floor(playerGlobalPos.x / this.chunkSize);
    const playerChunkY = Math.floor(playerGlobalPos.z / this.chunkSize);

    // Check if coordinates are valid
    if (
      !isFinite(playerChunkX) ||
      !isFinite(playerChunkY) ||
      playerChunkX < 0 ||
      playerChunkX >= 144 ||
      playerChunkY < 0 ||
      playerChunkY >= 72
    ) {
      console.warn('Invalid player chunk coordinates:', playerChunkX, playerChunkY);
      return;
    }

    // Throttle updates to avoid performance issues
    const now = Date.now();
    if (now - this.lastChunkUpdate < 1000) {
      // Skip if it's been less than 1 second since last update
      return;
    }
    this.lastChunkUpdate = now;

    console.log(`Player is on chunk (${playerChunkX}, ${playerChunkY})`);

    // STEP 1: Make sure center chunk exists at high quality
    const centerKey = `${playerChunkX}_${playerChunkY}`;
    if (!this.loadedChunks.has(centerKey) && !this.loadingChunks.has(centerKey)) {
      this.loadPriorityChunk(playerChunkX, playerChunkY);
    }

    // STEP 2: Load surrounding chunks (increase from 2 to 4 per update)
    const surroundingCoords = [];
    const chunkRadius = Math.min(this.renderDistance, 2); // At most 2 chunks in each direction

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
        // Skip center chunk (already handled)
        if (dx === 0 && dy === 0) continue;

        const x = playerChunkX + dx;
        const y = playerChunkY + dy;

        // Ensure valid coordinates
        if (x >= 0 && x < 144 && y >= 0 && y < 72) {
          surroundingCoords.push({
            x,
            y,
            priority: Math.max(Math.abs(dx), Math.abs(dy)), // Prioritize closer chunks
          });
        }
      }
    }

    // Sort by priority (closest first)
    surroundingCoords.sort((a, b) => a.priority - b.priority);

    // Load up to 4 chunks per update
    let loadedCount = 0;
    for (const { x, y } of surroundingCoords) {
      const key = `${x}_${y}`;
      if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
        if (loadedCount < 4) {
          this.loadChunk(x, y);
          loadedCount++;
        }
      }
    }

    // STEP 3: Unload distant chunks (increase distance threshold from 2 to 3)
    const maxDistance = Math.max(3, this.renderDistance + 1);
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const [x, y] = key.split('_').map(Number);
      const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));

      if (distance > maxDistance) {
        console.log(`Unloading distant chunk at (${x}, ${y}), distance: ${distance}`);
        chunk.dispose();
        this.loadedChunks.delete(key);
      }
    }

    // Update global player position to ensure future calculations are correct
    WorldManager.setGlobalPlayerPosition(playerGlobalPos);
  }

  public async loadChunk(x: number, y: number): Promise<TerrainChunk | null> {
    // Validate chunk coordinates
    if (x < 0 || x >= 144 || y < 0 || y >= 72) {
      console.error(`Invalid chunk request: ${x},${y}`);
      return null;
    }

    const key = `${x}_${y}`;

    // Check if being loaded
    if (this.loadingChunks.has(key)) {
      return null; // Already in progress
    }

    console.log(`Loading chunk (${x}, ${y})`);
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

      // Create the chunk
      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);

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

      // IMPORTANT: Stitch with neighboring chunks
      this.stitchChunkWithNeighbors(chunk, x, y);

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

    // Otherwise load at highest resolution
    try {
      console.log(`Loading priority chunk at (${validX}, ${validY})`);

      // Create new chunk
      const chunk = new TerrainChunk(validX, validY, this.chunkSize, this.scene);

      // Generate mesh
      await chunk.generate();

      // Position properly
      const globalChunkPos = new Vector3(validX * this.chunkSize, 0, validY * this.chunkSize);
      const enginePos = WorldManager.toEngine(globalChunkPos);
      chunk.setPosition(enginePos);

      // Store in manager
      this.loadedChunks.set(key, chunk);

      // IMPORTANT: Stitch with neighboring chunks
      this.stitchChunkWithNeighbors(chunk, validX, validY);

      return chunk;
    } catch (error) {
      console.error(`Failed to load priority chunk at (${validX}, ${validY}):`, error);
      return null;
    }
  }

  /**
   * Unload chunks that are too far from the player
   */
  // private unloadDistantChunks(playerChunkX: number, playerChunkY: number): void {
  //   for (const [key, chunk] of this.loadedChunks.entries()) {
  //     const [x, y] = key.split('_').map(Number);
  //     const distance = Math.max(Math.abs(x - playerChunkX), Math.abs(y - playerChunkY));

  //     if (distance > this.renderDistance + 1) {
  //       chunk.dispose();
  //       this.loadedChunks.delete(key);
  //     }
  //   }
  // }

  private stitchChunkWithNeighbors(chunk: TerrainChunk, x: number, y: number): void {
    console.log(`Checking neighbors for stitching chunk ${x},${y}`);
    return;
    // Debug visualization - uncomment to visualize edges
    // chunk.visualizeEdges();

    // let stitchedAny = false;

    // // Left neighbor (-X)
    // const leftKey = `${x - 1}_${y}`;
    // if (this.loadedChunks.has(leftKey)) {
    //   const leftNeighbor = this.loadedChunks.get(leftKey)!;
    //   console.log(`Stitching ${x},${y} with left neighbor at ${x - 1},${y}`);
    //   chunk.stitchWithNeighbor(leftNeighbor, 'left');
    //   leftNeighbor.stitchWithNeighbor(chunk, 'right');
    //   stitchedAny = true;
    // }

    // // Right neighbor (+X)
    // const rightKey = `${x + 1}_${y}`;
    // if (this.loadedChunks.has(rightKey)) {
    //   const rightNeighbor = this.loadedChunks.get(rightKey)!;
    //   console.log(`Stitching ${x},${y} with right neighbor at ${x + 1},${y}`);
    //   chunk.stitchWithNeighbor(rightNeighbor, 'right');
    //   rightNeighbor.stitchWithNeighbor(chunk, 'left');
    //   stitchedAny = true;
    // }

    // // Top neighbor (-Z)
    // const topKey = `${x}_${y - 1}`;
    // if (this.loadedChunks.has(topKey)) {
    //   const topNeighbor = this.loadedChunks.get(topKey)!;
    //   console.log(`Stitching ${x},${y} with top neighbor at ${x},${y - 1}`);
    //   chunk.stitchWithNeighbor(topNeighbor, 'top');
    //   topNeighbor.stitchWithNeighbor(chunk, 'bottom');
    //   stitchedAny = true;
    // }

    // // Bottom neighbor (+Z)
    // const bottomKey = `${x}_${y + 1}`;
    // if (this.loadedChunks.has(bottomKey)) {
    //   const bottomNeighbor = this.loadedChunks.get(bottomKey)!;
    //   console.log(`Stitching ${x},${y} with bottom neighbor at ${x},${y + 1}`);
    //   chunk.stitchWithNeighbor(bottomNeighbor, 'bottom');
    //   bottomNeighbor.stitchWithNeighbor(chunk, 'top');
    //   stitchedAny = true;
    // }

    // if (stitchedAny) {
    //   // After stitching is complete, force this chunk to refresh
    //   const mesh = chunk.getMesh();
    //   if (mesh) {
    //     mesh.refreshBoundingInfo();
    //     mesh.computeWorldMatrix(true);
    //   }
    // }
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
      // Create a new chunk
      const chunk = new TerrainChunk(validChunkX, validChunkY, this.chunkSize, this.scene);

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
    // Create a queue of chunks to load
    const chunkQueue: Array<{ x: number; y: number; distance: number }> = [];

    // Add surrounding chunks with progressively lower detail
    for (let ring = 1; ring <= this.renderDistance; ring++) {
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

      const { x, y } = chunkQueue.shift()!;
      loading++;

      // Start loading this chunk
      const key = `${x}_${y}`;
      this.loadingChunks.add(key);

      const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);

      chunk
        .generate()
        .then(() => {
          const globalPos = new Vector3(x * this.chunkSize, 0, y * this.chunkSize);
          const enginePos = WorldManager.toEngine(globalPos);
          chunk.setPosition(enginePos);

          this.loadedChunks.set(key, chunk);

          // IMPORTANT: Stitch with neighboring chunks
          this.stitchChunkWithNeighbors(chunk, x, y);

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
    this.loadSurroundingChunksAsync(validChunkX, validChunkY);

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

  public async clearAllChunks(): Promise<void> {
    console.log('Clearing all terrain chunks');

    // Dispose all terrain meshes
    for (const [_, chunk] of this.loadedChunks.entries()) {
      chunk.dispose();
    }

    // Clear tracking collections
    this.loadedChunks.clear();
    this.loadingChunks.clear();

    // Reset update timestamp
    this.lastChunkUpdate = 0;

    // Small delay to allow for cleanup
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

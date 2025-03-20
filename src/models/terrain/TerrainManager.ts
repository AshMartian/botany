import { Vector3, Mesh, Scene as BabylonScene } from "@babylonjs/core";
import TerrainChunk from "./TerrainChunk";
import WorldManager from "./WorldManager";

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
  private loadedChunks: Map<string, TerrainChunk>;
  private loadingChunks: Set<string>;
  private scene: BabylonScene;
  public chunkSize: number;
  private renderDistance: number;
  private lastChunkUpdate = 0;

  constructor(scene: BabylonScene, chunkSize = 71, renderDistance = 1) {
    this.scene = scene;
    this.loadedChunks = new Map();
    this.loadingChunks = new Set();
    this.chunkSize = chunkSize;
    this.renderDistance = renderDistance;
  }

  public async initialize(
    position: Vector3 = new Vector3(
      WorldManager.WORLD_WIDTH / 2,
      0,
      WorldManager.WORLD_HEIGHT / 2
    )
  ): Promise<void> {
    console.log("Initializing terrain at position:", position.toString());

    // Initialize world coordinate system
    WorldManager.initialize(position);

    // Initial terrain setup - load chunks around virtual position
    await this.waitForInitialChunks(position);

    // Update chunks after initialization
    this.updateChunks(WorldManager.toEngine(position));

    console.log("Terrain initialization complete");
  }

  public updateChunks(playerPosition: Vector3): void {
    // Add cooldown to prevent excessive updates
    const now = Date.now();
    if (now - this.lastChunkUpdate < 1000) return; // Increase to 1 second cooldown
    this.lastChunkUpdate = now;

    // Convert to virtual coordinates for chunk calculations
    const virtualPos = WorldManager.toVirtual(playerPosition);

    // Get current chunk coordinates
    const playerChunkX = Math.floor(virtualPos.x / this.chunkSize);
    const playerChunkY = Math.floor(virtualPos.z / this.chunkSize);

    // Update render distance based on performance
    const effectiveRenderDistance = 2; // Start with smaller render distance for stability

    // Create priority-ordered chunk loading queue
    const chunksToLoad = this.getChunksToLoad(playerChunkX, playerChunkY, effectiveRenderDistance);
    
    // Load just a few chunks at a time to maintain performance
    this.loadNextChunks(chunksToLoad, 2);
    
    // Unload distant chunks with wider buffer to prevent aggressive unloading
    for (const [key, chunk] of this.loadedChunks.entries()) {
      const [x, y] = key.split("_").map(Number);
      const unloadThreshold = effectiveRenderDistance * 3;
      if (
        x < playerChunkX - unloadThreshold ||
        x > playerChunkX + unloadThreshold ||
        y < playerChunkY - unloadThreshold ||
        y > playerChunkY + unloadThreshold
      ) {
        chunk.dispose();
        this.loadedChunks.delete(key);
      }
    }
  }

  public async loadChunk(x: number, y: number): Promise<void> {
    // Validate chunk coordinates
    if (x < 0 || x >= 72 || y < 0 || y >= 144) {
      console.error(`Invalid chunk request: ${x},${y}`);
      return;
    }

    const key = `${x}_${y}`;

    // Check if chunk is already loaded
    if (this.loadedChunks.has(key)) {
      return; // Chunk already exists, no need to reload
    }

    // Check if chunk is already being loaded
    if (!this.loadingChunks.has(key)) {
      this.loadingChunks.add(key);
      try {
        const chunk = new TerrainChunk(x, y, this.chunkSize, this.scene);
        this.loadedChunks.set(key, chunk);
        await chunk.generate();
      } catch (error) {
        console.error(`Error generating chunk ${x},${y}:`, error);
      } finally {
        this.loadingChunks.delete(key);
      }
    }
  }

  public async waitForInitialChunks(position: Vector3): Promise<void> {
    // Calculate chunk coordinates directly from virtual position
    const virtualPos = WorldManager.toVirtual(position);
    const playerChunkX = Math.floor(virtualPos.x / this.chunkSize);
    const playerChunkY = Math.floor(virtualPos.z / this.chunkSize);

    // Calculate maximum valid chunks
    const maxChunksX = 144; // WORLD_WIDTH (144*71) / chunkSize (71) = 144
    const maxChunksY = 72; // WORLD_HEIGHT (72*71) / chunkSize (71) = 72

    console.log(
      `Loading initial chunks around player chunk (${playerChunkX}, ${playerChunkY})`
    );

    // First load the exact chunk the player is on
    await this.loadChunk(playerChunkX, playerChunkY);

    // Then load surrounding chunks in a 5x5 grid
    const promises: Promise<void>[] = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        // Skip center chunk which was already loaded
        if (dx === 0 && dy === 0) continue;

        const chunkX = Math.max(0, Math.min(maxChunksX - 1, playerChunkX + dx));
        const chunkY = Math.max(0, Math.min(maxChunksY - 1, playerChunkY + dy));
        promises.push(this.loadChunk(chunkX, chunkY));
      }
    }
    await Promise.all(promises);

    console.log(
      "Initial chunks loaded:",
      this.getActiveChunkCoordinates().length
    );
  }

  public loadRemoteChunk(data: TerrainChunkDTO): void {
    const key = `${data.x}_${data.y}`;
    if (!this.loadedChunks.has(key)) {
      const chunk = new TerrainChunk(
        data.x,
        data.y,
        this.chunkSize,
        this.scene
      );
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
      const [x, y] = key.split("_").map(Number);
      coordinates.push({ x, y });
    }
    return coordinates;
  }

  public isChunkReady(x: number, y: number): boolean {
    const key = `${x}_${y}`;
    const chunk = this.loadedChunks.get(key);
    const mesh = chunk?.getMesh();
    return !!chunk && !!mesh && mesh.isReady();
  }
  
  private getChunksToLoad(centerX: number, centerY: number, distance: number): {x: number, y: number}[] {
    const result: {x: number, y: number}[] = [];
    
    // Add chunks in spiral pattern from center
    for (let layer = 0; layer <= distance; layer++) {
      if (layer === 0) {
        // Center chunk
        result.push({x: centerX, y: centerY});
      } else {
        // Add layer perimeter in clockwise order
        // Top edge (left to right)
        for (let dx = -layer; dx <= layer; dx++) {
          result.push({x: centerX + dx, y: centerY - layer});
        }
        
        // Right edge (top to bottom)
        for (let dy = -layer + 1; dy <= layer; dy++) {
          result.push({x: centerX + layer, y: centerY + dy});
        }
        
        // Bottom edge (right to left)
        for (let dx = layer - 1; dx >= -layer; dx--) {
          result.push({x: centerX + dx, y: centerY + layer});
        }
        
        // Left edge (bottom to top)
        for (let dy = layer - 1; dy >= -layer + 1; dy--) {
          result.push({x: centerX - layer, y: centerY + dy});
        }
      }
    }
    
    // Filter out invalid chunks
    return result.filter(({x, y}) => 
      x >= 0 && x < 72 && y >= 0 && y < 144 && 
      !this.loadedChunks.has(`${x}_${y}`) && 
      !this.loadingChunks.has(`${x}_${y}`)
    );
  }

  private async loadNextChunks(chunks: {x: number, y: number}[], count: number): Promise<void> {
    const batch = chunks.slice(0, count);
    
    if (batch.length === 0) return;
    
    // Load chunks in parallel
    await Promise.all(batch.map(chunk => this.loadChunk(chunk.x, chunk.y)));
    
    // Schedule next batch with small delay
    if (chunks.length > count) {
      setTimeout(() => {
        this.loadNextChunks(chunks.slice(count), count);
      }, 100);
    }
  }

  public processChunkUpdate(message: { type: string; payload: any }): void {
    if (message.type === "chunkData") {
      this.loadRemoteChunk(message.payload);
    } else if (message.type === "chunkUnload") {
      this.unloadChunk(message.payload.x, message.payload.y);
    }
  }
}

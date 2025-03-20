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

  constructor(scene: BabylonScene, chunkSize = 71, renderDistance = 4) {
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
    if (now - this.lastChunkUpdate < 500) return; // 500ms cooldown
    this.lastChunkUpdate = now;
    
    // Convert to virtual coordinates for chunk calculations
    const virtualPos = WorldManager.toVirtual(playerPosition);

    // Calculate chunk coordinates directly from virtual position
    const playerChunkX = Math.floor(virtualPos.x / this.chunkSize);
    const playerChunkY = Math.floor(virtualPos.z / this.chunkSize); // Use Z coordinate for Y-axis

    // Calculate maximum valid chunks
    const maxChunksX = 72; // Corrected: Mars is 72 patches wide (X)
    const maxChunksY = 144; // Corrected: Mars is 144 patches tall (Y)
    
    // Adjust render distance based on world scale, with proper limits
    const effectiveRenderDistance = Math.min(
      Math.max(4, Math.ceil(this.renderDistance)),
      8 // Max render distance
    );

    // Determine which chunks should be loaded
    const chunksToLoad: { x: number; y: number }[] = [];
    for (let dx = -effectiveRenderDistance; dx <= effectiveRenderDistance; dx++) {
      for (let dy = -effectiveRenderDistance; dy <= effectiveRenderDistance; dy++) {
        const chunkX = playerChunkX + dx;
        const chunkY = playerChunkY + dy;
        
        // Only add chunks within valid boundaries
        if (chunkX >= 0 && chunkX < maxChunksX && chunkY >= 0 && chunkY < maxChunksY) {
          const key = `${chunkX}_${chunkY}`;
          if (!this.loadedChunks.has(key) && !this.loadingChunks.has(key)) {
            chunksToLoad.push({ x: chunkX, y: chunkY });
          }
        }
      }
    }

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

    // Load new chunks with priority based on importance and distance
    chunksToLoad.sort((a, b) => {
      // Immediate 3x3 area first
      const inImmediateA = Math.abs(a.x - playerChunkX) <= 1 && Math.abs(a.y - playerChunkY) <= 1;
      const inImmediateB = Math.abs(b.x - playerChunkX) <= 1 && Math.abs(b.y - playerChunkY) <= 1;
      if (inImmediateA && !inImmediateB) return -1;
      if (!inImmediateA && inImmediateB) return 1;
      
      // Then prioritize by distance
      const distA = Math.hypot(a.x - playerChunkX, a.y - playerChunkY);
      const distB = Math.hypot(b.x - playerChunkX, b.y - playerChunkY);
      return distA - distB;
    });

    // Load chunks sequentially with proper delays to prevent frame drops
    const loadChunksSequentially = async () => {
      for (const chunk of chunksToLoad.slice(0, 5)) { // Process 5 at a time
        await this.loadChunk(chunk.x, chunk.y);
        await new Promise(resolve => setTimeout(resolve, 50)); // Add small delay
      }
      
      // If more chunks remain, schedule another update
      if (chunksToLoad.length > 5) {
        setTimeout(() => {
          this.updateChunks(playerPosition);
        }, 100);
      }
    };
    
    if (chunksToLoad.length > 0) {
      loadChunksSequentially();
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

    console.log(`Loading initial chunks around player chunk (${playerChunkX}, ${playerChunkY})`);

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
    
    console.log("Initial chunks loaded:", this.getActiveChunkCoordinates().length);
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

  public processChunkUpdate(message: { type: string; payload: any }): void {
    if (message.type === "chunkData") {
      this.loadRemoteChunk(message.payload);
    } else if (message.type === "chunkUnload") {
      this.unloadChunk(message.payload.x, message.payload.y);
    }
  }
}

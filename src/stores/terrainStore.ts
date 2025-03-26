// src/stores/terrainStore.ts
import { defineStore } from 'pinia';
import { openDB } from 'idb';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import alea from 'alea';
// Import all spawners dynamically
import * as spawners from '@/models/terrain/spawners';

// Database configuration
const DB_NAME = 'game-terrain';
const DB_VERSION = 1;
const STORE_NAME = 'terrain-chunks';

// Resource node structure
export interface ResourceNode {
  nodeId: string;
  type: string;
  quantity: number;
  x: number;
  y: number;
  z: number;
  mined: boolean;
  loose: boolean; // If true, the player can pick up directly without mining
}

// Per-vertex soil properties
export interface VertexProperties {
  nitrates: number;
  nutrients: number;
  moisture: number;
  phosphates: number;
  perchlorates: number;
  fungusGrowth: number;
  fertilizationStatus: number;
}

// Chunk data structure
export interface TerrainChunkData {
  chunkId: string; // Format: "x_y"
  width: number;
  height: number;
  defaultVertexData: VertexProperties;
  vertexData: Array<VertexProperties & { x: number; y: number }>; // Override data for specific vertices
  resourceNodes: ResourceNode[];
  updatedAt: string;
}

// State interface for terrain store
interface TerrainState {
  chunks: Record<string, TerrainChunkData>;
  lastUpdated: string;
}

// Helper functions for IndexedDB operations
async function saveToIndexedDB(chunkId: string, chunkData: TerrainChunkData) {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    await db.put(STORE_NAME, chunkData, chunkId);
  } catch (e) {
    console.warn('Failed to save terrain chunk to IndexedDB:', e);
  }
}

async function loadFromIndexedDB(chunkId: string): Promise<TerrainChunkData | null> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    const chunkData = await db.get(STORE_NAME, chunkId);
    return chunkData || null;
  } catch (e) {
    console.warn('Failed to load terrain chunk from IndexedDB:', e);
    return null;
  }
}

// Define the Pinia store
export const useTerrainStore = defineStore('terrain', {
  state: () =>
    ({
      chunks: {},
      lastUpdated: new Date().toISOString(),
    }) as TerrainState,

  getters: {
    allChunks: (state) => state.chunks,
    getChunkById: (state) => (chunkId: string) => state.chunks[chunkId],
    hasChunk: (state) => (chunkId: string) => !!state.chunks[chunkId],
    getResourceNodes: (state) => (chunkId: string) => {
      const chunk = state.chunks[chunkId];
      return chunk ? chunk.resourceNodes : [];
    },
    getUnminedResourceNodes: (state) => (chunkId: string) => {
      const chunk = state.chunks[chunkId];
      return chunk ? chunk.resourceNodes.filter((node) => !node.mined) : [];
    },
  },

  actions: {
    generateDefaultVertexProperties(seed: string): VertexProperties {
      const rng = alea(seed);

      return {
        nitrates: 0.1 + rng() * 0.05,
        nutrients: rng() * 0.05,
        moisture: 0.03 + rng() * 0.04,
        phosphates: 0.01 + rng() * 0.03,
        perchlorates: 70 + rng() * 60,
        fungusGrowth: 0,
        fertilizationStatus: 0, // Unfertilized initially
      };
    },

    // Initialize a new chunk with procedurally generated data
    async generateNewChunk(x: number, y: number): Promise<TerrainChunkData> {
      const chunkId = `${x}_${y}`;
      const seed = `mars_terrain_${x}_${y}`;
      const width = 128;
      const height = 128;

      // Create noise generators for resource placement
      const noise2D = createNoise2D(alea(`${seed}_resources`));
      const noise3D = createNoise3D(alea(`${seed}_deposits`));

      // Generate default properties for this chunk
      const defaultVertexProps = this.generateDefaultVertexProperties(seed);

      // Create an initial chunk with default vertex data
      const newChunk: TerrainChunkData = {
        chunkId,
        width,
        height,
        defaultVertexData: defaultVertexProps,
        vertexData: [], // Will store overrides for specific vertices
        resourceNodes: [],
        updatedAt: new Date().toISOString(),
      };

      // Get all spawner classes (excluding the base Spawner class)
      const spawnerClasses = Object.values(spawners).filter(
        (spawner) => typeof spawner === 'function' && spawner.name !== 'Spawner'
      );

      // Use the global scene from globalThis
      const scene = globalThis.scene;

      if (!scene) {
        console.warn('Scene not available, skipping resource generation');
        return newChunk;
      }

      // Instantiate each spawner and use it to generate resources
      for (const SpawnerClass of spawnerClasses) {
        try {
          const spawner = new SpawnerClass(scene);

          // Let the spawner generate resource nodes for this chunk
          const nodes = spawner.generateResourceNodes(x, y, width, height, seed, noise2D, noise3D);

          // Process each node - let spawners affect the terrain if needed
          for (const node of nodes) {
            // Allow the spawner to apply effects to terrain vertices
            spawner.applyResourceEffects(defaultVertexProps, node, width, height);

            // Add the node to the chunk's resource nodes
            newChunk.resourceNodes.push(node);
          }

          // Clean up the spawner when done
          spawner.dispose();
        } catch (error) {
          console.error(`Error with spawner ${SpawnerClass.name}:`, error);
        }
      }

      // Save the chunk to state
      this.chunks[chunkId] = newChunk;

      return newChunk;
    },

    /**
     * Get a specific resource node from a chunk
     */
    async getResourceNode(chunkId: string, nodeId: string): Promise<ResourceNode | null> {
      const chunk = this.chunks[chunkId];
      if (!chunk) {
        // Try loading from IndexedDB
        const loadedChunk = await loadFromIndexedDB(chunkId);
        if (!loadedChunk) return null;
        this.chunks[chunkId] = loadedChunk;
        return loadedChunk.resourceNodes.find((node) => node.nodeId === nodeId) || null;
      }
      return chunk.resourceNodes.find((node) => node.nodeId === nodeId) || null;
    },

    /**
     * Mark a resource node as mined
     */
    async mineResourceNode(chunkId: string, nodeId: string): Promise<void> {
      const chunk = this.chunks[chunkId];
      if (!chunk) return;

      const nodeIndex = chunk.resourceNodes.findIndex((node) => node.nodeId === nodeId);
      if (nodeIndex === -1) return;

      // Update the node
      chunk.resourceNodes[nodeIndex].mined = true;
      chunk.updatedAt = new Date().toISOString();
      this.lastUpdated = chunk.updatedAt;

      // Save to IndexedDB
      await saveToIndexedDB(chunkId, chunk);
    },

    /**
     * Update a resource node's properties
     */
    async updateResourceNode(
      chunkId: string,
      nodeId: string,
      updates: Partial<ResourceNode>
    ): Promise<void> {
      const chunk = this.chunks[chunkId];
      if (!chunk) return;

      const nodeIndex = chunk.resourceNodes.findIndex((node) => node.nodeId === nodeId);
      if (nodeIndex === -1) return;

      // Update the node
      chunk.resourceNodes[nodeIndex] = {
        ...chunk.resourceNodes[nodeIndex],
        ...updates,
      };
      chunk.updatedAt = new Date().toISOString();
      this.lastUpdated = chunk.updatedAt;

      // Save to IndexedDB
      await saveToIndexedDB(chunkId, chunk);
    },

    /**
     * Get an existing chunk or create a new one if it doesn't exist
     */
    async getOrCreateChunk(chunkX: number, chunkY: number): Promise<TerrainChunkData> {
      const chunkId = `${chunkX}_${chunkY}`;

      // Check memory cache first
      if (this.chunks[chunkId]) {
        return this.chunks[chunkId];
      }

      // Try loading from IndexedDB
      const loadedChunk = await loadFromIndexedDB(chunkId);
      if (loadedChunk) {
        this.chunks[chunkId] = loadedChunk;
        return loadedChunk;
      }

      // Generate new chunk if not found
      const newChunk = await this.generateNewChunk(chunkX, chunkY);
      await saveToIndexedDB(chunkId, newChunk);
      return newChunk;
    },

    /**
     * Update specific vertex data within a chunk
     */
    async updateVertexData(
      chunkId: string,
      x: number,
      y: number,
      properties: Partial<VertexProperties>
    ): Promise<void> {
      const chunk = this.chunks[chunkId];
      if (!chunk) return;

      // Find existing vertex data or create new
      const vertexIndex = chunk.vertexData.findIndex((v) => v.x === x && v.y === y);

      if (vertexIndex === -1) {
        // Create new vertex data with default properties
        const newVertex = {
          x,
          y,
          ...chunk.defaultVertexData,
          ...properties,
        };
        chunk.vertexData.push(newVertex);
      } else {
        // Update existing vertex data
        chunk.vertexData[vertexIndex] = {
          ...chunk.vertexData[vertexIndex],
          ...properties,
        };
      }

      // Update timestamp
      chunk.updatedAt = new Date().toISOString();
      this.lastUpdated = chunk.updatedAt;

      // Save to IndexedDB
      await saveToIndexedDB(chunkId, chunk);
    },

    /**
     * Get vertex data for a specific position in a chunk
     */
    getVertexData(chunkId: string, x: number, y: number): VertexProperties {
      const chunk = this.chunks[chunkId];
      if (!chunk) return this.generateDefaultVertexProperties(`${chunkId}_${x}_${y}`);

      // Find specific vertex data if it exists
      const vertexData = chunk.vertexData.find((v) => v.x === x && v.y === y);

      // Return vertex-specific data or chunk defaults
      return vertexData || chunk.defaultVertexData;
    },

    /**
     * Clear chunk data (useful for testing or resetting areas)
     */
    async clearChunkData(chunkId: string): Promise<void> {
      delete this.chunks[chunkId];

      try {
        const db = await openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          },
        });

        await db.delete(STORE_NAME, chunkId);
      } catch (error) {
        console.error('Failed to clear chunk data from IndexedDB:', error);
      }
    },
  },
});

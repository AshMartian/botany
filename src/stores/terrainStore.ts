// src/stores/terrainStore.ts
import { defineStore } from 'pinia';
import { openDB } from 'idb';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import alea from 'alea';
import { VertexData } from '@babylonjs/core';
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
  height: number; // Can be positive or negative to represent terrain height modifications
}

// Chunk data structure
export interface TerrainChunkData {
  chunkId: string; // Format: "x_y"
  width: number;
  height: number;
  defaultVertexData: VertexProperties;
  vertexData: Array<Partial<VertexProperties> & { x: number; y: number }>; // Override data for specific vertices
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

    // Create a clean, serializable copy for IndexedDB
    const cleanData = {
      ...chunkData,
      // Make sure defaultVertexData is just plain data
      defaultVertexData: { ...chunkData.defaultVertexData },
      // Clean up each vertex data entry
      vertexData: chunkData.vertexData.map((v) => ({ ...v })),
      // Clean up each resource node
      resourceNodes: chunkData.resourceNodes.map((r) => ({ ...r })),
    };

    await db.put(STORE_NAME, cleanData, chunkId);
  } catch (e) {
    console.error('Failed to save terrain chunk to IndexedDB:', e);
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
        height: 0, // Default height
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
      if (!chunk) {
        // Try to load from IndexedDB first
        const loadedChunk = await loadFromIndexedDB(chunkId);
        if (loadedChunk) {
          this.chunks[chunkId] = loadedChunk;
        } else {
          console.warn(`Cannot update vertex data: Chunk ${chunkId} not found`);
          return;
        }
      }

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
        console.log(`Created new vertex data at (${x},${y}) in chunk ${chunkId}`, properties);
      } else {
        // Update existing vertex data
        chunk.vertexData[vertexIndex] = {
          ...chunk.vertexData[vertexIndex],
          ...properties,
        };
        console.log(`Updated vertex data at (${x},${y}) in chunk ${chunkId}`, properties);
      }

      // Update timestamp
      chunk.updatedAt = new Date().toISOString();
      this.lastUpdated = chunk.updatedAt;

      // Immediately save to IndexedDB to prevent data loss
      await saveToIndexedDB(chunkId, chunk);

      // CRITICAL: Send an event to notify about this vertex update
      // This enables the TerrainChunk to immediately update the mesh
      const updateEvent = new CustomEvent('terrain-vertex-modified', {
        detail: {
          chunkId,
          x,
          y,
          properties,
        },
      });
      window.dispatchEvent(updateEvent);
    },

    /**
     * Get vertex data for a specific position in a chunk
     */
    getVertexData(chunkId: string, x: number, y: number): Partial<VertexProperties> {
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

    /**
     * Load and apply all stored height modifications for a chunk in one operation
     * Use this when initializing a terrain chunk to ensure all modifications are applied at once
     */
    async loadAndApplyChunkModifications(
      chunkX: number,
      chunkY: number,
      mesh: any
    ): Promise<number> {
      const chunkId = `${chunkX}_${chunkY}`;

      // First, ensure the chunk data is loaded from IndexedDB
      const chunk = await this.getOrCreateChunk(chunkX, chunkY);

      // If no vertex data is stored, nothing to apply
      if (!chunk || !chunk.vertexData || chunk.vertexData.length === 0) {
        return 0;
      }

      // If mesh is not provided or not valid, we can't apply changes
      if (!mesh || !mesh.getVerticesData) {
        console.warn(`Cannot apply height modifications to chunk ${chunkId}: invalid mesh`);
        return 0;
      }

      try {
        // Get mesh vertex positions
        const positions = mesh.getVerticesData('position');
        if (!positions) {
          console.warn(`Cannot apply height modifications to chunk ${chunkId}: no positions data`);
          return 0;
        }

        const vertexResolution = 128; // Default resolution for terrain chunks
        let modifiedCount = 0;

        // Apply all vertex modifications from the store in one go
        for (const vertex of chunk.vertexData) {
          if (typeof vertex.height === 'number' && vertex.height !== 0) {
            const x = vertex.x;
            const y = vertex.y;

            // Calculate index in the positions array
            const vertexIndex = (y * vertexResolution + x) * 3 + 1; // +1 for Y component

            // Validate index is within bounds
            if (vertexIndex < 0 || vertexIndex >= positions.length) {
              console.warn(`Invalid vertex index ${vertexIndex} for chunk ${chunkId}`);
              continue;
            }

            // Apply the stored height value - important: this is adding to the base height
            // not replacing it, to ensure consistent results
            positions[vertexIndex] += vertex.height;
            modifiedCount++;
          }
        }

        // Only update mesh if we actually modified vertices
        if (modifiedCount > 0) {
          // Update the mesh with all modified positions
          mesh.updateVerticesData('position', positions);

          // Update normals
          const indices = mesh.getIndices();
          if (indices) {
            const normals: number[] = [];
            // Use BabylonJS to recompute all normals
            VertexData.ComputeNormals(positions, indices, normals);
            mesh.updateVerticesData('normal', normals);
          }

          // Force mesh to update
          mesh.refreshBoundingInfo();
          mesh.computeWorldMatrix(true);

          console.log(`Applied ${modifiedCount} stored height modifications to chunk ${chunkId}`);
        }

        return modifiedCount;
      } catch (error) {
        console.error(`Error applying height modifications to chunk ${chunkId}:`, error);
        return 0;
      }
    },
  },
});

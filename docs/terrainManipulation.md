# Terrain Manipulation Implementation Notes

## Overview

This document details our implementation attempts at real-time terrain vertex manipulation. While the current implementation is being abandoned due to real-time update issues, the core concepts and methods provide valuable insights for future implementations.

## Architecture

The implementation was split across three main components:

1. **TerrainModificationManager**: Central singleton managing all terrain modifications
2. **TerrainStore**: Persistent storage and retrieval of terrain modifications
3. **TerrainChunk**: Individual chunk implementation with vertex manipulation

## Working Components

### 1. Terrain Store

The store successfully handled persistence of terrain modifications using IndexedDB:

```typescript
// From terrainStore.ts
async function saveToIndexedDB(chunkId: string, chunkData: TerrainChunkData) {
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    const cleanData = {
      ...chunkData,
      defaultVertexData: { ...chunkData.defaultVertexData },
      vertexData: chunkData.vertexData.map((v) => ({ ...v })),
      resourceNodes: chunkData.resourceNodes.map((r) => ({ ...r })),
    };

    await db.put(STORE_NAME, cleanData, chunkId);
  } catch (e) {
    console.error('Failed to save terrain chunk to IndexedDB:', e);
  }
}
```

### 2. Vertex Modification System

The modification manager handled centralized terrain changes:

```typescript
// From TerrainModificationManager.ts
export default class TerrainModificationManager {
  private static instance: TerrainModificationManager;
  private scene: BabylonScene | null = null;
  private pendingUpdates: Map<string, Map<number, number[]>> = new Map();
  private updateTimers: Map<string, number> = new Map();
  private modificationLocks: Map<string, boolean> = new Map();
  private isProcessing = false;
  private batchTimeoutMs = 50;
  private chunkSize = 512;
  private resolution = 128;

  public modifyTerrainAtPoint(
    chunkId: string,
    worldX: number,
    worldZ: number,
    radius: number,
    heightDelta: number
  ): void {
    // Convert world coordinates to local chunk coordinates
    const localX = Math.floor((worldX % this.chunkSize) * (this.resolution / this.chunkSize));
    const localZ = Math.floor((worldZ % this.chunkSize) * (this.resolution / this.resolution));

    this.modifyTerrainInRadius(chunkId, radius, localX, localZ, heightDelta);
  }
}
```

### 3. Storage Integration

The TerrainStore successfully managed vertex data updates and persistence:

```typescript
// From terrainStore.ts
async updateVertexData(
  chunkId: string,
  x: number,
  y: number,
  properties: Partial<VertexProperties>
): Promise<void> {
  const chunk = this.chunks[chunkId];
  if (!chunk) {
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
    const newVertex = {
      x,
      y,
      ...chunk.defaultVertexData,
      ...properties,
    };
    chunk.vertexData.push(newVertex);
  } else {
    chunk.vertexData[vertexIndex] = {
      ...chunk.vertexData[vertexIndex],
      ...properties,
    };
  }

  // Update timestamps and save
  chunk.updatedAt = new Date().toISOString();
  this.lastUpdated = chunk.updatedAt;
  await saveToIndexedDB(chunkId, chunk);

  // Dispatch update event
  const updateEvent = new CustomEvent('terrain-vertex-modified', {
    detail: { chunkId, x, y, properties },
  });
  window.dispatchEvent(updateEvent);
}
```

## Implementation Challenges

### 1. Real-Time Updates

The main issues occurred during real-time mesh updates:

```typescript
// Problematic implementation in TerrainChunk.ts
private async updateMesh(vertices: number[]): void {
  if (!this.mesh) return;

  try {
    // This caused performance issues with frequent updates
    const positions = this.mesh.getVerticesData('position');
    if (!positions) return;

    // Update positions
    for (let i = 0; i < vertices.length; i += 3) {
      const index = vertices[i];
      positions[index * 3 + 1] = vertices[i + 2]; // Y value
    }

    // These operations were too expensive for real-time updates
    this.mesh.updateVerticesData('position', positions);
    VertexData.ComputeNormals(positions, this.mesh.getIndices(), normals);
    this.mesh.updateVerticesData('normal', normals);

    // These calls caused additional performance overhead
    this.mesh.refreshBoundingInfo();
    this.mesh.computeWorldMatrix(true);
  } catch (error) {
    console.error('Failed to update mesh:', error);
  }
}
```

### 2. Concurrency Issues

The locking mechanism introduced to prevent concurrent updates caused delays:

```typescript
// From TerrainModificationManager.ts
private modificationLocks: Map<string, boolean> = new Map();

private async acquireLock(chunkId: string): Promise<boolean> {
  if (this.modificationLocks.get(chunkId)) {
    return false;
  }
  this.modificationLocks.set(chunkId, true);
  return true;
}
```

### 3. Batch Processing

The batching system helped but wasn't efficient enough for real-time modifications:

```typescript
// From TerrainModificationManager.ts
private processBatchUpdate(chunkId: string): void {
  if (this.isProcessing) return;
  this.isProcessing = true;

  const updates = this.pendingUpdates.get(chunkId);
  if (!updates) return;

  try {
    // Process all pending updates for the chunk
    // This still caused frame drops with large update batches
    updates.forEach((heightChanges, vertexIndex) => {
      // Apply height changes
      // Update normals
      // Refresh mesh
    });
  } finally {
    this.isProcessing = false;
    this.pendingUpdates.delete(chunkId);
  }
}
```

## Lessons Learned

### Performance Bottlenecks

1. **Mesh Updates**: Updating vertex data and recalculating normals was too expensive for real-time changes
2. **World Matrix Updates**: Frequent calls to `computeWorldMatrix` and `refreshBoundingInfo` caused performance issues
3. **Normal Recalculation**: Computing normals for the entire mesh on each update was inefficient

### Concurrency Management

1. **Lock Mechanism**: The locking system prevented corruption but introduced unacceptable delays
2. **Event Handling**: The event-based update system caused race conditions

### Data Management

1. **IndexedDB Storage**: Worked well for persistence but needed better batch handling
2. **Vertex Data Structure**: The data structure was efficient for storage but not for real-time updates

## Future Recommendations

1. **GPU-Based Updates**

   - Implement vertex modifications using compute shaders
   - Use vertex shader displacement maps for real-time height changes

2. **Optimized Batching**

   - Implement a spatial batching system
   - Use WebWorkers for background processing
   - Implement a priority queue for updates

3. **Alternative Approaches**

   - Consider using height map textures for modifications
   - Implement LOD system for modification resolution
   - Use geometry clipmaps for large-scale terrain changes

4. **Performance Optimizations**
   - Implement partial normal updates
   - Use local space modifications to reduce matrix computations
   - Implement vertex buffer streaming for updates

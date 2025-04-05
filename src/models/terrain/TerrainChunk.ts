import {
  Mesh,
  Vector3,
  VertexData,
  Scene as BabylonScene,
  StandardMaterial,
  Color3,
  MeshBuilder,
} from '@babylonjs/core';
import TerrainMaterial from './TerrainMaterial';
import { TerrainChunkDTO } from './TerrainManager';
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';
import { useTerrainStore } from '@/stores/terrainStore';
import TerrainProcGen from './TerrainProcGen';

export default class TerrainChunk {
  private mesh: Mesh | null = null;
  private x: number;
  private y: number;
  private size: number;
  private scene: BabylonScene;
  // private baseResolution = 512; // Maximum resolution
  private resolution = 128; // Maximum resolution

  private heightScale = 512;
  private noise: ReturnType<typeof createNoise2D>;
  private terrainStore = useTerrainStore();
  private static procGen: TerrainProcGen | null = null;

  constructor(x: number, y: number, size: number, scene: BabylonScene) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.scene = scene;

    // Initialize procedural generation system if needed
    if (!TerrainChunk.procGen) {
      TerrainChunk.procGen = new TerrainProcGen(scene);
    }

    // Create noise function with seeded noise
    this.noise = createNoise2D(alea(this.getSeed()));
  }

  private getSeed(): string {
    return `mars_${this.x}_${this.y}`;
  }

  public get key(): string {
    return `${this.x}_${this.y}`;
  }

  public getMesh(): Mesh | null {
    return this.mesh;
  }

  public async generate(): Promise<void> {
    // Create a new mesh for this chunk
    this.mesh = new Mesh(`terrain_chunk_${this.x}_${this.y}`, this.scene);
    // *** HIDE MESH INITIALLY ***
    this.mesh.isVisible = false;
    // Initially disable collisions/picking
    this.mesh.checkCollisions = false;
    this.mesh.isPickable = false;

    try {
      const heightmapData = await this.fetchHeightmapData();
      // createMeshFromHeightmap now applies vertex data and sets basic mesh properties
      await this.createMeshFromHeightmap(heightmapData);

      // Apply material and wait for it to be ready
      await this.applyTerrainMaterial(); // This now waits internally

      // --- Wait for Mesh and Material Readiness ---
      if (this.mesh && this.mesh.material) {
        const maxAttempts = 30; // 3 seconds total wait
        let attempts = 0;
        while (attempts < maxAttempts) {
          // Check mesh readiness (including submeshes) and material readiness
          if (this.mesh.isReady(true) && this.mesh.material.isReady(this.mesh)) {
            break; // Exit loop if ready
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        if (attempts >= maxAttempts) {
          console.warn(
            `Chunk ${this.key} mesh or material did not become ready after ${maxAttempts * 100}ms.`
          );
          // Throw an error to indicate failure
          throw new Error(`Chunk ${this.key} readiness timeout`);
        } else {
          // --- Enable Interaction ONLY when fully ready ---
          this.mesh.checkCollisions = true;
          this.mesh.isPickable = true;
          // Update metadata as well
          if (this.mesh.metadata) {
            this.mesh.metadata.isInteractable = true;
          }
          console.log(`Chunk ${this.key} mesh and material are ready. Collisions/Picking enabled.`);
        }
      } else {
        console.error(`Mesh or material missing after creation/application for chunk ${this.key}`);
        throw new Error(`Mesh or material missing for chunk ${this.key}`);
      }
      // --- End Readiness Wait ---
    } catch (error) {
      console.error(`Failed to generate chunk ${this.x}_${this.y}:`, error);
      // Dispose potentially partially created mesh on error
      this.dispose();
      throw error; // Re-throw error so caller knows generation failed
    }

    // Validate the mesh was created successfully and is ready
    if (this.mesh && this.isFullyReady()) {
      // *** DO NOT SET VISIBLE HERE ***
      // this.mesh.isVisible = true; // Visibility is handled by setPosition
      this.mesh.visibility = 1.0; // Keep visibility property at 1
      this.mesh.computeWorldMatrix(true); // Ensure matrix is up-to-date
    } else {
      console.error(
        `Failed to create or finalize mesh for chunk ${this.x},${this.y}. Mesh state:`,
        this.mesh
      );
      // Dispose if something went wrong after readiness checks
      this.dispose();
      throw new Error(`Mesh finalization failed for chunk ${this.key}`);
    }
  }

  private async fetchHeightmapData(): Promise<Float32Array> {
    // Validate chunk coordinates before fetching
    if (this.x < 0 || this.x >= 144 || this.y < 0 || this.y >= 72) {
      console.error(`Invalid chunk coordinates: ${this.x},${this.y}`);
      throw new Error(`Invalid chunk coordinates: ${this.x},${this.y}`); // Throw error
    }

    try {
      // IMPORTANT: Mars patches are referenced as patch_Z_X.raw where Z is vertical (0-71) and X is horizontal (0-143)
      // In our system, this.x is horizontal (0-143) and this.y is vertical (0-71)
      // So patch_Z_X.raw maps to patch_Y_X.raw in our system
      const url = `https://ashmartian.com/mars/patch_${this.y}_${this.x}.raw`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch heightmap: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      // Check if buffer is empty or too small
      if (buffer.byteLength < 100) {
        console.warn(
          `Heightmap data for chunk ${this.x},${this.y} is empty or too small (${buffer.byteLength} bytes)`
        );
        throw new Error('Empty heightmap data');
      }

      return this.parseHeightmapData(buffer);
    } catch (error) {
      console.error(`Failed to fetch/parse heightmap for chunk ${this.x},${this.y}:`, error);
      // Always throw to trigger procedural fallback or error handling in generate
      throw error;
    }
  }

  private parseHeightmapData(buffer: ArrayBuffer): Float32Array {
    // The raw heightmap data is 16-bit values (2 bytes per height)
    const bytes = new Uint8Array(buffer);
    const size = Math.sqrt(bytes.length / 2); // Calculate size from byte length

    // Create output array for the parsed heights
    const data = new Float32Array(size * size);

    // CRITICAL FIX: Parse data following the exact C# implementation
    // The key issue is ensuring our coordinate system matches the heightmap orientation
    let i = 0;

    // Note: In the C# implementation, Z goes from size-1 down to 0
    // This reverses the Z direction compared to a normal top-to-bottom read
    for (let z = size - 1; z >= 0; z--) {
      for (let x = 0; x < size; x++) {
        // Convert two bytes to a normalized height (0-1 range)
        // bytes[i+1] is the high byte, bytes[i] is the low byte
        const rawHeight = (bytes[i + 1] * 256 + bytes[i]) / 65535;

        // Validate height value
        if (!isFinite(rawHeight)) {
          console.warn(`Invalid height value at position ${x},${z}`);
          data[x + z * size] = 0;
        } else {
          data[x + z * size] = rawHeight;
        }

        i += 2; // Move to next 2-byte pair
      }
    }

    // Add debug logging for data range
    let min = 1,
      max = 0;
    for (let i = 0; i < data.length; i++) {
      min = Math.min(min, data[i]);
      max = Math.max(max, data[i]);
    }

    return data;
  }

  private async createMeshFromHeightmap(heightmapData: Float32Array): Promise<void> {
    if (!this.mesh) {
      console.error(`Missing mesh for chunk ${this.x},${this.y}`);
      return;
    }

    try {
      const positions: number[] = [];
      const indices: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];

      // Create vertices with exact spacing to ensure no gaps
      const spacing = this.size / (this.resolution - 1);

      // IMPORTANT: Match vertex creation with heightmap data orientation
      for (let z = 0; z < this.resolution; z++) {
        for (let x = 0; x < this.resolution; x++) {
          // Position in LOCAL space using exact multiples of spacing
          const localX = x * spacing;
          const localZ = z * spacing;

          // FIX: Get height from heightmap with correct Z-orientation
          // Use flipped Z coordinate to access heightmap data to match the parsing logic
          const heightIndex = (this.resolution - 1 - z) * this.resolution + x;
          let height = 0;

          if (heightIndex < heightmapData.length) {
            const rawHeight = heightmapData[heightIndex];
            // Apply proper height scaling
            height = isFinite(rawHeight) ? rawHeight * this.heightScale : 0;
          }

          // Add subtle noise for visual interest, but keep edges consistent
          const isEdgeVertex =
            x === 0 || x === this.resolution - 1 || z === 0 || z === this.resolution - 1;

          if (!isEdgeVertex) {
            // Get world position for consistent noise
            const worldX = this.x * this.size + localX;
            const worldZ = this.y * this.size + localZ;

            // Add subtle noise only to non-edge vertices
            const noiseValue = this.generateSimpleNoise(worldX, worldZ);
            height += noiseValue * 5; // Small variation of only 5 units
          }

          positions.push(localX, height, localZ);

          // UV coordinates
          uvs.push(x / (this.resolution - 1), z / (this.resolution - 1));
        }
      }

      // Create indices with consistent ordering
      for (let z = 0; z < this.resolution - 1; z++) {
        for (let x = 0; x < this.resolution - 1; x++) {
          const bottomLeft = z * this.resolution + x;
          const bottomRight = bottomLeft + 1;
          const topLeft = (z + 1) * this.resolution + x;
          const topRight = topLeft + 1;

          // Create triangles with consistent winding order
          indices.push(bottomLeft, bottomRight, topRight);
          indices.push(bottomLeft, topRight, topLeft);
        }
      }

      // Calculate normals
      VertexData.ComputeNormals(positions, indices, normals);

      // Apply vertex data to mesh
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.uvs = uvs;
      vertexData.applyToMesh(this.mesh);

      // Set basic mesh properties (interaction disabled initially)
      this.mesh.checkCollisions = false; // Disabled until fully ready in generate()
      this.mesh.isPickable = false; // Disabled until fully ready in generate()
      // *** ENSURE isVisible is false here too ***
      this.mesh.isVisible = false; // Ensure it starts hidden
      this.mesh.visibility = 1; // Keep visibility property at 1
      this.mesh.metadata = { isTerrainChunk: true, isInteractable: false }; // Mark as not interactable yet
      this.mesh.name = `terrain_chunk_${this.x}_${this.y}`;

      // Force updates
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
      this.mesh._updateBoundingInfo();
      // this.mesh.forceSharedVertices(); // Might not be needed/desirable

      // NO material application here - moved to applyTerrainMaterial
      // NO physics impostor setup here - handle elsewhere if needed

      // Debug visualization for development
      this.mesh.showBoundingBox = false;
      this.mesh.enablePointerMoveEvents = true; // Keep this if needed for other interactions

      // Ensure bounding info is properly computed after vertex data application
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
    } catch (error) {
      console.error(`Error creating terrain chunk mesh at ${this.x},${this.y}:`, error);
      throw error; // Re-throw to be caught by generate()
    }
  }

  // Simple consistent noise function for subtle terrain variation
  private generateSimpleNoise(x: number, z: number): number {
    // Use a very simple noise function
    const scale = 0.01; // Large scale for subtle variations
    return (Math.sin(x * scale) * Math.cos(z * scale) + 1) / 2; // 0 to 1 range
  }

  private async applyTerrainMaterial(): Promise<void> {
    if (!this.mesh) return;

    try {
      // Create the CustomMaterial using our updated class
      const customMaterial = TerrainMaterial.create(
        `terrain_material_${this.x}_${this.y}`,
        this.scene
      );

      // Set material properties
      customMaterial.specularColor = new Color3(0.2, 0.1, 0.05);
      customMaterial.ambientColor = new Color3(0.5, 0.5, 0.5);
      customMaterial.diffuseColor = new Color3(0.8, 0.6, 0.4);

      // Apply the material to the mesh
      this.mesh.material = customMaterial;

      // Ensure mesh receives shadows and casts them correctly
      if (globalThis.shadowGenerator) {
        this.mesh.receiveShadows = true; // Ensure this is true
        globalThis.shadowGenerator.addShadowCaster(this.mesh, true);
      }

      // --- Internal Wait for Material Readiness ---
      const meshRef = this.mesh; // Capture mesh reference
      const maxAttempts = 30; // 3 seconds
      let attempts = 0;
      while (attempts < maxAttempts) {
        if (customMaterial.isReady(meshRef)) {
          // Force compilation once ready
          await customMaterial.forceCompilationAsync(meshRef);
          console.log(`Material for chunk ${this.key} is ready.`);
          return; // Material is ready
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      console.warn(
        `Material for chunk ${this.key} did not become ready after ${maxAttempts * 100}ms.`
      );
      // Throw error if material doesn't become ready
      throw new Error(`Material readiness timeout for chunk ${this.key}`);
    } catch (error) {
      console.error(`Error applying material to chunk ${this.x},${this.y}:`, error);
      // Create a fallback material if custom material fails
      if (this.mesh) {
        // Check mesh still exists
        const fallbackMaterial = new StandardMaterial(
          `terrain_fallback_${this.x}_${this.y}`,
          this.scene
        );
        fallbackMaterial.diffuseColor = new Color3(0.8, 0.6, 0.4);
        fallbackMaterial.specularColor = new Color3(0.2, 0.1, 0.05);
        this.mesh.material = fallbackMaterial;
        // Consider if fallback needs a readiness check/wait too, or just assume it's ready
      }
      // Re-throw the error so generate() knows something went wrong
      throw error;
    }
  }

  public applyNetworkData(data: TerrainChunkDTO): void {
    // Convert ArrayBuffer to Float32Array
    const heightmapData = new Float32Array(data.heightmap);

    // Create mesh using the received data
    // Note: This assumes applyNetworkData is called *instead* of generate.
    // If it needs to integrate with the new generate flow, this needs adjustment.
    // For now, keep it simple, but it won't have the readiness checks of generate().
    this.createMeshFromHeightmap(heightmapData);
    // Potentially apply a default/network material here too.
  }

  /**
   * Set position of the terrain chunk AND make it visible
   */
  public setPosition(position: Vector3): void {
    if (this.mesh) {
      // Check if we already have this position (to avoid redundant updates)
      if (this.mesh.position && this.mesh.position.equalsWithEpsilon(position, 0.001)) {
        // If already at position, ensure it's visible (in case it was hidden before)
        if (!this.mesh.isVisible) {
          this.mesh.isVisible = true;
          console.log(`Chunk ${this.key} was already at position, made visible.`);
        }
        return;
      }

      this.mesh.position = position.clone();

      // Ensure bounding info is updated after position change
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();

      // *** SHOW MESH AFTER POSITIONING ***
      this.mesh.isVisible = true;
      console.log(`Chunk ${this.key} positioned and made visible.`);
    }
  }

  public dispose(): void {
    // Clean up any resources for this chunk
    if (TerrainChunk.procGen) {
      TerrainChunk.procGen.cleanupChunk(this.x, this.y);
    }

    if (this.mesh) {
      // Remove from shadow generator if added
      if (globalThis.shadowGenerator) {
        globalThis.shadowGenerator.removeShadowCaster(this.mesh, true);
      }
      // Dispose material first
      if (this.mesh.material) {
        this.mesh.material.dispose();
      }
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  // Simplified synchronous check
  public isFullyReady(): boolean {
    // Check if mesh exists, is ready (incl. submeshes), has vertices,
    // material exists and is ready, and interaction flags are enabled.
    return !!(
      this.mesh &&
      this.mesh.isReady(true) && // Use true to check submeshes too
      this.mesh.getTotalVertices() > 0 &&
      this.mesh.material?.isReady(this.mesh) &&
      this.mesh.checkCollisions === true && // Check if collisions were enabled
      this.mesh.isPickable === true // Check if picking was enabled
    );
  }

  private setupMeshProperties(mesh: Mesh): void {
    // This method seems redundant now as properties are set in createMeshFromHeightmap and generate
    if (!mesh) return;
    // Initial setup is handled elsewhere
  }

  public visualizeChunkBoundaries(): void {
    if (!this.mesh) return;

    // Create lines to show chunk boundaries for debugging
    const size = this.size;
    const linePoints = [
      new Vector3(0, 10, 0),
      new Vector3(size, 10, 0),
      new Vector3(size, 10, size),
      new Vector3(0, 10, size),
      new Vector3(0, 10, 0),
    ];

    // Check if boundary lines already exist
    const existingLines = this.scene.getMeshByName(`chunk_boundary_${this.x}_${this.y}`);
    if (existingLines) {
      existingLines.dispose();
    }

    const lines = MeshBuilder.CreateLines(
      `chunk_boundary_${this.x}_${this.y}`,
      { points: linePoints },
      this.scene
    );

    // Make lines bright and visible
    lines.color = new Color3(1, 0.4, 0.4);

    // Parent to mesh so it moves with the chunk
    lines.parent = this.mesh;
  }

  public useSimpleMaterial(): void {
    if (!this.mesh) return;

    // Create a simple material for testing
    const material = new StandardMaterial(`simple_${this.x}_${this.y}`, this.scene);
    material.diffuseColor = new Color3(0.8, 0.6, 0.4); // Mars-like color
    material.wireframe = false;

    // Replace shader material temporarily
    const oldMaterial = this.mesh.material;
    this.mesh.material = material;

    // Dispose old material to prevent memory leaks
    if (oldMaterial && oldMaterial !== material) {
      oldMaterial.dispose();
    }
  }
}

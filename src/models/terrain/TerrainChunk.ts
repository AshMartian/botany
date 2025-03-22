import {
  Mesh,
  Vector3,
  VertexData,
  Scene as BabylonScene,
  StandardMaterial,
  Color3,
  MeshBuilder,
  ShadowDepthWrapper,
} from '@babylonjs/core';
import TerrainMaterial from './TerrainMaterial';
import { TerrainChunkDTO } from './TerrainManager';
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';

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

  constructor(x: number, y: number, size: number, scene: BabylonScene) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.scene = scene;
    // Create noise function with default seed
    // For seeded noise, you would need to add 'alea' package and use:
    //
    this.noise = createNoise2D(alea(this.getSeed()));
    // this.noise = createNoise2D();
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

    try {
      // console.log(`Generating chunk ${this.x}_${this.y}`);
      // Fetch heightmap data from the server
      const heightmapData = await this.fetchHeightmapData();
      this.createMeshFromHeightmap(heightmapData);
      // console.log(`Chunk ${this.x}_${this.y} created successfully`);
    } catch (error) {
      console.error(`Failed to load heightmap for chunk ${this.x}_${this.y}:`, error);
    }

    // Validate the mesh was created successfully
    if (this.mesh) {
      // Add explicit visibility check
      this.mesh.isVisible = true;
      this.mesh.visibility = 1.0;

      // Force compute world matrix
      this.mesh.computeWorldMatrix(true);
    } else {
      console.error(`Failed to create mesh for chunk ${this.x},${this.y}`);
    }
  }

  private async fetchHeightmapData(): Promise<Float32Array> {
    // Validate chunk coordinates before fetching
    if (this.x < 0 || this.x >= 144 || this.y < 0 || this.y >= 72) {
      console.error(`Invalid chunk coordinates: ${this.x},${this.y}`);
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
      // Always throw to trigger procedural fallback
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

  private createMeshFromHeightmap(heightmapData: Float32Array): void {
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

      // Add physics and visibility properties
      this.mesh.checkCollisions = true;
      this.mesh.isPickable = true;
      this.mesh.isVisible = true;
      this.mesh.visibility = 1;
      this.mesh.receiveShadows = true;
      // this.mesh.doNotSyncBoundingInfo = false;
      this.mesh.metadata = { isTerrainChunk: true, isInteractable: true };
      // Set name for shadow system to identify terrain chunks
      this.mesh.name = `terrain_chunk_${this.x}_${this.y}`;

      // Force updates to ensure proper rendering
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
      this.mesh._updateBoundingInfo();
      this.mesh.forceSharedVertices();

      // Set pickability for physics system
      const physicsEngine = this.scene.getPhysicsEngine();
      if (physicsEngine && this.mesh.physicsImpostor) {
        this.mesh.physicsImpostor.forceUpdate();
      }

      // Debug visualization for development
      this.mesh.showBoundingBox = false;
      this.mesh.enablePointerMoveEvents = true;

      // Apply the shader material
      this.applyTerrainMaterial();

      // Ensure bounding info is properly computed
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
    } catch (error) {
      console.error(`Error creating terrain chunk mesh at ${this.x},${this.y}:`, error);
    }
  }

  // Simple consistent noise function for subtle terrain variation
  private generateSimpleNoise(x: number, z: number): number {
    // Use a very simple noise function
    const scale = 0.01; // Large scale for subtle variations
    return (Math.sin(x * scale) * Math.cos(z * scale) + 1) / 2; // 0 to 1 range
  }

  private applyTerrainMaterial(): void {
    if (!this.mesh) return;

    // Create the material using our new class
    const shaderMaterial = TerrainMaterial.create(
      `terrain_material_${this.x}_${this.y}`,
      this.scene,
      globalThis.shadowGenerator
    );

    // Update time parameter for potential animation effects
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      shaderMaterial.setFloat('time', this.scene.getEngine().getDeltaTime() / 1000);

      // Keep shadow matrix updated
      if (globalThis.shadowGenerator) {
        shaderMaterial.setMatrix('lightMatrix', globalThis.shadowGenerator.getTransformMatrix());
      }
    });

    // Store the observer for proper cleanup
    shaderMaterial.onDisposeObservable.add(() => {
      this.scene.onBeforeRenderObservable.remove(observer);
    });

    // Apply the material to the mesh
    this.mesh.material = shaderMaterial;

    // Enable mesh to receive shadows properly
    if (globalThis.shadowGenerator && this.mesh) {
      // REMOVED: ShadowDepthWrapper usage as it requires specific shader variables

      // Enable mesh to receive shadows
      this.mesh.receiveShadows = true;

      // Make sure this mesh is in the shadow caster list
      // Only add as shadow caster, not receiver (to prevent self-shadowing)
      globalThis.shadowGenerator.addShadowCaster(this.mesh, true);
    }
  }

  public applyNetworkData(data: TerrainChunkDTO): void {
    // Convert ArrayBuffer to Float32Array
    const heightmapData = new Float32Array(data.heightmap);

    // Create mesh using the received data
    this.createMeshFromHeightmap(heightmapData);
  }

  /**
   * Set position of the terrain chunk
   */
  public setPosition(position: Vector3): void {
    if (this.mesh) {
      // Check if we already have this position (to avoid redundant updates)
      if (this.mesh.position && this.mesh.position.equalsWithEpsilon(position, 0.001)) {
        console.log(`Terrain chunk ${this.x},${this.y} already at position ${position.toString()}`);
        return;
      }

      this.mesh.position = position.clone();

      // Ensure bounding info is updated
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
    }
  }

  public dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  // Add this method to check if the mesh is fully ready for raycasting
  public isFullyReady(): boolean {
    const mesh = this.getMesh();
    return !!(
      mesh &&
      mesh.isReady() &&
      mesh.getTotalVertices() > 0 &&
      mesh.computeWorldMatrix(true)
    );
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
    if (oldMaterial) {
      oldMaterial.dispose();
    }
  }
}

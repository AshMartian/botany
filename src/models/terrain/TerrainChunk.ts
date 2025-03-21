import {
  Mesh,
  Vector3,
  VertexData,
  Scene as BabylonScene,
  StandardMaterial,
  Texture,
  Color3,
  ShaderMaterial,
  Effect,
} from '@babylonjs/core';
import { TerrainChunkDTO } from './TerrainManager';
import { createNoise2D } from 'simplex-noise';
import WorldManager from './WorldManager';
import alea from 'alea';

export default class TerrainChunk {
  private mesh: Mesh | null = null;
  private x: number;
  private y: number;
  private size: number;
  private scene: BabylonScene;
  // private baseResolution = 512; // Maximum resolution
  private baseResolution = 128; // Maximum resolution

  private currentLOD = 0; // 0 = highest quality
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

  // Calculate resolution based on LOD level
  private getResolution(): number {
    // Calculate resolution based on LOD level (0=full, 1=half, 2=quarter, etc.)
    const divisor = Math.pow(2, this.currentLOD);
    return Math.max(64, this.baseResolution / divisor); // Minimum 64 vertices
  }

  // Use dynamic resolution based on LOD
  get resolution(): number {
    return this.getResolution();
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
      // Generate procedural fallback
      this.createProceduralMesh();
      console.error(`Chunk ${this.x}_${this.y} created with procedural fallback`, error);
    }
  }

  private async fetchHeightmapData(): Promise<Float32Array> {
    // Validate chunk coordinates before fetching
    if (this.x < 0 || this.x >= 144 || this.y < 0 || this.y >= 72) {
      console.error(`Invalid chunk coordinates: ${this.x},${this.y}`);
    }

    try {
      // Use correct coordinate order in URL
      // Mars patches are referenced as patch_Z_X.raw where Z is vertical (0-71) and X is horizontal (0-143)
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

    // Parse the data following the C# implementation
    let i = 0;
    // Note the flipped Z order (from size-1 to 0) matching the C# implementation
    for (let z = size - 1; z >= 0; z--) {
      for (let x = 0; x < size; x++) {
        // Convert two bytes to a normalized height (0-1 range)
        // This is the critical formula from the C# code
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

      // Create vertices with exact spacing to avoid gaps
      const spacing = this.size / (this.resolution - 1);

      for (let z = 0; z < this.resolution; z++) {
        for (let x = 0; x < this.resolution; x++) {
          // Position in LOCAL space using exact integer multiples
          const localX = x * spacing;
          const localZ = z * spacing;

          // Get height from heightmap with validation
          const heightIndex = z * this.resolution + x;
          let height = 0;

          if (heightIndex < heightmapData.length) {
            const rawHeight = heightmapData[heightIndex];
            // Apply proper height scaling to match the C# implementation
            // Scale normalized height (0-1) to terrain height range
            height = isFinite(rawHeight) ? rawHeight * this.heightScale : 0;
          }

          // Check if this is an edge vertex - no noise at edges
          // const isEdgeVertex =
          //   x === 0 || x === this.resolution - 1 || z === 0 || z === this.resolution - 1;

          // if (!isEdgeVertex) {
          //   // Add very subtle noise, just 1-3 units of height variation
          //   // Ensure consistent noise across chunk boundaries
          //   const worldX = this.x * this.size + localX;
          //   const worldZ = this.y * this.size + localZ;

          //   // Consistent but subtle noise
          //   const noiseValue = this.generateSimpleNoise(worldX, worldZ);
          //   height += noiseValue * 20; // Just 0-20 units of variation
          // }

          positions.push(localX, height, localZ);

          // UV coordinates
          uvs.push(x / (this.resolution - 1), z / (this.resolution - 1));
        }
      }

      // Create indices for triangles
      for (let z = 0; z < this.resolution - 1; z++) {
        for (let x = 0; x < this.resolution - 1; x++) {
          const bottomLeft = z * this.resolution + x;
          const bottomRight = bottomLeft + 1;
          const topLeft = (z + 1) * this.resolution + x;
          const topRight = topLeft + 1;

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

      // LOG AFTER VERTICES ARE APPLIED, not before
      console.log(
        `Created terrain chunk ${this.x},${this.y} with ${this.mesh.getTotalVertices()} vertices`
      );

      // Validate mesh creation
      if (!this.mesh.getTotalVertices()) {
        console.error(`Failed to create terrain mesh for chunk ${this.x},${this.y} - no vertices`);
        this.mesh.dispose();
        return;
      }

      // Add collision properties with enhanced settings
      this.mesh.checkCollisions = true;
      this.mesh.isPickable = true;
      this.mesh.isVisible = true; // Ensure mesh is visible
      this.mesh.visibility = 1;
      this.mesh.receiveShadows = true;
      this.mesh.doNotSyncBoundingInfo = false; // Ensure bounding info is synchronized

      // Force a bounding box update with proper world matrix
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
      this.mesh._updateBoundingInfo();

      // Force the mesh to rebuild itself
      this.mesh.forceSharedVertices();

      // Set pickability for physics system
      const physicsEngine = this.scene.getPhysicsEngine();
      if (physicsEngine) {
        // If using physics, update imposter if available
        if (this.mesh.physicsImpostor) {
          this.mesh.physicsImpostor.forceUpdate();
        }
      }

      // Debug visualization for development
      this.mesh.showBoundingBox = false;
      this.mesh.enablePointerMoveEvents = true;

      // Apply proper terrain material instead of wireframe
      this.applyTerrainMaterial();

      // Ensure bounding info is properly computed
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();

      // Log successful mesh creation with details
      console.log(`Terrain chunk ${this.x},${this.y} created successfully:
        - Vertices: ${this.mesh.getTotalVertices()}
        - Position: ${this.mesh.position.toString()}
        - Visibility: ${this.mesh.isVisible}
        - Material: ${this.mesh.material ? 'Applied' : 'Missing'}`);
    } catch (error) {
      console.error(`Error creating terrain chunk mesh at ${this.x},${this.y}:`, error);
    }
  }

  private createProceduralMesh(): void {
    if (!this.mesh) return;

    console.log(
      `Creating procedural mesh for chunk ${this.x},${this.y} due to missing heightmap data`
    );

    // Calculate chunk position in virtual space
    const virtualPosition = new Vector3(this.x * this.size, 0, this.y * this.size);

    // Convert to engine coordinates
    const enginePosition = WorldManager.toEngine(virtualPosition);

    // Set mesh position in engine space
    this.mesh.position = enginePosition;

    // Add collision properties
    this.mesh.checkCollisions = true;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = true;

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create vertices with more distinctive terrain features for better visibility
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        // Position in local space
        const localX = (x / (this.resolution - 1)) * this.size;
        const localZ = (z / (this.resolution - 1)) * this.size;

        // Calculate world position for height generation
        const worldX = this.x * this.size + localX;
        const worldZ = this.y * this.size + localZ;

        // Generate procedural height with more variation
        const height = this.generateProceduralHeight(worldX, worldZ);

        positions.push(localX, height, localZ);

        // UV coordinates
        uvs.push(x / (this.resolution - 1), z / (this.resolution - 1));
      }
    }

    // Create indices for triangles (same as in createMeshFromHeightmap)
    for (let z = 0; z < this.resolution - 1; z++) {
      for (let x = 0; x < this.resolution - 1; x++) {
        const bottomLeft = z * this.resolution + x;
        const bottomRight = bottomLeft + 1;
        const topLeft = (z + 1) * this.resolution + x;
        const topRight = topLeft + 1;

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

    // Verify the mesh has vertices
    if (this.mesh.getTotalVertices() === 0) {
      console.error(
        `Failed to create procedural mesh for chunk ${this.x},${this.y} - still has 0 vertices`
      );
    } else {
      console.log(
        `Successfully created procedural mesh for chunk ${this.x},${
          this.y
        } with ${this.mesh.getTotalVertices()} vertices`
      );
    }

    // Apply material
    this.applyTerrainMaterial();

    // Ensure bounding info is computed properly
    this.mesh.computeWorldMatrix(true);
    this.mesh.refreshBoundingInfo();
  }

  private generateProceduralHeight(x: number, z: number): number {
    // Create more interesting procedural terrain with multiple noise frequencies
    let height = 0;
    let amplitude = this.heightScale * 0.7; // Increased amplitude for more dramatic terrain
    let frequency = 0.0005;

    // Base terrain shape - larger features
    height += this.noise(x * frequency, z * frequency) * amplitude;

    // Add medium details
    amplitude *= 0.5;
    frequency *= 2;
    height += this.noise(x * frequency, z * frequency) * amplitude;

    // Add fine details
    amplitude *= 0.5;
    frequency *= 2;
    height += this.noise(x * frequency, z * frequency) * amplitude;

    // Add some occasional hills/features - more dramatic and frequent
    if (this.noise(x * 0.01, z * 0.01) > 0.6) {
      // Lower threshold for more features
      height += 100 * Math.abs(this.noise(x * 0.05, z * 0.05)); // Larger amplitude
    }

    // Add some crater-like depressions
    // if (this.noise(x * 0.008, z * 0.008) < -0.7) {
    //   height -= 80 * Math.abs(this.noise(x * 0.04, z * 0.04));
    // }

    // Ensure height is not NaN or Infinity
    if (!isFinite(height)) {
      console.warn(`Generated invalid height for (${x},${z}), using 0`);
      return 0;
    }

    return height;
  }

  // Simple consistent noise function for subtle terrain variation
  private generateSimpleNoise(x: number, z: number): number {
    // Use a very simple noise function
    const scale = 0.01; // Large scale for subtle variations
    return (Math.sin(x * scale) * Math.cos(z * scale) + 1) / 2; // 0 to 1 range
  }

  private applyTerrainMaterial(): void {
    if (!this.mesh) return;

    // Use a shared material for chunks at the same LOD
    const materialName = `terrain_material_lod_${this.currentLOD}`;

    // Try to reuse existing material
    let terrainMaterial = this.scene.getMaterialByName(materialName) as StandardMaterial;

    if (!terrainMaterial) {
      // Create new material if not exists
      terrainMaterial = new StandardMaterial(materialName, this.scene);

      // Mars-like coloring
      terrainMaterial.diffuseColor = new Color3(0.76, 0.46, 0.33);
      terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

      // Wireframe for distant chunks only
      terrainMaterial.wireframe = this.currentLOD >= 2;
    }

    // Apply material
    this.mesh.material = terrainMaterial;

    // Ensure mesh is fully visible
    this.mesh.isVisible = true;
    this.mesh.visibility = 1.0;
    this.mesh.checkCollisions = true;
    this.mesh.isPickable = true;

    // Only show bounding box for debugging when needed
    this.mesh.showBoundingBox = false;
  }

  private getTerrainVertexShader(): string {
    return `
      precision highp float;
      
      // Attributes
      attribute vec3 position;
      attribute vec3 normal;
      attribute vec2 uv;
      
      // Uniforms
      uniform mat4 world;
      uniform mat4 worldView;
      uniform mat4 worldViewProjection;
      uniform float heightScale;
      
      // Varying
      varying vec2 vUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vSlope;
      
      void main() {
        vUV = uv;
        
        // Get local position and apply world transformation
        vec4 worldPosition = world * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vNormal = normalize((world * vec4(normal, 0.0)).xyz);
        vHeight = position.y / heightScale;
        
        // Calculate slope based on normal
        vSlope = 1.0 - abs(vNormal.y);
        
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;
  }

  private getTerrainFragmentShader(): string {
    return `
      precision highp float;
      
      // Varying
      varying vec2 vUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vSlope;
      
      // Textures
      uniform sampler2D mossTex;
      uniform sampler2D bumpyTex;
      uniform sampler2D flatTex;
      uniform sampler2D steepTex;
      uniform sampler2D rockyTex;
      uniform sampler2D snowTex;
      
      // Parameters
      uniform float time;
      
      // Function to blend textures
      vec4 blendTextures(vec4 a, vec4 b, float blend) {
        return mix(a, b, blend);
      }
      
      void main() {
        // Scale UVs for better texture tiling
        vec2 scaledUV = vUV * 8.0;
        
        // Sample all textures
        vec4 moss = texture2D(mossTex, scaledUV);
        vec4 bumpy = texture2D(bumpyTex, scaledUV);
        vec4 flatTexSample = texture2D(flatTex, scaledUV);
        vec4 steep = texture2D(steepTex, scaledUV);
        vec4 rocky = texture2D(rockyTex, scaledUV);
        vec4 snow = texture2D(snowTex, scaledUV);
        
        // Calculate weights based on terrain features
        float flatWeight = max(0.0, 1.0 - vSlope * 5.0);
        float steepWeight = smoothstep(0.2, 0.5, vSlope);
        float rockyWeight = smoothstep(0.5, 0.7, vSlope);
        float snowWeight = smoothstep(0.8, 1.0, vHeight);
        float bumpyWeight = smoothstep(0.1, 0.3, vHeight) * (1.0 - steepWeight);
        
        // Moss is a special case - it would be controlled by gameplay
        // For now, we'll use a simple noise pattern based on position
        float mossNoise = sin(vWorldPosition.x * 0.05) * cos(vWorldPosition.z * 0.05) * 0.5 + 0.5;
        float mossWeight = smoothstep(0.7, 0.9, mossNoise) * flatWeight;
        
        // Adjust weights to ensure they sum to 1.0
        float totalWeight = mossWeight + flatWeight + steepWeight + rockyWeight + snowWeight + bumpyWeight;
        mossWeight /= totalWeight;
        flatWeight /= totalWeight;
        steepWeight /= totalWeight;
        rockyWeight /= totalWeight;
        snowWeight /= totalWeight;
        bumpyWeight /= totalWeight;
        
        // Blend textures
        vec4 finalColor = 
          moss * mossWeight +
          flatTexSample * flatWeight +
          bumpy * bumpyWeight +
          steep * steepWeight +
          rocky * rockyWeight +
          snow * snowWeight;
        
        gl_FragColor = finalColor;
      }
    `;
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

      // Get player position for reference
      const playerId = window.store?.getSelfPlayerId() || 'player';
      const playerMesh = this.mesh.getScene().getMeshByName(`playerFoot_${playerId}`);
      const playerPos = playerMesh ? playerMesh.position.toString() : 'unknown';

      // Calculate global position from chunk coordinates
      const globalPosition = new Vector3(this.x * this.size, 0, this.y * this.size);

      // Log positioning info
      console.log(
        `Positioned terrain chunk ${this.x},${this.y}:\n` +
          `  - Engine position: ${position.toString()}\n` +
          `  - Global position: ${globalPosition.toString()}\n` +
          `  - Relative to player at: ${playerPos}`
      );

      // Ensure bounding info is updated
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
    }
  }

  public stitchWithNeighbor(
    neighbor: TerrainChunk,
    direction: 'left' | 'right' | 'top' | 'bottom'
  ): void {
    if (!this.mesh || !neighbor.mesh) return;

    const positions = this.mesh.getVerticesData('position');
    const neighborPositions = neighbor.mesh.getVerticesData('position');

    if (!positions || !neighborPositions) return;

    // Create vertex data for modification
    const vertexData = new VertexData();
    vertexData.positions = [...positions]; // Clone array

    // Copy edge heights based on direction
    switch (direction) {
      case 'left':
        // For each row, copy height from neighbor's right edge to our left edge
        for (let z = 0; z < this.resolution; z++) {
          const thisIdx = (0 + z * this.resolution) * 3 + 1; // Y component of first column
          const neighborIdx = (this.resolution - 1 + z * this.resolution) * 3 + 1; // Y component of last column

          // Copy height value (Y coordinate)
          vertexData.positions[thisIdx] = neighborPositions[neighborIdx];
        }
        break;

      case 'right':
        // Copy heights from neighbor's left edge to our right edge
        for (let z = 0; z < this.resolution; z++) {
          const thisIdx = (this.resolution - 1 + z * this.resolution) * 3 + 1; // Last column
          const neighborIdx = (0 + z * this.resolution) * 3 + 1; // First column

          vertexData.positions[thisIdx] = neighborPositions[neighborIdx];
        }
        break;

      case 'top':
        // Copy heights from neighbor's bottom edge to our top edge
        for (let x = 0; x < this.resolution; x++) {
          const thisIdx = (x + 0 * this.resolution) * 3 + 1; // First row
          const neighborIdx = (x + (this.resolution - 1) * this.resolution) * 3 + 1; // Last row

          vertexData.positions[thisIdx] = neighborPositions[neighborIdx];
        }
        break;

      case 'bottom':
        // Copy heights from neighbor's top edge to our bottom edge
        for (let x = 0; x < this.resolution; x++) {
          const thisIdx = (x + (this.resolution - 1) * this.resolution) * 3 + 1; // Last row
          const neighborIdx = (x + 0 * this.resolution) * 3 + 1; // First row

          vertexData.positions[thisIdx] = neighborPositions[neighborIdx];
        }
        break;
    }

    // Apply the modified vertex data
    vertexData.applyToMesh(this.mesh);

    // Recompute normals
    const indices = this.mesh.getIndices() || [];
    VertexData.ComputeNormals(vertexData.positions, indices, vertexData.normals || []);

    // Update the mesh
    this.mesh.updateVerticesData('position', vertexData.positions);
    if (vertexData.normals) {
      this.mesh.updateVerticesData('normal', vertexData.normals);
    }

    // Update bounding info
    this.mesh.refreshBoundingInfo();
  }

  public dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }
  }

  // Update LOD based on distance to player
  // Add this method to explicitly set the LOD level
  public setLOD(lod: number): void {
    this.currentLOD = Math.max(0, Math.min(3, lod));
    console.log(`Set LOD ${this.currentLOD} for chunk ${this.x},${this.y}`);
  }

  // Get current LOD level
  public getCurrentLOD(): number {
    return this.currentLOD;
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

  public updateLOD(playerPosition: Vector3): boolean {
    if (!this.mesh) return false;

    // Check if there's a lock on this chunk's LOD
    const key = `${this.x}_${this.y}`;
    if (window.terrainManager?.lockedLODs.has(key)) {
      const lockedLOD = window.terrainManager.lockedLODs.get(key);
      if (this.currentLOD !== lockedLOD) {
        this.currentLOD = lockedLOD!;
        return true;
      }
      return false;
    }

    // Calculate distance to player
    const distance = Vector3.Distance(playerPosition, this.mesh.position);

    // Choose appropriate LOD level
    let newLOD = 0;
    if (distance > 400) newLOD = 3; // Very far - lowest detail (64 resolution)
    else if (distance > 300) newLOD = 2; // Far - low detail (128 resolution)
    else if (distance > 200) newLOD = 1; // Medium - medium detail (256 resolution)
    else newLOD = 0; // Close - highest detail (512 resolution)

    // If LOD changed, flag for regeneration
    if (newLOD !== this.currentLOD) {
      this.currentLOD = newLOD;
      return true;
    }
    return false;
  }

  // Regenerate mesh with current LOD
  public regenerateWithCurrentLOD(): void {
    if (this.mesh) {
      // Store position before regenerating
      const position = this.mesh.position.clone();

      // Dispose current mesh
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh.dispose();

      // Create new mesh with current LOD
      this.mesh = new Mesh(`terrain_chunk_${this.x}_${this.y}`, this.scene);
      this.generate();

      // Restore position
      this.mesh.position = position;
    }
  }
}

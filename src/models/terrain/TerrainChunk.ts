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
  MeshBuilder,
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
      // Generate procedural fallback
      this.createProceduralMesh();
      console.error(`Chunk ${this.x}_${this.y} created with procedural fallback`, error);
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
      this.mesh.doNotSyncBoundingInfo = false;

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

  private createProceduralMesh(): void {
    if (!this.mesh) return;
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

    // Register custom shader
    Effect.ShadersStore['terrainVertexShader'] = this.getTerrainVertexShader();
    Effect.ShadersStore['terrainFragmentShader'] = this.getTerrainFragmentShader();

    // Create shader material
    const shaderMaterial = new ShaderMaterial(
      `terrain_material_${this.x}_${this.y}`,
      this.scene,
      {
        vertex: 'terrain',
        fragment: 'terrain',
      },
      {
        attributes: ['position', 'normal', 'uv'],
        uniforms: [
          'world',
          'worldView',
          'worldViewProjection',
          'view',
          'projection',
          'heightScale',
          'time',
        ],
        samplers: ['mossTex', 'bumpyTex', 'flatTex', 'steepTex', 'rockyTex', 'snowTex'],
      }
    );

    // Add error callback for shader compilation
    shaderMaterial.onBindObservable.add(() => {
      if (!shaderMaterial.getEffect().isReady()) {
        console.error('Failed to compile terrain shader');
        shaderMaterial.dispose();
      }
    });

    // Load textures
    const texturePaths = [
      '/resources/graphics/textures/mars/Terrain0.jpg', // Moss
      '/resources/graphics/textures/mars/Terrain1.jpg', // Small bumpy
      '/resources/graphics/textures/mars/Terrain2.jpg', // Flat areas
      '/resources/graphics/textures/mars/Terrain3.jpg', // Steeper edges
      '/resources/graphics/textures/mars/Terrain4.jpg', // Rocky
      '/resources/graphics/textures/mars/Terrain5.jpg', // High elevation
    ];

    // Set textures with error handling
    const textureNames = ['mossTex', 'bumpyTex', 'flatTex', 'steepTex', 'rockyTex', 'snowTex'];
    texturePaths.forEach((path, index) => {
      const texture = new Texture(
        path,
        this.scene,
        undefined,
        undefined,
        undefined,
        undefined,
        (msg) => {
          console.error(`Failed to load texture ${path}:`, msg);
        }
      );
      shaderMaterial.setTexture(textureNames[index], texture);
    });

    // Set normal maps for future use if needed

    // Set parameters
    shaderMaterial.setFloat('heightScale', this.heightScale);

    // Update time parameter for potential animation effects
    this.scene.onBeforeRenderObservable.add(() => {
      shaderMaterial.setFloat('time', this.scene.getEngine().getDeltaTime() / 1000);
    });

    this.mesh.material = shaderMaterial;
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
        // float mossNoise = sin(vWorldPosition.x * 0.05) * cos(vWorldPosition.z * 0.05) * 0.5 + 0.5;
        // float mossWeight = 0; //smoothstep(0.7, 0.9, mossNoise) * flatWeight;
        
        // Adjust weights to ensure they sum to 1.0
        float totalWeight = flatWeight + steepWeight + rockyWeight + snowWeight + bumpyWeight;
        // mossWeight /= totalWeight;
        flatWeight /= totalWeight;
        steepWeight /= totalWeight;
        rockyWeight /= totalWeight;
        snowWeight /= totalWeight;
        bumpyWeight /= totalWeight;
        
        // Blend textures
        vec4 finalColor = 
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

      // Ensure bounding info is updated
      this.mesh.computeWorldMatrix(true);
      this.mesh.refreshBoundingInfo();
    }
  }

  public stitchWithNeighbor(
    neighbor: TerrainChunk,
    direction: 'left' | 'right' | 'top' | 'bottom'
  ): void {
    if (!this.mesh || !neighbor.mesh) {
      return;
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

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
} from "@babylonjs/core";
import { TerrainChunkDTO } from "./TerrainManager";
import { createNoise2D } from "simplex-noise";
import WorldManager from "./WorldManager";

export default class TerrainChunk {
  private mesh: Mesh | null = null;
  private x: number;
  private y: number;
  private size: number;
  private scene: BabylonScene;
  private resolution = 71;
  private heightScale = 100;
  private noise: ReturnType<typeof createNoise2D>;

  constructor(x: number, y: number, size: number, scene: BabylonScene) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.scene = scene;
    // Create noise function with default seed
    // For seeded noise, you would need to add 'alea' package and use:
    // import alea from 'alea';
    // this.noise = createNoise2D(alea(this.getSeed()));
    this.noise = createNoise2D();
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
      console.log(`Generating chunk ${this.x}_${this.y}`);
      // Fetch heightmap data from the server
      const heightmapData = await this.fetchHeightmapData();
      this.createMeshFromHeightmap(heightmapData);
      console.log(`Chunk ${this.x}_${this.y} created successfully`);
    } catch (error) {
      console.error(
        `Failed to load heightmap for chunk ${this.x}_${this.y}:`,
        error
      );
      // Generate procedural fallback
      this.createProceduralMesh();
      console.log(`Chunk ${this.x}_${this.y} created with procedural fallback`);
    }
  }

  private async fetchHeightmapData(): Promise<Float32Array> {
    // Validate chunk coordinates before fetching
    if (this.x < 0 || this.x >= 72 || this.y < 0 || this.y >= 144) {
      console.error(`Invalid chunk coordinates: ${this.x},${this.y}`);
    }

    // Use correct coordinate order in URL
    const response = await fetch(
      `https://ashmartian.com/mars/patch_${this.x}_${this.y}.raw`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch heightmap: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Float32Array(buffer);
  }

  private createMeshFromHeightmap(heightmapData: Float32Array): void {
    if (!this.mesh) return;

    // Calculate chunk position in virtual space
    const virtualPosition = new Vector3(
      this.y * this.size, // Y becomes X in virtual space
      0,
      this.x * this.size  // X becomes Z in virtual space
    );

    // Convert to engine coordinates
    const enginePosition = WorldManager.toEngine(virtualPosition);

    // Set mesh position in engine space
    this.mesh.position = enginePosition;

    // Log chunk creation for debugging
    console.log(
      `Created terrain chunk at ${this.x},${
        this.y
      } - Engine position: ${enginePosition.toString()}`
    );

    // Add collision properties with enhanced settings
    this.mesh.checkCollisions = true;
    this.mesh.isPickable = true;
    this.mesh.isVisible = true; // Ensure mesh is visible
    this.mesh.visibility = 1;
    this.mesh.receiveShadows = true;
    this.mesh.doNotSyncBoundingInfo = true; // Improve performance
    
    // Debug visualization for development
    this.mesh.showBoundingBox = true;
    this.mesh.enablePointerMoveEvents = true;
    console.log("Mesh visibility forced to true");

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create vertices with height constraints
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        // Position in local space
        const localX = (x / (this.resolution - 1)) * this.size;
        const localZ = (z / (this.resolution - 1)) * this.size;

        // Get height from heightmap with validation
        const heightIndex = z * this.resolution + x;
        let height = 0;
        
        if (heightIndex < heightmapData.length) {
          const rawHeight = heightmapData[heightIndex];
          // Constrain height to reasonable values (-100 to 100)
          height = isFinite(rawHeight) ? 
            Math.max(-100, Math.min(100, rawHeight * 0.1)) : 0;
        }

        // Check if this is an edge vertex - no noise at edges
        const isEdgeVertex = 
          x === 0 || x === this.resolution - 1 || 
          z === 0 || z === this.resolution - 1;
          
        if (!isEdgeVertex) {
          // Only add noise to non-edge vertices
          const worldX = this.x * this.size + localX;
          const worldZ = this.y * this.size + localZ;
          const noise = this.addTerrainNoise(worldX, worldZ);
          height += isFinite(noise) ? Math.max(-10, Math.min(10, noise)) : 0;
        }

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

    // Validate mesh creation
    if (!this.mesh.getTotalVertices()) {
      console.error(
        `Failed to create terrain mesh for chunk ${this.x},${this.y} - no vertices`
      );
      this.mesh.dispose();
      return;
    }

    // Apply proper terrain material instead of wireframe
    this.applyTerrainMaterial();
    
    // Ensure bounding info is properly computed
    this.mesh.computeWorldMatrix(true);
    this.mesh.refreshBoundingInfo();
    
    // Simplify logging - just output minimal info
    console.log(`Terrain chunk ${this.x}_${this.y} ready`);
  }

  private createProceduralMesh(): void {
    if (!this.mesh) return;

    // Calculate chunk position in virtual space
    const virtualPosition = new Vector3(
      this.x * this.size,
      0,
      this.y * this.size
    );

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

    // Create vertices
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        // Position in local space
        const localX = (x / (this.resolution - 1)) * this.size;
        const localZ = (z / (this.resolution - 1)) * this.size;

        // Calculate world position for height generation
        const worldX = this.x * this.size + localX;
        const worldZ = this.y * this.size + localZ;

        // Generate procedural height
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

    // Apply material
    this.applyTerrainMaterial();
  }

  private generateProceduralHeight(x: number, z: number): number {
    // Basic multi-octave noise
    let height = 0;
    let amplitude = this.heightScale;
    let frequency = 0.0005;

    for (let i = 0; i < 4; i++) {
      height += this.noise(x * frequency, z * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return height;
  }

  private addTerrainNoise(x: number, z: number): number {
    // Use a common seed based on world position for consistent noise
    const seed = Math.floor(x / this.size) * 10000 + Math.floor(z / this.size);
    
    // Calculate distance from edge as a factor from 0 to 1
    const edgeX = x % this.size;
    const edgeZ = z % this.size;
    const distFromEdgeX = Math.min(edgeX, this.size - edgeX) / (this.size * 0.25);
    const distFromEdgeZ = Math.min(edgeZ, this.size - edgeZ) / (this.size * 0.25);
    const edgeFactor = Math.min(1, Math.min(distFromEdgeX, distFromEdgeZ));
    
    // Calculate terrain steepness
    const slopeNoise = this.noise(x * 0.01, z * 0.01);
    const slope = Math.abs(slopeNoise);

    // Multi-frequency noise for different detail levels
    const detailNoise =
      this.noise(x * 0.1, z * 0.1) * 0.5 +
      this.noise(x * 0.5, z * 0.5) * 0.3 +
      this.noise(x * 2.0, z * 2.0) * 0.2;

    // Adaptive noise scaling based on terrain features
    // More noise in flat areas, less in steep areas
    const noiseScale = Math.exp(-slope * 5) * 2.0;

    // Scale the noise to zero near chunk edges
    return detailNoise * noiseScale * edgeFactor;
  }

  private calculateSlopeAt(x: number, z: number): number {
    // Convert to world coordinates for consistent height sampling
    const worldX = this.x * this.size + x;
    const worldZ = this.y * this.size + z;

    // Sample heights at nearby points
    const h1 = this.generateProceduralHeight(worldX - 1, worldZ);
    const h2 = this.generateProceduralHeight(worldX + 1, worldZ);
    const h3 = this.generateProceduralHeight(worldX, worldZ - 1);
    const h4 = this.generateProceduralHeight(worldX, worldZ + 1);

    // Calculate slope using gradient
    const dx = (h2 - h1) / 2;
    const dz = (h4 - h3) / 2;

    // Return slope magnitude
    return Math.sqrt(dx * dx + dz * dz);
  }

  private applyTerrainMaterial(): void {
    if (!this.mesh) return;

    // Create a simpler material while we're testing
    const terrainMaterial = new StandardMaterial(`terrain_material_${this.x}_${this.y}`, this.scene);
    
    // Base Mars color
    terrainMaterial.diffuseColor = new Color3(0.76, 0.44, 0.33);
    
    // Add some variation with texture if available
    try {
      // Add main terrain texture
      terrainMaterial.diffuseTexture = new Texture(
        "/resources/graphics/textures/mars/Terrain2.jpg", // Use flat terrain texture
        this.scene
      );
      
      (terrainMaterial.diffuseTexture as Texture).uScale = 10;
      (terrainMaterial.diffuseTexture as Texture).vScale = 10;
      
      // Add bump texture for detail
      terrainMaterial.bumpTexture = new Texture(
        "/resources/graphics/textures/mars/Terrain2_normal.jpg",
        this.scene
      );
      (terrainMaterial.bumpTexture as Texture).uScale = 10;
      (terrainMaterial.bumpTexture as Texture).vScale = 10;
      
      // Set other material properties
      terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
      terrainMaterial.specularPower = 32;
      
      console.log(`Applied terrain texture to chunk ${this.x}_${this.y}`);
    } catch (error) {
      console.warn(`Fallback to basic material for chunk ${this.x}_${this.y}:`, error);
    }
    
    // Apply material to mesh
    this.mesh.material = terrainMaterial;
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

  public dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
      this.mesh = null;
    }
  }
}

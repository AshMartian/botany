import {
  Scene,
  ShaderMaterial,
  Texture,
  Effect,
  Vector3,
  ShadowGenerator,
  Color3,
  DirectionalLight,
} from '@babylonjs/core';

export default class TerrainMaterial {
  private static vertexShaderName = 'terrainVertex';
  private static fragmentShaderName = 'terrainFragment';
  private static registered = false;

  /**
   * Creates a terrain material that properly handles shadows and terrain texturing
   */
  public static create(
    name: string,
    scene: Scene,
    shadowGenerator: ShadowGenerator | null
  ): ShaderMaterial {
    // Register shaders if not already done
    if (!this.registered) {
      this.registerShaders();
    }

    // Create shader material
    const material = new ShaderMaterial(
      name,
      scene,
      {
        vertex: this.vertexShaderName,
        fragment: this.fragmentShaderName,
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
          'lightMatrix',
          'lightDirection',
          'lightPosition',
          'vFogInfos',
          'vFogColor',
          'fogDensity',
        ],
        samplers: [
          'mossTex',
          'bumpyTex',
          'flatTex',
          'steepTex',
          'rockyTex',
          'snowTex',
          'shadowSampler',
        ],
        // Removed SHADOWDEPTH define which requires specific variables
      }
    );

    // Add error callback for shader compilation
    // material.onCompiled = function (effect) {
    //   console.log('Terrain shader compiled successfully');
    // };

    // material.onError = function (effect, errors) {
    //   console.error('Terrain shader compilation errors:', errors);
    // };

    // Set textures
    this.setTextures(material, scene);

    // Set parameters
    material.setFloat('heightScale', 512);

    // Set up shadow map
    if (shadowGenerator) {
      const shadowMap = shadowGenerator.getShadowMap();
      if (shadowMap && shadowMap.getScene()) {
        material.setTexture('shadowSampler', shadowMap);
        material.setMatrix('lightMatrix', shadowGenerator.getTransformMatrix());
      }

      // Set light direction for shader
      const light = scene.getLightById('MainDirectionLight');
      if (light && light.getClassName() === 'DirectionalLight') {
        material.setVector3('lightDirection', (light as DirectionalLight).direction);
        material.setVector3('lightPosition', (light as DirectionalLight).position);
      } else {
        material.setVector3('lightDirection', new Vector3(-1, -2, -1));
        material.setVector3('lightPosition', new Vector3(100, 150, 100));
      }
    }

    // Set up fog
    material.setArray3('vFogInfos', [scene.fogMode, scene.fogStart, scene.fogEnd]);
    material.setFloat('fogDensity', scene.fogDensity);
    material.setColor3('vFogColor', scene.fogColor);

    return material;
  }

  private static setTextures(material: ShaderMaterial, scene: Scene): void {
    const texturePaths = [
      '/resources/graphics/textures/mars/Terrain0.jpg', // Moss
      '/resources/graphics/textures/mars/Terrain1.jpg', // Small bumpy
      '/resources/graphics/textures/mars/Terrain2.jpg', // Flat areas
      '/resources/graphics/textures/mars/Terrain3.jpg', // Steeper edges
      '/resources/graphics/textures/mars/Terrain4.jpg', // Rocky
      '/resources/graphics/textures/mars/Terrain5.jpg', // High elevation
    ];

    const textureNames = ['mossTex', 'bumpyTex', 'flatTex', 'steepTex', 'rockyTex', 'snowTex'];

    texturePaths.forEach((path, index) => {
      const texture = new Texture(
        path,
        scene,
        true, // Set to true for noMipmap to improve performance
        false, // Set to false for samplingMode
        Texture.BILINEAR_SAMPLINGMODE, // Sampling mode
        () => {
          texture.wrapU = Texture.WRAP_ADDRESSMODE;
          texture.wrapV = Texture.WRAP_ADDRESSMODE;
          // Ensure texture is ready for rendering
          texture.hasAlpha = false;
        },
        (message) => {
          console.error(`Failed to load texture ${path}:`, message);
        }
      );
      material.setTexture(textureNames[index], texture);
    });
  }

  private static registerShaders(): void {
    // Register vertex shader
    Effect.ShadersStore[this.vertexShaderName + 'VertexShader'] = this.getVertexShader();

    // Register fragment shader
    Effect.ShadersStore[this.fragmentShaderName + 'FragmentShader'] = this.getFragmentShader();

    this.registered = true;
  }

  private static getVertexShader(): string {
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
      
      // Shadow uniforms
      uniform mat4 lightMatrix;
      
      // Varying
      varying vec2 vUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vSlope;
      varying vec4 vPositionFromLight;
      varying float fFogDistance;
      
      void main() {
        vUV = uv;
        
        // Get local position and apply world transformation
        vec4 worldPosition = world * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // Transform normal to world space and normalize
        vNormal = normalize((world * vec4(normal, 0.0)).xyz);
        
        // Calculate normalized height (0-1 range)
        vHeight = position.y / heightScale;
        
        // Calculate slope based on normal (1.0 = vertical, 0.0 = flat)
        vSlope = 1.0 - abs(vNormal.y);
        
        // Calculate position from light's perspective for shadows
        vPositionFromLight = lightMatrix * worldPosition;
        
        // Calculate fog distance
        fFogDistance = length((worldView * vec4(position, 1.0)).xyz);
        
        // Output position
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;
  }

  private static getFragmentShader(): string {
    return `
      precision highp float;
      
      // Varying inputs from vertex shader
      varying vec2 vUV;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vNormalW; // Added for shadow system
      varying float vHeight;
      varying float vSlope;
      varying vec4 vPositionFromLight;
      varying float fFogDistance;
      
      // Textures
      uniform sampler2D mossTex;
      uniform sampler2D bumpyTex;
      uniform sampler2D flatTex;
      uniform sampler2D steepTex;
      uniform sampler2D rockyTex;
      uniform sampler2D snowTex;
      
      // Shadow uniforms
      uniform sampler2D shadowSampler;
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      
      // Fog settings
      uniform vec3 vFogInfos;
      uniform vec3 vFogColor;
      uniform float fogDensity;
      
      // Parameters
      uniform float time;
      
      // Shadow calculation function with PCF (Percentage Closer Filtering)
      float computeShadow(vec4 vPositionFromLight) {
        // Transform to NDC space
        vec3 depthCoord = vPositionFromLight.xyz / vPositionFromLight.w;
        
        // Convert to texture space [0,1]
        depthCoord = depthCoord * 0.5 + 0.5;
        
        // Check if outside shadow map
        if (depthCoord.x < 0.0 || depthCoord.x > 1.0 || 
            depthCoord.y < 0.0 || depthCoord.y > 1.0) {
          return 1.0; // Fully lit
        }
        
        // Shadow bias to prevent shadow acne
        // Adjust based on surface normal facing light
        float bias = 0.005 * (1.0 - dot(vNormal, -normalize(lightDirection)));
        bias = clamp(bias, 0.0005, 0.015);
        
        // Higher quality PCF (5x5 kernel)
        float shadow = 0.0;
        float texelSize = 1.0/2048.0; // Shadow map resolution
        
        for(float x = -2.0; x <= 2.0; x += 1.0) {
          for(float y = -2.0; y <= 2.0; y += 1.0) {
            float pcfDepth = texture2D(shadowSampler, depthCoord.xy + vec2(x, y) * texelSize).r;
            shadow += depthCoord.z - bias > pcfDepth ? 0.0 : 1.0;
          }
        }
        
        shadow /= 25.0; // 5x5 samples
        return shadow;
      }
      
      // Fog calculation
      float computeFog() {
        float fogMode = vFogInfos.x;
        float fogStart = vFogInfos.y;
        float fogEnd = vFogInfos.z;
        
        float fogFactor = 1.0;
        
        if (fogMode == 1.0) { // LINEAR
          fogFactor = (fogEnd - fFogDistance) / (fogEnd - fogStart);
        } else if (fogMode == 2.0) { // EXP
          fogFactor = 1.0 / pow(2.71828, fFogDistance * fogDensity);
        } else if (fogMode == 3.0) { // EXP2
          fogFactor = 1.0 / pow(2.71828, fFogDistance * fFogDistance * fogDensity * fogDensity);
        }
        
        return clamp(fogFactor, 0.0, 1.0);
      }
      
      void main() {
        // Scale UVs for better tiling (adjust based on terrain size)
        vec2 scaledUV = vUV * 8.0;
        
        // Sample all textures
        vec4 mossColor = texture2D(mossTex, scaledUV);
        vec4 bumpyColor = texture2D(bumpyTex, scaledUV);
        vec4 flatColor = texture2D(flatTex, scaledUV);
        vec4 steepColor = texture2D(steepTex, scaledUV);
        vec4 rockyColor = texture2D(rockyTex, scaledUV);
        vec4 snowColor = texture2D(snowTex, scaledUV);
        
        // Calculate weights based on terrain features
        float flatWeight = max(0.0, 1.0 - vSlope * 5.0); // Flat areas
        float steepWeight = smoothstep(0.2, 0.5, vSlope); // Medium slopes
        float rockyWeight = smoothstep(0.5, 0.7, vSlope); // Steep slopes
        float snowWeight = smoothstep(0.8, 1.0, vHeight); // High areas
        float bumpyWeight = smoothstep(0.1, 0.3, vHeight) * (1.0 - steepWeight); // Low-medium areas
        float mossWeight = max(0.0, 1.0 - bumpyWeight - flatWeight - steepWeight - rockyWeight - snowWeight); // Default texture
        
        // Normalize weights
        float totalWeight = mossWeight + flatWeight + steepWeight + rockyWeight + snowWeight + bumpyWeight;
        mossWeight /= totalWeight;
        flatWeight /= totalWeight;
        steepWeight /= totalWeight;
        rockyWeight /= totalWeight;
        snowWeight /= totalWeight;
        bumpyWeight /= totalWeight;
        
        // Blend textures
        vec4 finalColor = 
          mossColor * mossWeight +
          flatColor * flatWeight +
          bumpyColor * bumpyWeight +
          steepColor * steepWeight +
          rockyColor * rockyWeight +
          snowColor * snowWeight;
        
        // Calculate lighting
        // Directional light contribution
        float NdotL = max(0.0, dot(vNormal, -normalize(lightDirection)));
        
        // Ambient light factor (minimum light)
        float ambientFactor = 0.3;
        
        // Calculate shadow
        float shadow = computeShadow(vPositionFromLight);
        
        // Combined lighting
        float lightIntensity = ambientFactor + (1.0 - ambientFactor) * NdotL;
        
        // Apply lighting
        finalColor.rgb *= lightIntensity;
        
        // Apply fog
        float fogFactor = computeFog();
        finalColor.rgb = mix(vFogColor, finalColor.rgb, fogFactor);
        
        gl_FragColor = finalColor;
      }
    `;
  }
}

import {
  Scene,
  Texture,
  ShadowGenerator,
  VertexBuffer, // Import VertexBuffer
  // Removed: Vector3, Color3, Effect, DirectionalLight as they are not directly needed for this material setup
} from '@babylonjs/core';
// Import CustomMaterial from the materials library
import { CustomMaterial } from '@babylonjs/materials'; // Import materials library for CustomMaterial

export default class TerrainMaterial {
  // Removed: vertexShaderName, fragmentShaderName, registered

  /**
   * Creates a terrain material using CustomMaterial that properly handles shadows and terrain texturing
   */
  public static create(
    name: string,
    scene: Scene,
    shadowGenerator: ShadowGenerator | null // Keep shadowGenerator parameter if needed elsewhere, but not for material setup itself
  ): CustomMaterial {
    // Changed return type to CustomMaterial
    // Removed: Shader registration check

    // Create CustomMaterial
    const material = new CustomMaterial(name, scene); // Changed instantiation to CustomMaterial
    // REMOVED: (material as any).diffuseTextureEnabled = true; // This didn't reliably enable vDiffuseUV

    // Define Uniforms required by our custom shader code
    // These AddUniform calls are correct for CustomMaterial
    material.AddUniform('heightScale', 'float', 256); // Set initial value directly
    material.AddUniform('mossTex', 'sampler2D', null);
    material.AddUniform('bumpyTex', 'sampler2D', null);
    material.AddUniform('flatTex', 'sampler2D', null);
    material.AddUniform('steepTex', 'sampler2D', null);
    material.AddUniform('rockyTex', 'sampler2D', null);
    material.AddUniform('snowTex', 'sampler2D', null);

    // Add uniforms for normal maps
    material.AddUniform('mossNormal', 'sampler2D', null);
    material.AddUniform('bumpyNormal', 'sampler2D', null);
    material.AddUniform('flatNormal', 'sampler2D', null);
    material.AddUniform('steepNormal', 'sampler2D', null);
    material.AddUniform('rockyNormal', 'sampler2D', null);
    material.AddUniform('snowNormal', 'sampler2D', null);
    material.AddUniform('blendedNormalOutput', 'sampler2D', null);

    // --- REMOVED Vertex Definitions ---
    // --- REMOVED Vertex MainEnd ---
    // --- REMOVED Fragment Definitions ---

    // Inject custom fragment shader code for texture blending into the diffuse part
    // This Fragment_Custom_Diffuse is correct for CustomMaterial
    material.Fragment_Custom_Diffuse(`
      // Varyings provided by StandardMaterial/NodeMaterial:
      // vPositionW: World position of the fragment
      // vNormalW: World normal of the fragment
      // vDiffuseUV: Standard UV coordinates (available because material.diffuseTexture is set)

      // Uniforms we defined:
      // uniform float heightScale; // Now set directly in AddUniform
      // uniform sampler2D mossTex;
      // uniform sampler2D bumpyTex;
      // uniform sampler2D flatTex;
      // uniform sampler2D steepTex;
      // uniform sampler2D rockyTex;
      // uniform sampler2D snowTex;
      // uniform sampler2D mossNormal;
      // uniform sampler2D bumpyNormal;
      // uniform sampler2D flatNormal;
      // uniform sampler2D steepNormal;
      // uniform sampler2D rockyNormal;
      // uniform sampler2D snowNormal;

      // Get height and slope from provided varyings
      float height = vPositionW.y / heightScale; // Normalized height (0-1 range)
      float slope = 1.0 - abs(vNormalW.y); // Slope (0 = flat, 1 = vertical)

      // Scale UVs for tiling (use vDiffuseUV, which should now be available)
      vec2 scaledUV = vDiffuseUV * 8.0;

      // Sample all textures
      vec4 mossColor = texture2D(mossTex, scaledUV);
      vec4 bumpyColor = texture2D(bumpyTex, scaledUV);
      vec4 flatColor = texture2D(flatTex, scaledUV);
      vec4 steepColor = texture2D(steepTex, scaledUV);
      vec4 rockyColor = texture2D(rockyTex, scaledUV);
      vec4 snowColor = texture2D(snowTex, scaledUV);
      
      // Sample all normal maps
      vec3 mossNormalColor = texture2D(mossNormal, scaledUV).rgb;
      vec3 bumpyNormalColor = texture2D(bumpyNormal, scaledUV).rgb;
      vec3 flatNormalColor = texture2D(flatNormal, scaledUV).rgb;
      vec3 steepNormalColor = texture2D(steepNormal, scaledUV).rgb;
      vec3 rockyNormalColor = texture2D(rockyNormal, scaledUV).rgb;
      vec3 snowNormalColor = texture2D(snowNormal, scaledUV).rgb;

      // Calculate weights based on terrain features (same logic as before)
      float flatWeight = max(0.0, 1.0 - slope * 5.0);
      float steepWeight = smoothstep(0.2, 0.5, slope);
      float rockyWeight = smoothstep(0.5, 0.7, slope);
      float snowWeight = smoothstep(0.8, 1.0, height);
      float bumpyWeight = smoothstep(0.1, 0.3, height) * (1.0 - steepWeight);
      // Adjust mossWeight calculation slightly for clarity
      float otherWeights = flatWeight + steepWeight + rockyWeight + snowWeight + bumpyWeight;
      float mossWeight = max(0.0, 1.0 - otherWeights); // Use remaining weight

      // Normalize weights (ensure they sum to 1)
      float totalWeight = mossWeight + flatWeight + steepWeight + rockyWeight + snowWeight + bumpyWeight;
      // Avoid division by zero if totalWeight is somehow zero
      if (totalWeight > 0.0001) { // Use a small epsilon for safety
          mossWeight /= totalWeight;
          flatWeight /= totalWeight;
          steepWeight /= totalWeight;
          rockyWeight /= totalWeight;
          snowWeight /= totalWeight;
          bumpyWeight /= totalWeight;
      } else {
          mossWeight = 1.0; // Default to moss if weights are zero
          flatWeight = 0.0;
          steepWeight = 0.0;
          rockyWeight = 0.0;
          snowWeight = 0.0;
          bumpyWeight = 0.0;
      }

      // Blend diffuse textures
      vec3 blendedColor =
        mossColor.rgb * mossWeight +
        flatColor.rgb * flatWeight +
        bumpyColor.rgb * bumpyWeight +
        steepColor.rgb * steepWeight +
        rockyColor.rgb * rockyWeight +
        snowColor.rgb * snowWeight;
        
      // Blend normal textures using the same weights
      vec3 blendedNormal =
        mossNormalColor * mossWeight +
        flatNormalColor * flatWeight +
        bumpyNormalColor * bumpyWeight +
        steepNormalColor * steepWeight +
        rockyNormalColor * rockyWeight +
        snowNormalColor * snowWeight;
        
      // Convert from [0,1] range to [-1,1] range for normal maps
      blendedNormal = blendedNormal * 2.0 - 1.0;
      
      // Store the blended normal in the blendedNormalOutput uniform
      // The normal map will be applied outside the shader via the bumpTexture
      
      // Assign the final blended color to diffuseColor.rgb
      // StandardMaterial will then apply lighting, shadows, fog etc. to this base color.
      diffuseColor.rgb = blendedColor;
    `);

    // --- REMOVED UseStandardVertexShader = true ---
    // CustomMaterial inherently uses the standard vertex shader logic.

    // Set textures using the standard method (should work now if compilation succeeds)
    this.setTextures(material, scene);

    // Check if material compiled successfully after setup
    // Use a timeout to check readiness, as compilation might be async
    setTimeout(() => {
      if (!material.isReady()) {
        console.error(`[TerrainMaterial] Material '${name}' failed to compile after setup.`);
        // Optional: Fallback logic here if needed, e.g., apply a simple StandardMaterial
        // const fallbackMat = new StandardMaterial(name + "_fallback", scene);
        // fallbackMat.diffuseColor = new Color3(0.5, 0.5, 0.5); // Grey
        // if (material.getMesh()) { // Check if mesh is associated
        //     material.getMesh().material = fallbackMat;
        // }
      } else {
        console.log(`[TerrainMaterial] Material '${name}' appears ready.`);
      }
    }, 100); // Check after a short delay

    return material;
  }

  // Updated setTextures to assign textures directly to material properties
  private static setTextures(material: CustomMaterial, scene: Scene): void {
    // Changed type hint to CustomMaterial
    const texturePaths = [
      '/resources/graphics/textures/mars/Terrain0.jpg', // Moss
      '/resources/graphics/textures/mars/Terrain1.jpg', // Small bumpy
      '/resources/graphics/textures/mars/Terrain2.jpg', // Flat areas
      '/resources/graphics/textures/mars/Terrain3.jpg', // Steeper edges
      '/resources/graphics/textures/mars/Terrain4.jpg', // Rocky
      '/resources/graphics/textures/mars/Terrain5.jpg', // High elevation
    ];

    // Normal Textures

    const normalTexturePaths = [
      '/resources/graphics/textures/mars/Terrain0_normal.jpg', // Moss
      '/resources/graphics/textures/mars/Terrain1_normal.jpg', // Small bumpy
      '/resources/graphics/textures/mars/Terrain2_normal.jpg', // Flat areas
      '/resources/graphics/textures/mars/Terrain3_normal.jpg', // Steeper edges
      '/resources/graphics/textures/mars/Terrain4_normal.jpg', // Rocky
      '/resources/graphics/textures/mars/Terrain5_normal.jpg', // High elevation
    ];

    const textureNames = ['mossTex', 'bumpyTex', 'flatTex', 'steepTex', 'rockyTex', 'snowTex'];
    const normalTextureNames = [
      'mossNormal',
      'bumpyNormal',
      'flatNormal',
      'steepNormal',
      'rockyNormal',
      'snowNormal',
    ];

    texturePaths.forEach((path, index) => {
      const textureName = textureNames[index];
      const texture = new Texture(
        path,
        scene,
        false, // noMipmap - Changed to false to enable mipmaps
        true, // invertY
        Texture.TRILINEAR_SAMPLINGMODE, // Sampling mode - Changed to TRILINEAR for mipmaps
        () => {
          texture.wrapU = Texture.WRAP_ADDRESSMODE;
          texture.wrapV = Texture.WRAP_ADDRESSMODE;
          texture.hasAlpha = false;
          // console.log(`[TerrainMaterial] Texture loaded: ${path}`); // Optional: confirm texture load
        },
        (message) => {
          console.error(`Failed to load texture ${path}:`, message);
        }
      );

      // Assign the texture directly to the material property matching the uniform name.
      // CustomMaterial should handle linking this during its internal processes.
      if (texture && texture.isReady()) {
        (material as any)[textureName] = texture;
        // console.log(`[TerrainMaterial] Assigned texture to material property: ${textureName}`);
      } else if (texture) {
        // If texture is not ready yet, assign it once it loads
        texture.onLoadObservable.addOnce(() => {
          (material as any)[textureName] = texture;
          // console.log(`[TerrainMaterial] Assigned texture to material property (onLoad): ${textureName}`);
        });
      } else {
        console.error(`[TerrainMaterial] Texture object for ${textureName} is invalid.`);
      }

      // ALSO: Assign one texture (e.g., flatTex) to the standard diffuseTexture slot
      // to ensure the vDiffuseUV varying is generated and passed by StandardMaterial.
      if (textureName === 'flatTex') {
        if (texture && texture.isReady()) {
          material.diffuseTexture = texture;
        } else if (texture) {
          texture.onLoadObservable.addOnce(() => {
            material.diffuseTexture = texture;
          });
        }
      }
    });

    normalTexturePaths.forEach((path, index) => {
      const normalTextureName = normalTextureNames[index];
      const normalTexture = new Texture(
        path,
        scene,
        false, // noMipmap - Changed to false to enable mipmaps
        true, // invertY
        Texture.TRILINEAR_SAMPLINGMODE, // Sampling mode - Changed to TRILINEAR for mipmaps
        () => {
          normalTexture.wrapU = Texture.WRAP_ADDRESSMODE;
          normalTexture.wrapV = Texture.WRAP_ADDRESSMODE;
          normalTexture.hasAlpha = false;
          // normalTexture.coordinatesMode = Texture.SPHERICAL_MODE; // Set coordinates mode to spherical
          // console.log(`[TerrainMaterial] Normal texture loaded: ${path}`); // Optional: confirm normal texture load
        },
        (message) => {
          console.error(`Failed to load normal texture ${path}:`, message);
        }
      );

      // Assign the normal texture directly to the material property matching the uniform name.
      // CustomMaterial should handle linking this during its internal processes.
      if (normalTexture && normalTexture.isReady()) {
        (material as any)[normalTextureName] = normalTexture;
        // console.log(`[TerrainMaterial] Assigned normal texture to material property: ${normalTextureName}`);
      } else if (normalTexture) {
        // If normal texture is not ready yet, assign it once it loads
        normalTexture.onLoadObservable.addOnce(() => {
          (material as any)[normalTextureName] = normalTexture;
          // console.log(`[TerrainMaterial] Assigned normal texture to material property (onLoad): ${normalTextureName}`);
        });
      } else {
        console.error(
          `[TerrainMaterial] Normal texture object for ${normalTextureName} is invalid.`
        );
      }
    });

    // Set up proper specular properties for higher quality highlights
    material.specularPower = 32; // Higher value means sharper, more focused highlights
    // Enable normal mapping in the material
    material.useParallax = true;
    material.useParallaxOcclusion = true;
    material.parallaxScaleBias = 0.01; // Parallax effect amount

    material.roughness = 0.5;
  }

  // Removed: registerShaders, getVertexShader, getFragmentShader
}

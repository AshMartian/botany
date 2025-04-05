import { Scene, Texture, Color3 } from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials';

export default class TerrainMaterial {
  public static create(name: string, scene: Scene): CustomMaterial {
    const material = new CustomMaterial(name, scene);

    // Define Custom Uniforms
    material.AddUniform('heightScale', 'float', 512); // Use the scale from TerrainChunk
    material.AddUniform('mossTex', 'sampler2D', null);
    material.AddUniform('bumpyTex', 'sampler2D', null);
    material.AddUniform('flatTex', 'sampler2D', null);
    material.AddUniform('steepTex', 'sampler2D', null);
    material.AddUniform('rockyTex', 'sampler2D', null);
    material.AddUniform('snowTex', 'sampler2D', null);

    // --- Vertex Shader Modifications ---

    // Define only vHeight varying
    material.Vertex_Definitions(`
        varying float vHeight;
    `);

    // Calculate only vHeight
    material.Vertex_Before_PositionUpdated(`
        // Calculate normalized height (using local position.y)
        vHeight = position.y / heightScale;
    `);

    // --- Fragment Shader Modifications ---

    // Define only vHeight varying
    material.Fragment_Definitions(`
        varying float vHeight;
    `);

    // Inject custom diffuse color calculation, NO slope
    material.Fragment_Custom_Diffuse(`
        // Varyings available:
        // vDiffuseUV: Standard UV from CustomMaterial
        // vPositionW: Standard world position from CustomMaterial
        // vHeight: Custom varying from vertex shader

        // Uniforms available:
        // mossTex, bumpyTex, flatTex, steepTex, rockyTex, snowTex

        // Get height from varying
        float height = vHeight;
        // REMOVED: float slope = vSlope;

        // Scale UVs for tiling using the standard vDiffuseUV varying
        // Ensure material.diffuseTexture is set in setTextures for vDiffuseUV to work
        vec2 scaledUV = vDiffuseUV * 8.0;

        // Sample diffuse textures using scaledUV
        vec4 mossColor = texture(mossTex, scaledUV);
        vec4 bumpyColor = texture(bumpyTex, scaledUV);
        vec4 flatColor = texture(flatTex, scaledUV);
        // vec4 steepColor = texture(steepTex, scaledUV); // Sample if needed later
        // vec4 rockyColor = texture(rockyTex, scaledUV); // Sample if needed later
        vec4 snowColor = texture(snowTex, scaledUV);

        // --- Simplified Blending Logic (Height Only) ---
        // Weights based only on height
        float snowWeight = smoothstep(0.8, 1.0, height);
        float bumpyWeight = smoothstep(0.1, 0.3, height) * (1.0 - snowWeight); // Bumpy below snow
        float flatWeight = smoothstep(0.0, 0.15, height) * (1.0 - bumpyWeight - snowWeight); // Flat at the very bottom
        float mossWeight = max(0.0, 1.0 - (snowWeight + bumpyWeight + flatWeight)); // Moss fills the rest

        // Normalize weights
        float totalWeight = mossWeight + flatWeight + bumpyWeight + snowWeight;
        totalWeight = max(totalWeight, 0.0001); // Add epsilon to prevent division by zero
        mossWeight /= totalWeight;
        flatWeight /= totalWeight;
        bumpyWeight /= totalWeight;
        snowWeight /= totalWeight;

        // Blend diffuse textures (using only 4 now based on height)
        vec3 blendedColor =
            mossColor.rgb * mossWeight +
            flatColor.rgb * flatWeight +
            bumpyColor.rgb * bumpyWeight +
            snowColor.rgb * snowWeight;
            // Removed steepColor and rockyColor from blend

        // Assign final blended color to the diffuseColor variable provided by CustomMaterial
        // CustomMaterial will then use this color for its internal lighting/shadow/fog calculations.
        diffuseColor.rgb = blendedColor;
    `);

    // Standard material properties
    material.wireframe = false;
    material.needAlphaBlending = () => false;
    material.backFaceCulling = true;

    // Set textures (ensure diffuseTexture is set inside this method)
    this.setTextures(material, scene);

    // Set basic material colors (optional, base values)
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    material.ambientColor = new Color3(0.5, 0.5, 0.5);
    // material.diffuseColor = new Color3(1, 1, 1); // Base diffuse, overridden by shader

    // Set specular properties
    material.specularPower = 32;
    material.roughness = 0.8;

    return material;
  }

  // Keep setTextures method as is
  private static setTextures(material: CustomMaterial, scene: Scene): void {
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
      const textureName = textureNames[index];
      const texture = new Texture(
        path,
        scene,
        false, // noMipmap -> false (enable mipmaps for performance)
        true, // invertY
        Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          texture.wrapU = Texture.WRAP_ADDRESSMODE;
          texture.wrapV = Texture.WRAP_ADDRESSMODE;
          texture.hasAlpha = false;
          // Assign texture to the uniform sampler
          (material as any)[textureName] = texture;
          // CRITICAL: Assign one texture to enable vDiffuseUV varying
          if (textureName === 'flatTex') {
            material.diffuseTexture = texture;
            // console.log(`Assigned ${textureName} to material.diffuseTexture`);
          }
        },
        (message) => {
          console.error(`Failed to load texture ${path}:`, message);
        }
      );
      // Assign immediately as well in case onLoad is delayed
      (material as any)[textureName] = texture;
      if (textureName === 'flatTex') {
        material.diffuseTexture = texture;
      }
    });

    // Set up specular properties
    material.specularPower = 32;
    material.roughness = 0.8;
  }
}

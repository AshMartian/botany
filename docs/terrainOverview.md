# Terrain

We are building a Mars Terraforming game where the player plays a botanist who's mission is to plant and grow life on the read planet.

## Heightmap

We have heightmaps patches available at https://ashmartian.com/mars/patch_Z_X.raw
The Mars heightmap is 144x72 patches
X/Z start at 0

Each patch is an int 36k TIFF.

The heightmap images are low resolution, our goal is to get a scale that is close to the actual Mars terrain, for this to look good, we'll need to add some noise to the terrain. Let's render each terrain chunk as 768x768, and fill in the resolution with noise that is dynamic based on the terrain features. (Flat areas should be more noisy, and steep areas smooth)

## Mini Map

We also have colored patch images available at https://ashmartian.com/mars/patch_Z_X_color.jpg
The patches match the heightmap exactly.

## Global Map

A High resolution 2k global map is available in /resources/images/mars/mars_2k_color.jpg (a \_normal and \_topo are available too for rendering the global map in 3d)

# Goals

## Coordinate system

We'll need to come up with a coordinate system which given a player X/Z world position, renders the correct terrain patch.
If spawning a player, do a raycast from an extremely high Y down to hit the terrain.

## Initial Terrain generation

Replace the current babylon 3D level with a babylon.js terrain system that loads dynamically based on the player position.
We'll want to procedurally paint the terrain based on it's features:
/resources/graphics/textures/mars/ will hold the different terrain textures, each with a \_normal

- Terrain0.png: Moss, Terraformed Terrain
- Terrain2.png: For flat areas
- Terrain1.png: For small bumpy terrains
- Terrain3.png: For steeper edges
- Terrain4.png: For steep "rocky" areas
- Terrain5.png: For very high elevation "Snow"

Here's an example from a C# terrain painting script that looked pretty good:

```cs
// CHANGE THE RULES BELOW TO SET THE WEIGHTS OF EACH TEXTURE ON WHATEVER RULES YOU WANT
/*
    0 = moss
    1 = bright mars
*/
// Texture[2] has constant influence
float mossStrength = mossLocations[x, y];
if(mossStrength >= 0.8f) {
    detailMap0[x, y] = 1;
    detailMap1[x, y] = 0; // Placeholder for future detail function
    detailMap2[x, y] = 0; // Placeholder for future detail function
} else {
    detailMap1[x,y] = 0;
    detailMap0[x,y] = 0;
    detailMap2[x,y] = 0;
}
splatWeights[0] = mossStrength;

splatWeights[2] = 0.5f;

// Texture[1] is stronger at lower altitudes
splatWeights[3] = Mathf.Clamp01((terrainData.heightmapResolution - height));
splatWeights[1] = Mathf.Clamp01(steepness*steepness*steepness/(terrainData.heightmapResolution/5.0f)) * 5f;
//splatWeights[6] = Random.Range(0, 6) - Mathf.Clamp01(steepness*steepness*steepness/(terrainData.heightmapHeight/10.0f));
splatWeights[4] = Mathf.Max(steepness / 5, 4f) * Mathf.Clamp01(normal.z);
/*
splatWeights[4] = Mathf.Clamp01((terrainData.heightmapHeight - height + 2));

// Texture[2] stronger on flatter terrain
// Note "steepness" is unbounded, so we "normalise" it by dividing by the extent of heightmap height and scale factor
// Subtract result from 1.0 to give greater weighting to flat surfaces
splatWeights[7] = 1.0f - Mathf.Clamp01(steepness*steepness/(terrainData.heightmapHeight/5.0f));
splatWeights[6] = 0.5f + Mathf.Clamp01(steepness*steepness/(terrainData.heightmapHeight/2.0f));
    */
// Texture[3] increases with height but only on surfaces facing positive Z axis
splatWeights[8] = steepness * Mathf.InverseLerp(0, terrainData.heightmapResolution, height);
if(height > 3000) {
    splatWeights[5] = (terrainData.heightmapResolution / height) * Mathf.Clamp01(normal.z * Mathf.Clamp01(30 / steepness));
    splatWeights[7] = (height / (terrainData.heightmapResolution / 6)) * Mathf.Clamp01(normal.x) * 3;
}

```

## Mini Map

Let's render a dynamic Mini map that displays the player's position center, and a tiled background that represents the patches.

## Global Map

When the player clicks on the mini map, or presses [M], the global map should open in a UI, ideally rendering in full 3D as a globe using the 2k textures, normal, and topo heightmap. It should show the player's position calculated via their coordinates.

# Updated Implementation Plan

## Completed Tasks

- [x] Create basic TerrainManager with chunk loading/unloading logic
- [x] Implement TerrainChunk class with heightmap loading and procedural fallback
- [x] Create MiniMap UI with dynamic player position tracking
- [x] Implement GlobalMap 3D globe visualization
- [x] Establish basic terrain material system with single texture
- [x] Set up coordinate system for chunk positioning

Custom Terrain Shaders in Babylon.js
Implementing a robust terrain system in Babylon.js involves custom shaders for multi-texture blending, dynamic mesh deformation, and careful optimization. Below we break down how to create a Terrain class with custom shader materials for terrain painting (biome blending), ensure it works with lighting/shadows, handle runtime deformation of the mesh, optimize for web performance, and persist terrain edits via IndexedDB or chunked data storage.
Dynamic Shader Materials for Terrain Painting

Example of terrain painting in Babylon.js: multiple ground textures (grass, rock, path) are blended on one mesh via a shader. A red brush indicator shows where the user is painting a new texture layer. Texture Splatting: Terrain “painting” is typically achieved by blending multiple textures using a splat map (also called a mix map or control map). Babylon’s built-in TerrainMaterial uses this technique: it takes 3 diffuse textures plus a mix map whose R,G,B channels determine the blend of each texture​
GRIDEASY.GITHUB.IO
. In other words, the shader samples the mix map and uses its color channels as weights to mix the diffuse textures on the terrain surface​
GRIDEASY.GITHUB.IO
. This approach, known as texture splatting, lets you create varied terrain (grass, sand, rock, etc.) on a single mesh. Custom Shader or Material: To implement custom terrain painting, you have a few options:
Use Babylon’s Materials Library (e.g. TerrainMaterial or MixMaterial) for up to 8 texture layers out-of-the-box​
HTML5GAMEDEVS.COM
. The MixMaterial extends TerrainMaterial to support 8 diffuse textures using two mix maps (RGBA channels) for more complex biomes​
HTML5GAMEDEVS.COM
. These materials already handle lighting and blending internally.
Create a ShaderMaterial with your own GLSL code for ultimate control. You’d pass in multiple texture samplers and a splat map as uniforms, then in the fragment shader combine them. For example, in the fragment shader:
glsl
Copy
vec4 ctrl = texture2D(uMixMap, vUV); // RGBA control map
vec4 col1 = texture2D(uTexture1, vUV _ uTile1);
vec4 col2 = texture2D(uTexture2, vUV _ uTile2);
vec4 col3 = texture2D(uTexture3, vUV _ uTile3);
// Blend textures based on control map channels:
vec4 terrainColor = col1 _ ctrl.r + col2 _ ctrl.g + col3 _ ctrl.b;
// ... then apply lighting calculations to terrainColor
gl_FragColor = terrainColor;
Here uMixMap is a splat texture where each pixel’s RGB corresponds to the intensity of textures 1–3 at that point. You might also use the alpha channel or additional maps for more textures (be mindful of GPU sampler limits – many mobile GPUs cap at 16 textures per shader​
FORUM.BABYLONJS.COM
). Babylon’s BABYLON.ShaderMaterial allows defining such shaders and setting uniform values (like tiling scales uTile1 etc. for each texture).
Use Babylon’s Node Material Editor (NME) for a visual approach. You can create a node material that takes multiple textures and a mix map, then uses Lerp or Mix nodes to blend based on the channels. NodeMaterials integrate with Babylon’s lighting system automatically, which can simplify things.
Painting at Runtime: To “paint” the terrain (terraform or change biomes) in real-time, update the mix/splat map as the user interacts:
One approach is to use a DynamicTexture as the splat map. This gives you a 2D canvas to draw on. For example, you can draw a colored circle onto the DynamicTexture at the brush location to mark a new material. The drawn color (e.g. red for grass, green for rock, blue for sand) affects the corresponding texture’s influence. After drawing, call dynamicTexture.update() to send the updated splat map to the GPU. The shader will immediately use the new mix map data, so the terrain’s appearance updates.
Alternatively, update an array of weights and use a RawTexture. For instance, maintain an Array or TypedArray representing the splat map pixels. When painting, adjust the values in that array for the region, then update the RawTexture (using RawTexture.Update() or reassign it). This might be useful if you have your own data structure for terrain editing.
When using a DynamicTexture or custom shader, ensure your fragment shader knows about all layers you want to blend. Babylon’s TerrainMaterial expects exactly 3 textures (plus one mix map)​
GRIDEASY.GITHUB.IO
, but with a custom shader you could do more if needed (just stay within sampler limits). The example terrain editor by the community allowed painting up to 8 textures by leveraging a custom mix material​
HTML5GAMEDEVS.COM
, which demonstrates the flexibility of custom shaders for terrain. Code – Terrain Material Setup: Below is a simplified example of setting up a custom terrain material using ShaderMaterial in a Terrain class (for brevity, the full GLSL shader code is abstracted):
javascript
Copy
class Terrain {
constructor(scene, options) {
const size = options.size || 100;
const subdivisions = options.subdivisions || 100;
// Create a ground mesh with enough subdivisions for detail, and mark it updatable
this.mesh = BABYLON.MeshBuilder.CreateGround("terrain", {
width: size, height: size, subdivisions: subdivisions, updatable: true
}, scene);
// Prepare textures: 3 diffuse textures and one mix (splat) texture
this.diffuseTextures = [
new BABYLON.Texture("textures/grass.jpg", scene),
new BABYLON.Texture("textures/rock.jpg", scene),
new BABYLON.Texture("textures/sand.jpg", scene)
];
this.mixTexture = new BABYLON.DynamicTexture("splatmap", {width:256, height:256}, scene, false);
this.mixTexture.hasAlpha = true; // use alpha if needed for a 4th channel

    // Initialize the mix map to some default (e.g., all grass initially)
    const ctx = this.mixTexture.getContext();
    ctx.fillStyle = "#ff0000"; // red = full weight for texture1 (grass)
    ctx.fillRect(0, 0, 256, 256);
    this.mixTexture.update();

    // ShaderMaterial with custom vertex/fragment code for blending 3 textures
    const shaderName = "terrainShader";
    // Define shader code (strings or external files). For illustration:
    BABYLON.Effect.ShadersStore[shaderName + "VertexShader"] = `
      precision highp float;
      // Attributes
      attribute vec3 position;
      attribute vec2 uv;
      // Uniforms
      uniform mat4 worldViewProjection;
      // Varyings
      varying vec2 vUV;
      void main(void) {
          vUV = uv;
          gl_Position = worldViewProjection * vec4(position, 1.0);
      }`;
    BABYLON.Effect.ShadersStore[shaderName + "FragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D texture1;
      uniform sampler2D texture2;
      uniform sampler2D texture3;
      uniform sampler2D mixMap;
      void main(void) {
          vec4 ctrl = texture2D(mixMap, vUV);
          vec4 col1 = texture2D(texture1, vUV);
          vec4 col2 = texture2D(texture2, vUV);
          vec4 col3 = texture2D(texture3, vUV);
          // blend the three colors by RGB weights:
          vec3 blended = col1.rgb * ctrl.r + col2.rgb * ctrl.g + col3.rgb * ctrl.b;
          gl_FragColor = vec4(blended, 1.0);
      }`;
    // Create ShaderMaterial
    this.material = new BABYLON.ShaderMaterial("terrainMat", scene, {
        vertex: shaderName, fragment: shaderName,
    }, {
        attributes: ["position", "uv"],
        uniforms: ["worldViewProjection"]
    });
    // Assign textures to the ShaderMaterial
    this.material.setTexture("texture1", this.diffuseTextures[0]);
    this.material.setTexture("texture2", this.diffuseTextures[1]);
    this.material.setTexture("texture3", this.diffuseTextures[2]);
    this.material.setTexture("mixMap", this.mixTexture);
    // Use tri-linear filtering and repeat addressing as needed:
    this.diffuseTextures.forEach(tex => tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE);
    // Assign material to mesh
    this.mesh.material = this.material;

}

paint(x, z, radius, textureIndex) {
// Paint the splatmap at terrain coordinates (x,z) with the selected textureIndex.
// Convert world coords (x,z) to UV space [0,1] on the mixTexture:
const uvX = (x / this.mesh.getBoundingInfo().boundingBox.extendSize.x / 2) + 0.5;
const uvY = (z / this.mesh.getBoundingInfo().boundingBox.extendSize.z / 2) + 0.5;
const ctx = this.mixTexture.getContext();
const px = uvX _ this.mixTexture.getSize().width;
const py = uvY _ this.mixTexture.getSize().height;
const radPx = radius * this.mixTexture.getSize().width;
// Draw a circle on the mix map in the channel corresponding to textureIndex
ctx.globalCompositeOperation = "source-over";
ctx.fillStyle = textureIndex === 0 ? "rgba(255,0,0,1)"
: textureIndex === 1 ? "rgba(0,255,0,1)"
: "rgba(0,0,255,1)";
ctx.beginPath();
ctx.arc(px, py, radPx, 0, 2*Math.PI);
ctx.fill();
this.mixTexture.update(); // send updated mix map to GPU
}
}
In this code, the Terrain class sets up a ground mesh and a ShaderMaterial that blends three textures using a mix map. The paint(x,z,...) method draws onto the mix map at a given position and radius, then updates it. This is a simple example – a real implementation would handle blending between channels (so painting one texture fades out the others smoothly rather than just overwrite). You could also implement different brush hardness by using radial gradients or alpha in the drawn shape. Choosing an Approach: If you prefer not to write GLSL, you can use a CustomMaterial which extends Babylon’s StandardMaterial. This allows injecting custom code into the shader while still using the engine’s lighting/shadow code. For example, you can use material.Fragment_Custom_Diffuse to modify the diffuse color based on a mix map​
FORUM.BABYLONJS.COM
. The advantage is that you get all the StandardMaterial features (lights, fog, shadows) automatically, and only add the blending logic. Babylon’s CustomMaterial and PBRCustomMaterial classes are in the materials library and can be useful for terrain shaders​
FORUM.BABYLONJS.COM
.
Shadows and Lighting Compatibility

A custom terrain with blended textures receiving a shadow from a dynamic object (the torus). Ensuring custom shaders work with Babylon’s lighting and shadow system is crucial for a cohesive scene. When using custom materials, it’s important that they remain compatible with Babylon.js’s forward rendering pipeline — meaning they respond to scene lights and can cast/receive shadows properly. If you use StandardMaterial, PBRMaterial, or their custom variants, Babylon will handle most of this for you. But with a completely custom ShaderMaterial, you must incorporate lighting calculations in your shader code to match Babylon’s forward lighting model. Using Babylon’s Lighting in Custom Shaders: Babylon’s engine provides shader code includes for various lighting aspects (lighting, shadows, fog, etc.). You can leverage these in your ShaderMaterial by using #include<> directives with Babylon’s shader store. For example, to get standard lighting, you might include #include<lightsFragmentFunctions> and #include<lightsFragment> in your fragment shader, and #include<shadowsFragment> for shadow mapping​
FORUM.BABYLONJS.COM
. This is advanced, but essentially Babylon’s internal shaders are modular and you can reuse parts:
glsl
Copy
#include<**decl**lightFragment>[0..maxSimultaneousLights]
#include<lightsFragmentFunctions>
#include<shadowsFragmentFunctions>
...
// then in main() fragment:
#include<lightFragment>[0..maxSimultaneousLights]
This pulls in the code to compute lighting from the active scene lights and apply shadows​
FORUM.BABYLONJS.COM
. You also need to pass the relevant uniforms (light info, shadow maps, etc.) from your material – Babylon’s MaterialHelper can assist in binding these if you use a CustomMaterial approach​
FORUM.BABYLONJS.COM
​
FORUM.BABYLONJS.COM
. CustomMaterial/NodeMaterial Approach: A simpler way is to use NodeMaterial or CustomMaterial:
NodeMaterial: In the Node Material Editor, you can add a Light node which automatically calculates diffuse and specular lighting from scene lights, and a Shadow node that applies shadow darkness based on a light’s shadow map. By plugging your texture blend output into the light node, you get lighting and shadows without writing GLSL by hand.
CustomMaterial: As mentioned, this is an extension of StandardMaterial. For example, after creating a CustomMaterial, you could do:
js
Copy
terrainMat.AddUniform("mixMap", "sampler2D");
terrainMat.Fragment*Custom_Diffuse = ` vec4 ctrl = texture2D(mixMap, vDiffuseUV);
vec4 col1 = texture2D(texture1, vDiffuseUV);
vec4 col2 = texture2D(texture2, vDiffuseUV);
vec4 col3 = texture2D(texture3, vDiffuseUV);
diffuseColor.rgb = col1.rgb * ctrl.r + col2.rgb _ ctrl.g + col3.rgb _ ctrl.b;`;
This injects code to set the diffuseColor (which StandardMaterial will then use when computing lighting). The nice part is shadows, fog, ambient light, etc., all get applied after this, as usual. Using CustomMaterial is recommended if you want to avoid dealing with the full complexity of lighting math yourself​
FORUM.BABYLONJS.COM
.
Enabling Shadows: There are two aspects: making the terrain receive shadows, and making it cast shadows onto other objects. For receiving shadows, the material’s shader needs to use the shadow map. In Babylon’s standard materials, this is automatic. In a custom shader, you’d sample the shadow depth texture and compare, or use Babylon includes as noted. Babylon 4.2+ introduced a ShadowDepthWrapper to help custom materials work with the shadow generator. If you create a ShadowDepthWrapper for your material and add the mesh as a shadow caster, Babylon will handle generating the shadow map using your material’s vertex shader (including any deformations). This is crucial if your shader moves vertices (e.g., height displacement) – otherwise the shadow map wouldn’t match the visual mesh​
FORUM.BABYLONJS.COM
​
FORUM.BABYLONJS.COM
. In older versions, you would use shadowGenerator.customShaderOptions to supply custom shadow shaders​
FORUM.BABYLONJS.COM
, but ShadowDepthWrapper simplifies that process. In practice, for our Terrain class example, if we want the terrain to receive shadows from other objects using our ShaderMaterial, we’d need to integrate the shadow map in the fragment shader or switch to a CustomMaterial/NodeMaterial which already handles it. To cast shadows from the terrain onto other objects (less common for ground, but possible for uneven terrain), we’d register the terrain mesh with the shadow generator: e.g. shadowGenerator.addShadowCaster(terrain.mesh). If using a ShaderMaterial for terrain, also do new BABYLON.ShadowDepthWrapper(terrain.material, scene) so the engine knows to use the terrain’s shader for depth rendering as well. Tip: If you notice that an object’s shadow doesn’t conform to the deformed terrain (e.g., shadows appear as if the terrain was flat), that’s a sign the shadow pass isn’t using your custom vertex shader. In that case, use the wrapper or provide a custom shadow shader that mimics your vertex transformations​
FORUM.BABYLONJS.COM
​
FORUM.BABYLONJS.COM
. When using CustomMaterial, Babylon will handle most of this internally, since the terrain is basically a StandardMaterial underneath (the shadow generator will use the material’s existing defines and vertex code by default).
Runtime Mesh Deformation (Vertex Manipulation)
A dynamic terrain system often allows modifying the terrain shape in real-time (raising/lowering the ground, digging holes, etc.). Babylon.js meshes can be modified at runtime, but it’s important to do it efficiently. Vertex Data Updates: You can retrieve and update a mesh’s vertex positions via mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) and mesh.updateVerticesData(...). Terrain is usually a grid of vertices (from a heightmap). By adjusting the Y coordinate of vertices, you change the terrain elevation. Babylon supports this, but by default the ground created by CreateGroundFromHeightMap is static. Make sure the mesh is created with updatable: true (as we did in the Terrain class constructor). Once updatable, you can manipulate it:
javascript
Copy
deform(x, z, radius, heightDelta) {
// Get current positions array
const positions = this.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
const indices = this.mesh.getIndices();
// Iterate over vertices and raise/lower those within the radius of (x,z)
for (let i = 0; i < positions.length; i += 3) {
let vx = positions[i], vy = positions[i+1], vz = positions[i+2];
// Check distance from (x, z) in terrain local space
let dx = vx - x, dz = vz - z;
if (dx*dx + dz*dz <= radius\*radius) {
positions[i+1] = vy + heightDelta; // adjust height
}
}
// Apply the modified positions back to the mesh
this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
// Recompute normals for correct lighting
const normals = [];
BABYLON.VertexData.ComputeNormals(positions, indices, normals);
this.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
}
This deform method finds all vertices within a given radius of the target point (x,z) and adds heightDelta to their Y coordinate (lifting or lowering the terrain). After updating positions, we recalculate normals so lighting/shading updates appropriately for the new slopes. Babylon’s VertexData.ComputeNormals can regenerate normals from positions and indices. Performance considerations: Directly updating all vertices can be expensive if the mesh is high-density. The Babylon devs note that updating a large heightmap mesh might be “as inefficient as recreating the mesh” in some cases​
FORUM.BABYLONJS.COM
. To keep it efficient:
Limit the area of updates: In the loop above, we check distance from the target point and only modify those in range. This avoids touching every vertex if the brush is small.
Use spatial data structures: If you have a very large terrain, consider splitting it into chunks so you only update a chunk’s vertices when needed (and not iterate over the entire world).
Avoid frequent full recompute: Normal recomputation is costly. If only a few vertices changed, you might update normals for just those faces affected (this requires more math, identifying adjacent triangles). Alternatively, perform deformation in bursts (e.g., apply all user edits once per frame or combine multiple edits) to reduce how often you call ComputeNormals.
GPU-based deformation: An alternative is to offload deformation to the vertex shader. For instance, keep a heightmap texture and have the vertex shader displace vertices based on that. Then editing the terrain means updating the heightmap texture (similar to painting, but this time the texture’s values represent height changes). This way, the heavy lifting of moving vertices is on the GPU. The Babylon DynamicTerrain extension uses a similar idea of adjusting a mesh based on data without recreating it, and can be a reference for efficient terrain updates.
In our Terrain class, one could combine the painting and deformation approach to sculpt the terrain. For example, a “raise terrain” tool could call deform() on each brush stroke. The terrain editor example from the community supports creating mountains, digging lakes, and smoothing, by manipulating the underlying height data and normals in a similar manner​
HTML5GAMEDEVS.COM
. Physics and Collisions: If you use a physics engine or collision detection with the ground, note that after deforming the mesh you should update the physics impostor’s geometry. In Babylon, you might need to dispose and recreate the impostor or use a heightfield shape if supported, whenever the terrain changes significantly.
Performance Considerations for Web Deployment
When deploying a terrain system on the web, performance optimizations are critical due to the real-time nature and the constraints of WebGL. Here are some best practices:
Minimize Draw Calls: Use a single mesh for large terrain areas when possible, or a few large chunks. Each material/mesh combo is a draw call, so drawing one big terrain with one material is often better than many small pieces. If you use chunks (for frustum culling or LOD), ensure they share the same material so they can be drawn with instancing or at least state changes are minimal.
LOD (Level of Detail): Farther terrain chunks can use lower-resolution meshes or textures. Babylon’s DynamicTerrain extension, for example, can adapt the terrain mesh complexity based on camera distance, effectively providing LOD to maintain performance. You can implement a simple LOD by having multiple versions of the mesh or by reducing subdivisions in distant chunks.
Texture Usage: Terrain shaders often sample many textures (diffuse layers, normal maps, control maps). Too many texture lookups can hurt fragment shader performance. Try to limit the number of layers; combine textures if feasible (e.g., pack some detail maps into channels of one texture). Remember that many mobile GPUs cap at 16 simultaneous samplers​
FORUM.BABYLONJS.COM
, and Babylon’s MixMaterial uses 8 diffuse + 2 mix textures which already hits many of those slots. Exceeding that can cause rendering issues or force the engine to do multiple rendering passes.
Mipmap and Texture Size: Use mipmaps for your terrain textures to improve caching and rendering speed at a distance. Also consider using compressed texture formats (like KTX/Basis) for large terrain textures to save GPU memory and bandwidth.
Batching and Instancing: If your terrain is composed of repeated objects (rocks, grass clumps, etc.), use hardware instancing or thin instances. While this doesn’t apply to the terrain surface itself, it’s crucial for the ecosystem on the terrain. For example, hundreds of grass meshes can be drawn with one draw call using thin instances. For the terrain mesh, if you have many identical subdivided grid chunks, you could theoretically use instancing for those and offset them via world matrices – but since terrain chunks usually differ by height data, that’s less straightforward. Instead, ensure your shader is reused across chunks to maximize WebGL program reuse (Babylon will internally share the compiled shader program for all instances of a ShaderMaterial with identical defines).
Freeze and Optimize Static Elements: If your terrain becomes static at some point (e.g., after editing is done), you can call terrain.mesh.freezeWorldMatrix() (if it won’t move) and terrain.mesh.material.freeze() to lock the material. Freezing a material in Babylon will skip re-evaluating lights each frame, which can save some CPU time. Similarly, scene.freezeActiveMeshes() can help if the camera and scene become static relative to the terrain, though typically for a game the camera moves so you wouldn’t freeze that globally.
Use Worker Threads for Heavy CPU Tasks: If you need to regenerate large meshes or do heavy heightmap processing, consider doing it in a Web Worker to avoid bogging down the main thread. You can send height arrays to a worker, compute new vertices/normals there, then send back to the main thread to apply to the mesh.
Culling: Ensure that if you use many chunks, Babylon’s frustum culling is enabled (it is by default) so off-screen chunks aren’t rendered. If you implement your own terrain rendering, you can also manually toggle mesh .setEnabled(false) on chunks far outside the camera range.
In summary, try to strike a balance between large contiguous terrain (for fewer draw calls) and segmented terrain (for culling and LOD). Many implementations use a grid of chunks that are updated as the camera moves (infinite scrolling terrain) – Babylon’s DynamicTerrain does exactly that, moving a mesh under the camera and updating heights from a heightmap for the new area, rather than rendering an immense static mesh​
GITHUB.COM
. Such techniques keep the vertex count constant while giving the impression of a vast world.
Saving and Loading Terrain State (IndexedDB & Chunking)
After allowing users to modify the terrain (both texture painting and geometry deformation), you’ll likely want to save those changes so they persist. There are a few approaches to store and reload terrain data in a web context:
Heightmaps and Splatmaps: One straightforward method is to serialize the terrain’s height map and splat map. For example, you can save the height array (or a PNG image of it) and the mix map (as an image or array). These can be stored in the browser. IndexedDB is a good choice for potentially large binary data, since it can handle blobs and large objects (whereas localStorage is limited to a few MB and only stores strings). Babylon.js has built-in support for saving entire scenes to IndexedDB for offline use​
DAVROUS.COM
(used when you see enable offline manifest functionality), but for custom data you’ll manually use the IndexedDB API or a library like LocalForage. A tip from the Babylon team: you can store textures (images) as blobs in IndexedDB so that they can be loaded offline​
DAVROUS.COM
– this could apply to your splatmap or any custom texture the user creates. Keep in mind browser storage quotas (often 50-250MB per domain without user permission, depending on browser)​
DAVROUS.COM
.
Chunk-Based Persistence: If your world is huge or procedurally generated, it’s wise to divide the terrain into chunks and save each chunk separately. For instance, you could divide the terrain into a grid of 100×100 meter sections. Each chunk could have its own height data array and splatmap. When the user edits, determine which chunk(s) got modified and save only those. This way you don’t always write a giant dataset — you update smaller pieces. In IndexedDB you might have an object store for “terrainChunks” keyed by chunk coordinates (like chunk_x_y as the key, and an object containing height and texture data as the value). On load, you iterate through chunks and reconstruct the terrain. This is similar to how voxel engines (like Minecraft) save regions of the world. The dynamic terrain editor example saved terrain to two Babylon files: one for the terrain mesh with its textures, and one for additional scene objects​
HTML5GAMEDEVS.COM
​
HTML5GAMEDEVS.COM
– showing that separating terrain data can be useful.
Scene Export: If the terrain is relatively small or you prefer an easier route, you can actually use Babylon’s scene serialization. The SceneSerializer can serialize the entire scene or just the terrain mesh to a JSON .babylon file. The community terrain editor tool, for example, allows exporting the terrain as a Babylon file with all textures embedded​
HTML5GAMEDEVS.COM
. You could let the user download this file (or save it to IndexedDB for offline use). Later, you can load it via SceneLoader. The advantage is Babylon’s serialization will preserve the mesh geometry and material (including a CustomMaterial’s configurations or a NodeMaterial, etc.). The disadvantage is the file could be large if the mesh is high poly or if textures aren’t compressed. Still, for many cases, a saved .babylon or glTF file (glTF might be smaller) is perfectly fine. You can also combine approaches: e.g., serialize just the height data and reapply it to a generated mesh at load, which might be faster than storing the entire mesh JSON.
Using IndexedDB API: To give a brief idea, using IndexedDB involves opening a database, creating an object store, then adding or retrieving data. For example:
javascript
Copy
// Save data
let request = indexedDB.open("TerrainDB", 1);
request.onupgradeneeded = function() {
let db = request.result;
db.createObjectStore("chunks");
};
request.onsuccess = function() {
let db = request.result;
let transaction = db.transaction("chunks", "readwrite");
let store = transaction.objectStore("chunks");
// Save chunk at (cx, cy)
let key = `chunk*${cx}_${cy}`;
  let value = { heights: heightArray, splat: mixMapImageData };
  store.put(value, key);
};
// Load data
// ... (open DB as above)
let store = db.transaction("chunks").objectStore("chunks");
let getRequest = store.get(`chunk*${cx}*${cy}`);
getRequest.onsuccess = () => {
let data = getRequest.result;
if (data) {
applyHeightsToMesh(data.heights);
applySplatToTexture(data.splat);
}
};
In this pseudocode, heightArray could be a Float32Array of heights, and mixMapImageData could be raw pixel data or even a base64 string of an image. You might need to convert typed arrays to ArrayBuffer or such to store. Also, consider compression (maybe use pako to gzip the data before storing to save space).
Testing and Quota: Always test the save/load in a real browser scenario. IndexedDB operations are asynchronous and can fail if the user hasn’t granted more space and you exceed the limit. It’s good to handle errors (e.g., if quota is exceeded, maybe fallback to prompting the user to download the file instead).
The key with saving terrain is deciding how much data and how to structure it. If the terrain is static size and resolution (say a 512x512 grid), saving two 512x512 images (heightmap and splatmap) is easy and not too large. If the terrain is endless, chunk it and only save what’s modified or needed. Also, cleaning up data (allow users to clear storage or remove old chunks) is important to not fill the storage over time.
Babylon.js Libraries, Limitations, and Best Practices
In the process of implementing custom terrain shaders and systems, keep in mind:
Babylon.js Extensions: The DynamicTerrain extension can be a starting point or reference. It handles creating a large scrolling terrain from a height map, with the ability to update the height data dynamically. It’s not built into the core, but available in the extensions (community) library​
GITHUB.COM
. If you need infinite terrain or very large worlds, consider studying its approach.
Materials Library: We mentioned TerrainMaterial and MixMaterial. These are part of the Babylon.js materials library (you need to include the library script to use them). They solve multi-texturing and even normals for you – TerrainMaterial supports diffuse and bump textures per layer​
GRIDEASY.GITHUB.IO
. However, they are somewhat less flexible than writing your own shader (for example, TerrainMaterial blends strictly by one mix map and exactly 3 textures). If those fit your needs, they can save time.
Precision and Scale: WebGL has limits on vertex buffer size (usually up to ~65k vertices per mesh if using 16-bit indices, though Babylon will automatically use 32-bit indices for larger meshes if WebGL supports it). If you have a very high resolution heightmap, you may need to split it into multiple meshes. Also consider the coordinate scale – extremely large coordinates can lead to floating-point precision issues in shaders (z-fighting or jitter in vertex positioning). It’s often wise to keep the terrain centered near origin and move the world around the player if dealing with huge worlds, to avoid precision loss.
Forward vs. Deferred: Babylon supports both forward and deferred rendering. The forward pipeline is the default and works with all materials. If you ever use deferred rendering, custom materials need special care (they must output into GBuffers). For terrain and forward rendering (which is most common for WebGL), just be sure to account for multiple lights if you use them (by default StandardMaterial supports 4 lights; you can increase with defines).
Shadows Limitations: Too many blended transparent layers can complicate shadows. If your terrain shader uses alpha blending (say for blending at edges), note that only opaque or alpha-test geometry can cast proper shadows by default. If you find you need semi-transparency in the terrain (not common), you might need to enable shadowGenerator.transparencyShadow = true so transparent pixels still contribute to the shadow map​
FORUM.BABYLONJS.COM
.
Testing on Low-End Devices: Because this is WebGL, always test your terrain on a range of devices (especially if targeting mobile). Shrink textures or reduce shader complexity if you hit performance issues. Sometimes a slightly less pretty shader that runs smoothly is preferable to a complex one that lags on mid-tier hardware.
By following these practices – using efficient shaders for texture blending, integrating with Babylon’s lighting and shadows, updating the mesh responsibly, optimizing draw calls, and storing terrain changes prudently – you can build a powerful web-based terrain editor or game. Babylon.js is quite capable for this scenario, as evidenced by community projects like the TerrainEditor which implement painting, sculpting, and saving of terrain entirely in-browser​
HTML5GAMEDEVS.COM
​
HTML5GAMEDEVS.COM
. With careful attention to performance and some WebGL shader know-how, your custom terrain system can be both flexible and fast.

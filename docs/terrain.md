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

## Remaining Tasks

- [ ] Implement multi-texture blending based on terrain features
- [ ] Add dynamic noise injection for terrain detail enhancement
- [ ] Complete MiniMap tiled background implementation
- [ ] Add GlobalMap teleportation functionality
- [ ] Implement LOD system for terrain chunks
- [ ] Create player spawning system with terrain raycast
- [ ] Develop shader-based splat map system for texture blending
- [ ] Add terrain physics and collision detection
- [ ] Implement network synchronization for chunk updates
- [ ] Optimize terrain material system with normal maps

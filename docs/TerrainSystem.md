# Mars Terrain System

## Coordinate Systems

The Mars terrain system uses three coordinate systems:

1. **Virtual Coordinates** - The full Mars coordinate space (0-10,224 x 0-5,112)

   - Consistent across the entire game
   - Not affected by world shifting
   - Used for global positioning and persistence

2. **Engine Coordinates** - The actual 3D space coordinates

   - The player stays near (0,0,0)
   - The world shifts around the player
   - Limited range to maintain floating-point precision

3. **Chunk Coordinates (Sectors)** - Integer grid of terrain chunks (0-71 x 0-143)
   - Used to identify and load specific terrain patches
   - Mapped to raw heightmap files

### Coordinate Transformation

It is IMPORTANT to translate virtual global coordinates to local engine positions. WebGL has **visual** artifacts over 10k in any direction.

- `WorldManager.toVirtual(enginePosition)`: Converts engine coordinates to virtual coordinates
- `WorldManager.toEngine(virtualPosition)`: Converts virtual coordinates to engine coordinates

## Heightmap Loading

Heightmaps are loaded from 16-bit RAW files at https://ashmartian.com/mars/patch_Z_X.raw

The critical part is parsing the 16-bit heightmap correctly:

```typescript
// Parse the data following the C# implementation
let i = 0;
// Note the flipped Z order (from size-1 to 0) matching the C# implementation
for (let z = size - 1; z >= 0; z--) {
  for (let x = 0; x < size; x++) {
    // Convert two bytes to a normalized height (0-1 range)
    data[x + z * size] = (bytes[i + 1] * 256 + bytes[i]) / 65535;
    i += 2; // Move to next 2-byte pair
  }
}
```

## Terrain Chunk Management

The `TerrainManager` handles chunk loading, unloading, and positioning:

1. Maintains a map of loaded chunks by coordinate key
2. Dynamically loads chunks around the player
3. Unloads distant chunks to maintain performance
4. Coordinates terrain stitching between adjacent chunks

## Terrain Stitching

To avoid seams between terrain chunks, we implement edge stitching:

```typescript
public stitchWithNeighbor(neighbor: TerrainChunk, direction: 'left' | 'right' | 'top' | 'bottom'): void {
  // Copy edge heights between adjacent chunks
  // E.g., For 'left' direction:
  for (let z = 0; z < this.resolution; z++) {
    const thisIdx = (0 + z * this.resolution) * 3 + 1; // Y component of first column
    const neighborIdx = ((this.resolution - 1) + z * this.resolution) * 3 + 1; // Y component of last column

    // Copy height value (Y coordinate) to ensure smooth transitions
    vertexData.positions[thisIdx] = neighborPositions[neighborIdx];
  }
}
```

## Unity C# Version

Here is the full C# Load Terrain logic that we are working to migrate to Babylon.JS

```cs
using System;
using System.IO;
using System.Collections;
using System.Linq;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.AzureSky;
using UnityEngine.Networking;
using NumSharp;

public class SectorChangeEvent : UnityEvent<int, int>{}
public class LoadTerrain : MonoBehaviour
{

    public GameObject Player;
    Goals goals;
    public Material TerrainMaterial;
    public int terrainGridX = 34;
    public int terrainGridY = 16;
    public int terrainHeight = 1024;

    GameObject TerrainParent;

    public TerrainLayer[] terrainLayers;
    public Texture2D[] terrainDetailTextures;
    public GameObject[] terrainDetailGameObjects;
    public DetailPrototype[] terrainDetails;

    public int resolution = 32;
    public int patchResolution = 512;
    public int terrainResolution;
    public int subWidth;
    public int terrainScale = 16;
    public int chunkCache = 2;

    public int terrainWidth;

    public Texture2D terrainNoise;

    public Terrain[,][,] terrains;

    float[,] noise;

    public bool readyForActivate = true;
    Vector3 lastPlayerPosition = new Vector3(0, -6000, 0);

    public float viewDistance = 2048;

    int rowRangeStart = 0;
    int rowRangeCount = 0;
    int colRangeStart = 0;
    int colRangeCount = 0;

    public float currentRow;
    public float currentCol;

    bool init = true;

    public MapController map;

    public SectorChangeEvent sectorChange = new SectorChangeEvent();

    private void Awake() {
        Player.GetComponent<Rigidbody>().isKinematic = true;
    }
    // Start is called before the first frame update
    void Start() {
        goals = Player.GetComponent<Goals>();
        TerrainParent = new GameObject("Mars");
        terrains = new Terrain[terrainGridX + 1, terrainGridY + 1][,];
        terrainResolution = patchResolution / resolution;
        terrainWidth = (patchResolution * terrainScale);
        subWidth = (resolution * terrainScale);
        //noise = LoadTerrainNoise(terrainNoise.GetRawTextureData());

        terrainDetails = new DetailPrototype[terrainDetailTextures.Length + terrainDetailGameObjects.Length];
        int i = 0;
        foreach(Texture2D detailTex in terrainDetailTextures) {
            DetailPrototype detail = new DetailPrototype();
            detail.prototypeTexture = detailTex;
            terrainDetails[i] = detail;
            i++;
        }
        foreach(GameObject detailGO in terrainDetailGameObjects) {
            DetailPrototype detail = new DetailPrototype();
            detail.prototype = detailGO;
            detail.prototypeTexture = terrainDetailTextures[0];
            terrainDetails[i] = detail;
            i++;
        }

        if(Application.platform == RuntimePlatform.WebGLPlayer) {
            chunkCache = 1;
        }
        sectorChange.AddListener((col, row) => {
            setTime();
        });
        //RenderPatch(8, 18);
        //CheckPosition();
    }

    // Update is called once per frame
    bool fresh = true;
    public float maxChunkDistance;
    public int chunkMultiplier;
    void Update() {
        if(init) {
            Player.GetComponent<Rigidbody>().isKinematic = true;
        } else if(fresh) {
            fresh = false;
            Player.GetComponent<Rigidbody>().isKinematic = false;
        }
        try {
            if(readyForActivate && goals.gameLoaded)
                StartCoroutine("CheckPosition");
        } catch {
            readyForActivate = true;
        }
        var timeController = GameObject.Find("Skybox").GetComponent<AzureTimeController>();
        timeController.SetTimeline(timeController.GetTimeline() + 0.02f); // Time lapse
    }

    ///<summary>Accepts world position and returns chunk (17.5, 7.2) (col, row)</summary>
    public Vector2 worldToMap(Vector3 position) {
        return new Vector2((float)Math.Ceiling((double)terrainGridX / 2) - (position.x / terrainWidth), (position.z / terrainWidth) + (float)Math.Ceiling((double)terrainGridY / 2));
    }
    ///<summary>Accepts chunk position (17.5, 7.2) (col, row) and returns world position</summary>
    public Vector3 mapToWorld(Vector2 position) {
        return new Vector3(((float)Math.Ceiling((double)terrainGridX / 2) - position.x) * terrainWidth, 0, (position.y - (float)Math.Ceiling((double)terrainGridY / 2)) * terrainWidth);
    }
    ///<summary>Accepts map position (17.5, 7.2) (col, row) and returns (lat, long)
    public Vector2 mapToLatLong(Vector2 position) {
        return new Vector2((180 * (position.x / terrainGridX)) - 90, (360 * (position.y / terrainGridY)) - 180);
    }
    ///<summary>Accepts (lat, long) and returns (col, row)
    public Vector2 latLongToMap(Vector2 position) {
        return new Vector2(terrainGridX * ((position.y + 90) / 180), terrainGridY * ((position.x + 180) / 360));
    }
    public float localTime = 0;
    public float latitude = 0;
    public float longitude = 0;
    float lastSetTimePos = 0;
    public void setTime() {
        lastSetTimePos = currentRow + currentCol;
        localTime = DateTime.UtcNow.Hour + (DateTime.UtcNow.Minute / 60) + (24 * (currentRow / terrainGridY));
        latitude = (180 * (currentCol / terrainGridX)) - 90;
        longitude = (360 * (currentRow / terrainGridY)) - 180;
        if(localTime > 24) localTime -= 24;
        var timeController = GameObject.Find("Skybox").GetComponent<AzureTimeController>();
        if (currentRow + currentCol != lastSetTimePos) {
            timeController.SetTimeline(localTime);
            timeController.m_latitude = latitude;
        }
    }
    public IEnumerator CheckPosition() {
        yield return null;
        if(Vector3.Distance(lastPlayerPosition, Player.transform.position) > 64 || readyForActivate || init) {
            readyForActivate = false;
            chunkMultiplier = Math.Max(1, Mathf.CeilToInt((viewDistance * 1.5f) / terrainWidth));
            maxChunkDistance = viewDistance + (terrainWidth * (chunkCache + chunkMultiplier));
            lastPlayerPosition = Player.transform.position;

            Vector3 zeroYPlayerPos = new Vector3(lastPlayerPosition.x, 0, lastPlayerPosition.z);
            Vector2 playerToMap = worldToMap(zeroYPlayerPos);
            int row = (int)Math.Floor(playerToMap.y);
            int col = (int)Math.Ceiling(playerToMap.x);
            currentCol = playerToMap.x;
            currentRow = playerToMap.y;
            SetMapImage(col, row);


            colRangeStart = new [] {colRangeStart, col - chunkMultiplier}.Min();
            colRangeCount = new [] {colRangeCount, col + chunkMultiplier}.Max();
            rowRangeStart = new [] {rowRangeStart, row - chunkMultiplier}.Min();
            rowRangeCount = new [] {rowRangeCount, row + chunkMultiplier}.Max();



            for(int c = colRangeStart; c <= colRangeCount; c++) {
                for(int r = rowRangeStart; r <= rowRangeCount; r++) {
                    if(terrains[c, r] != null) {
                        if(Vector3.Distance(zeroYPlayerPos, new Vector3(terrains[c, r][0, 0].transform.parent.transform.position.x + (terrainWidth / 2), 0, terrains[c, r][0, 0].transform.parent.transform.position.z + (terrainWidth / 2))) <= maxChunkDistance) {
                            for(int cp = 0; cp < terrainResolution; cp++) {
                                for(int rp = 0; rp < terrainResolution; rp++) {
                                    if(Vector3.Distance(zeroYPlayerPos, new Vector3(terrains[c, r][cp, rp].gameObject.transform.position.x + (subWidth / 2), 0, terrains[c, r][cp, rp].gameObject.transform.position.z + (subWidth / 2))) <= viewDistance) { //
                                        terrains[c, r][cp, rp].gameObject.SetActive(true);
                                        init = false;
                                    } else {
                                        terrains[c, r][cp, rp].gameObject.SetActive(false);
                                    }
                                }
                            }
                        } else {
                            terrains[c, r][0, 0].gameObject.transform.parent.gameObject.SetActive(false);
                            Destroy(terrains[c, r][0, 0].gameObject.transform.parent.gameObject);
                            terrains[c, r] = null;
                        }
                    }
                }
            }

            if(terrains[col, row] == null) {
                yield return RenderPatch(col, row, zeroYPlayerPos);
            }

            for(int offset = 1; offset <= chunkMultiplier; offset++) {
                if(terrains[col, row + offset] == null) {
                    yield return RenderPatch(col, row + offset, zeroYPlayerPos);
                }
                if(terrains[col + offset, row + offset] == null) {
                    yield return RenderPatch(col + offset, row + offset, zeroYPlayerPos);
                }
                if(terrains[col + offset, row] == null) {
                    yield return RenderPatch(col + offset, row, zeroYPlayerPos);
                }
                if(terrains[col + offset, row - offset] == null) {
                    yield return RenderPatch(col + offset, row - offset, zeroYPlayerPos);
                }
                if(terrains[col, row - offset] == null) {
                    yield return RenderPatch(col, row - offset, zeroYPlayerPos);
                }
                if(terrains[col - offset, row] == null) {
                    yield return RenderPatch(col - offset, row, zeroYPlayerPos);
                }
                if(terrains[col - offset, row + offset] == null) {
                    yield return RenderPatch(col - offset, row + offset, zeroYPlayerPos);
                }
                if(terrains[col - offset, row - offset] == null) {
                    yield return RenderPatch(col - offset, row - offset, zeroYPlayerPos);
                }
                for(int depth = 1; depth < offset; depth ++) {
                    if(terrains[col - offset + depth, row + offset] == null) {
                        yield return RenderPatch(col - offset + depth, row + offset, zeroYPlayerPos);
                    }
                    if(terrains[col - offset, row - offset + depth] == null) {
                        yield return RenderPatch(col - offset, row - offset + depth, zeroYPlayerPos);
                    }
                    if(terrains[col - offset, row + offset - depth] == null) {
                        yield return RenderPatch(col - offset, row + offset - depth, zeroYPlayerPos);
                    }
                    if(terrains[col + offset - depth, row + offset] == null) {
                        yield return RenderPatch(col + offset - depth, row + offset, zeroYPlayerPos);
                    }
                    if(terrains[col + offset, row - offset + depth] == null) {
                        yield return RenderPatch(col + offset, row - offset + depth, zeroYPlayerPos);
                    }
                    if(terrains[col + offset, row + offset - depth] == null) {
                        yield return RenderPatch(col + offset, row + offset - depth, zeroYPlayerPos);
                    }
                    if(terrains[col, row - offset + depth] == null) {
                        yield return RenderPatch(col, row - offset + depth, zeroYPlayerPos);
                    }
                    if(terrains[col, row + offset - depth] == null) {
                        yield return RenderPatch(col, row + offset - depth, zeroYPlayerPos);
                    }
                    if(terrains[col - offset + depth, row] == null) {
                        yield return RenderPatch(col - offset + depth, row, zeroYPlayerPos);
                    }
                    if(terrains[col + offset - depth, row] == null) {
                        yield return RenderPatch(col + offset - depth, row, zeroYPlayerPos);
                    }
                }
            }

//            int rowP = (int)((lastPlayerPosition.z - terrainWidth - viewDistance) / terrainWidth) + (terrainGridY / 2); old math
//            int colP = (int)(terrainGridX / 2) - (int)(lastPlayerPosition.x - terrainWidth - viewDistance) / terrainWidth;


            readyForActivate = true;
        }
    }

    public void clearTerrains() {
        if(terrains == null) return;
        for(int c = colRangeStart; c <= colRangeCount; c++) {
            for(int r = rowRangeStart; r <= rowRangeCount; r++) {
                if(terrains[c, r] != null) {
                    terrains[c, r][0, 0].gameObject.transform.parent.gameObject.SetActive(false);
                    Destroy(terrains[c, r][0, 0].gameObject.transform.parent.gameObject);
                    terrains[c, r] = null;
                }
            }
        }
        colRangeStart = 0;
        colRangeCount = 0;
        rowRangeStart = 0;
        rowRangeCount = 0;
    }

    IEnumerator RenderPatch(int col, int row, Vector3 playerPos) {
        yield return null;
        if(GameObject.Find("patch_"+col+"_"+row)) yield break;
        sectorChange.Invoke(col, row);
        GameObject patch = new GameObject("patch_"+col+"_"+row);
        patch.transform.parent = TerrainParent.transform;
        patch.transform.localPosition = new Vector3(-(col - (int)(terrainGridX / 2)) * (patchResolution * terrainScale), 0, (row - (int)(terrainGridY / 2)) * (patchResolution * terrainScale));
        //if(Vector3.Distance(playerPos, patch.transform.localPosition) + (patchResolution / 2) >= maxChunkDistance) yield break;

        UnityEngine.Debug.Log("Rendering col " + col + " " + row);
        Terrain[,] patchTerrains = new Terrain[terrainResolution, terrainResolution];
        string file = "Terrains/patch_"+col+"_"+row+".raw";
        byte[] rawBytes = new byte[0];
#if UNITY_WEBGL || UNITY_ANDROID || UNITY_EDITOR
        string url = Path.Combine(Application.streamingAssetsPath, file); //"https://cybertruck.ashmartian.com/StreamingAssets/" + file; //Application.absoluteURL + "/" + aFileName;
#if UNITY_EDITOR
        url = "https://cybertruck.ashmartian.com/StreamingAssets/" + file;
#endif
        UnityEngine.Debug.Log("Getting URL " + url);
        var www = UnityEngine.Networking.UnityWebRequest.Get(url);
        www.timeout = 5;
        yield return www.SendWebRequest();
        if (www.isNetworkError || www.isHttpError) {
            Debug.Log(www.error);
        } else {
            //Debug.Log("Got " + www.downloadHandler.data.Length + " data");
            //vals = new byte[size * size * 2];
            rawBytes = www.downloadHandler.data;
        }
#else
        rawBytes = LoadTerrainRaw(file);
#endif

        float[,] data = parseTerrainData(rawBytes);
        NDArray splitData = np.array(data).reshape(patchResolution, patchResolution);
        for(int y = 0; y < terrainResolution; y++) {
            int yR = y * resolution;
            for(int x = 0; x < terrainResolution; x++) {
                int xR = x * resolution;
                float[,] terrainData = (float[,])(splitData[yR+":"+(yR + resolution + 1)+","+xR+":"+(xR + resolution + 1)]);
                //terrainData = AddTerrainNoise(terrainData);
                GameObject subPatch = new GameObject("sub_"+y+"_"+x);
                subPatch.transform.parent = patch.transform;
                subPatch.transform.localPosition = new Vector3(xR * terrainScale, 0, yR * terrainScale);
                subPatch.tag = "Terrain";
                subPatch.layer = 11;
                subPatch.SetActive(false);
                Terrain newTerrain = CreateTerrain(subPatch, terrainData);
                patchTerrains[y, x] = newTerrain;
            }
        }
        for(int y = 0; y < patchResolution / resolution; y++) {
            for(int x = 0; x < patchResolution / resolution; x++) {
                Terrain left = null, right = null, top = null, bottom = null;
                if(x > 0) {
                    left = patchTerrains[y, x - 1];
                } else if(terrains[col + 1, row] != null) {
                    left = terrains[col + 1, row][y, terrainResolution - 1];
                    left.materialTemplate.SetColor("_Color", Color.red);
                    StitchToLeft(left, patchTerrains[y, x]);
                    left.SetNeighbors(left.leftNeighbor, left.topNeighbor, patchTerrains[y, x], left.bottomNeighbor);
                    //UnityEngine.Debug.Log("Stitching left");
                }
                if(x < patchResolution / resolution - 1) {
                    right = patchTerrains[y, x + 1];
                } else if(terrains[col - 1, row] != null) {
                    right = terrains[col - 1, row][y, 0];
                    StitchToLeft(patchTerrains[y, x], right);
                    right.SetNeighbors(patchTerrains[y, x], right.bottomNeighbor, right.rightNeighbor, right.bottomNeighbor);
                    //UnityEngine.Debug.Log("Stitching right");
                }
                if(y > 0) {
                    top = patchTerrains[y - 1, x];
                } else if(terrains[col, row - 1] != null) {
                    top = terrains[col, row - 1][terrainResolution - 1, x];
                    StitchToBottom(top, patchTerrains[y, x]);
                    top.SetNeighbors(top.leftNeighbor, top.bottomNeighbor, top.rightNeighbor, patchTerrains[y, x]);
                    //UnityEngine.Debug.Log("Stitching top");
                }
                if(y < patchResolution / resolution - 1) {
                    bottom = patchTerrains[y + 1, x];
                } else if(terrains[col, row + 1] != null) {
                    bottom = terrains[col, row + 1][0, x];
                    StitchToBottom(patchTerrains[y, x], bottom);
                    bottom.SetNeighbors(bottom.topNeighbor, patchTerrains[y, x], bottom.rightNeighbor, bottom.bottomNeighbor);
                    //UnityEngine.Debug.Log("Stitching bottom");
                }
                patchTerrains[y, x].SetNeighbors(left, right, top, bottom);
            }
        }
        terrains[col, row] = patchTerrains;

    }

    void SetMapImage(int col, int row) {
        if(map != null) {
            map.currentRow = row;
            map.currentCol = col;
        }
    }

    Terrain CreateTerrain(GameObject parent, float[,] data) {
        TerrainData _TerrainData = new TerrainData();

        _TerrainData.heightmapResolution = data.GetLength(0);
        _TerrainData.baseMapResolution = resolution;
        _TerrainData.alphamapResolution = resolution;
        _TerrainData.SetDetailResolution(resolution, 16);
        //_TerrainData.terrainLayers = terrainLayers;
        // Update Base Map Dist to be 4x render distance

        TerrainCollider _TerrainCollider = parent.AddComponent<TerrainCollider>();
        Terrain _Terrain2 = parent.AddComponent<Terrain>();
        Terraform tf = parent.AddComponent<Terraform>();
        tf.terrainLayers = terrainLayers;
        tf.terrainDetails = terrainDetails;
        tf.mossRange = 20;

        _TerrainCollider.terrainData = _TerrainData;
        _Terrain2.terrainData = _TerrainData;
        _Terrain2.materialTemplate = TerrainMaterial;
        _Terrain2.allowAutoConnect = true;
        _Terrain2.basemapDistance = (float)(maxChunkDistance / 0.75);

        _TerrainData.SetHeights(0, 0, data);
        _TerrainData.size = new Vector3(resolution * terrainScale, terrainHeight, resolution * terrainScale);
        return _Terrain2;
    }

// From https://gamedev.stackexchange.com/a/178657
    public void StitchToLeft(Terrain terrain, Terrain leftNeighbor)
    {
        TerrainData data = terrain.terrainData;
        //leftNeighbor.terrainData.SetHeights(resolution, 0, leftNeighbor.terrainData.GetHeights(resolution, 0, 1, resolution));
        // Take the last x-column of neighbors heightmap array
        // 1 pixel wide (single x value), resolution pixels tall (all y values)
        float[,] edgeValues = leftNeighbor.terrainData.GetHeights(0, 0, 1, resolution + 1);

        // Stitch with other terrain by setting same heightmap values on the edge
        data.SetHeights(resolution, 0, edgeValues);
    }

    public void StitchToBottom(Terrain terrain, Terrain bottomNeighbor)
    {
        TerrainData data = terrain.terrainData;
        //bottomNeighbor.terrainData.SetHeights(0, resolution, bottomNeighbor.terrainData.GetHeights(0, resolution, resolution, 1));
        // Take the top y-column of neighbors heightmap array
        // resolution pixels wide (all x values), 1 pixel tall (single y value)
        float[,] edgeValues = bottomNeighbor.terrainData.GetHeights(0, 0, resolution + 1, 1);

        // Stitch with other terrain by setting same heightmap values on the edge
        data.SetHeights(0, resolution, edgeValues);
    }
    AssetBundle bundle;
    public string assetBundleURL = "https://cybertruck.ashmartian.com/assets/mars";
    public IEnumerator LoadAssetBundle() {
        using (UnityWebRequest uwr = UnityWebRequestAssetBundle.GetAssetBundle(assetBundleURL)) {
            yield return uwr.SendWebRequest();

            if (uwr.responseCode != 200) {
                Debug.Log(uwr.error);
            } else {
                // Get downloaded asset bundle
                bundle = DownloadHandlerAssetBundle.GetContent(uwr);
            }
        }
    }

    byte[] LoadTerrainFromAssetBundle(string fileName) {
        if(bundle == null) {
            StartCoroutine(LoadAssetBundle());
        }
        // Load the TextAsset object
        TextAsset txt = bundle.LoadAsset<TextAsset>(fileName);

        // Retrieve the binary data as an array of bytes
        byte[] bytes = txt.bytes;

        return bytes;
    }

    byte[] LoadTerrainRaw(string aFileName) {
        System.IO.FileInfo fileInfo = new System.IO.FileInfo(Path.Combine(Application.streamingAssetsPath, aFileName));
        System.IO.FileStream stream = fileInfo.Open(System.IO.FileMode.Open, System.IO.FileAccess.Read);

        int size = (int)Mathf.Sqrt(stream.Length / 2);
        byte[] vals = new byte[size * size * 2];
        //float[,] rawHeights = new float[size, size];

        stream.Read(vals, 0, vals.Length);
        stream.Close();
        return vals;
    }

    float[,] parseTerrainData(byte[] vals) {
        int size = (int)Mathf.Sqrt(vals.Length / 2);
        int h = patchResolution;
        int w = h;
        float[,] data = new float[h, w];
        int i = 0;
        for (int z = size - 1; z >= 0; z--) {
            for (int x = 0; x < size; x++) {
                data[x,z] = ((vals[i + 1] * 256f + vals[i]) / 65535f);
                i += 2;
            }
        }

        //aTerrain.SetHeights(0, 0, data);
        return data;
    }

}
```

## World Shifting

As the player moves, we maintain floating-point precision by keeping the player near the origin and shifting the world:

1. Player movement is tracked in engine space
2. When player moves too far from origin (beyond `PRECISION_THRESHOLD`), world shifts
3. During teleportation, the world is completely reset around the new destination
4. `WorldManager.teleportTo(virtualPosition)` updates the global offset

## Teleportation Process

The teleport system:

1. Takes a virtual position as destination
2. Sets the world offset to that position
3. Resets player to origin (0,0,0)
4. Clears all existing terrain chunks
5. Loads new terrain chunks around the player's new position
6. Performs raycasts to find ground height
7. Positions player on terrain

## Debugging Tips

- Use visible markers to debug positions and raycasts
- Log key coordinate transformations
- Implement multiple raycast fallbacks with different heights and patterns
- Validate mesh creation and positioning with assertions
- Think in first principals, don't optimize something that shouldn't exist, always find simpler ways of accomplishing the goal. Reduce complexity, then optimize.

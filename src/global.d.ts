/* eslint-disable no-var */
import { Scene, ShadowGenerator, Vector3, ShaderMaterial } from '@babylonjs/core';
import { Container } from '@/models/scene/ContainerManager'; // Assuming Container is the correct type for assetContainers
import Collisions from '@/models/mehanics/Collisions';
import { PrefabItem } from '@/models/scene/Prefabs';
import TerrainManager from '@/models/terrain/TerrainManager';
import MiniMap from '@/models/terrain/MiniMap';
import GlobalMap from '@/models/terrain/GlobalMap';
import Environment from './models/scene/Environment';
import Camera from '@/models/playerSelf/Camera'; // Import Camera type

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.gltf';
declare module '*.glb';

declare global {
  // --- Update types to allow undefined ---
  var scene: Scene;
  var assetContainers: Array<Container>; // Keep as array, reset to []
  var prefabs: Array<PrefabItem>; // Assuming this isn't reset to undefined
  var collisions: Collisions;
  var shadowGenerator: ShadowGenerator; // Add | undefined if it can be cleaned up
  var average: number; // Assuming this isn't reset to undefined
  var environment: Environment | undefined;
  var visualizeShadowMap: () => void; // Assuming these functions remain
  var toggleShadowMap: () => void;
  var findLargeShadowCasters: () => void;
  var terrainMaterials: { [key: string]: ShaderMaterial }; // Assuming this isn't reset to undefined
  var camera: Camera | undefined; // Use imported Camera type and allow undefined
  // --- End type updates ---

  interface Window {
    store?: {
      getPlayerId: () => string;
      getSelfPlayerId: () => string;
      getSelfPlayer: () => any;
      setRotate: (id: string, x: number, y: number) => void;
      setForward: (id: string, forward: any) => void;
      setJump: (id: string, jump: boolean) => void;
      setPlayerGlobalPosition: (position: { x: number; z: number }) => void;
      debug?: boolean;
    };
    // --- Update types to allow undefined ---
    terrainManager?: TerrainManager | undefined; // Make optional and allow undefined
    miniMap?: MiniMap | undefined; // Make optional and allow undefined
    globalMap?: GlobalMap | undefined; // Make optional and allow undefined
    // --- End type updates ---
    playerController?: {
      teleportTo: (x: number, z: number) => void;
      enableControls: () => void;
    };
    // --- Update type to allow undefined ---
    game?:
      | {
          teleportToVirtualPosition: (position: Vector3) => Promise<boolean>;
          cleanup?: () => void; // Make cleanup optional
        }
      | undefined; // Allow the whole game object to be undefined
    // --- End type update ---
    CANNON?: any; // Keep if needed
  }

  interface Math {
    clamp(value: number, min: number, max: number): number;
  }
}

// Removed redundant: declare let globalThis: Window;

export {}; // Keep this to ensure it's treated as a module

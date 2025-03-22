/* eslint-disable no-var */
import { Scene, ShadowGenerator, Vector3, ShaderMaterial } from '@babylonjs/core';
import { Container } from '@/models/scene/ContainerManager';
import Collisions from '@/models/mehanics/Collisions';
import { PrefabItem } from '@/models/scene/Prefabs';
import TerrainManager from '@/models/terrain/TerrainManager';
import MiniMap from '@/models/terrain/MiniMap';
import GlobalMap from '@/models/terrain/GlobalMap';
import Environment from './models/scene/Environment';

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.gltf';
declare module '*.glb';

declare global {
  var scene: Scene;
  var assetContainers: Array<Container>;
  var prefabs: Array<PrefabItem>;
  var collisions: Collisions;
  var shadowGenerator: ShadowGenerator;
  var average: number;
  var environment: Environment;
  var visualizeShadowMap: () => void;
  var toggleShadowMap: () => void;
  var findLargeShadowCasters: () => void;
  var terrainMaterials: { [key: string]: ShaderMaterial };
  var camera: import('@/models/playerSelf/Camera').default;

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
    terrainManager?: TerrainManager;
    miniMap?: MiniMap;
    globalMap?: GlobalMap;
    playerController?: {
      teleportTo: (x: number, z: number) => void;
      enableControls: () => void;
    };
    game?: {
      teleportToVirtualPosition: (position: Vector3) => Promise<boolean>;
      cleanup: () => void;
    };
  }

  interface Math {
    clamp(value: number, min: number, max: number): number;
  }
}

declare let globalThis: Window;

export {};

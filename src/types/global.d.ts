declare global {
  interface Window {
    store?: {
      getPlayerId: () => string;
    };
    playerController?: {
      teleportTo: (x: number, z: number) => void;
    };
    terrainManager?: any;
    scene?: any;
    miniMap?: any;
    globalMap?: any;
  }
}

export {};

import Body from '../сommon/Body';
import Character from '@/models/сommon/character/Character';
import Camera from '@/models/playerSelf/Camera';
import { usePlayerStore } from '@/stores/playerStore';
import { useAppStore } from '@/stores/appStore';
import Controller from '@/models/playerSelf/Controller';
import Move from './Move';

class Player {
  init(callbackLoad: any) {
    new Body(usePlayerStore().selfPlayerId!);

    const character = new Character(usePlayerStore().selfPlayerId!);

    character.load(() => {
      const camera = new Camera();
      globalThis.camera = camera;

      const appStore = useAppStore();

      if (!appStore.isMobile) {
        new Controller();
      }

      new Move();
      callbackLoad();
    });
  }
}

export default new Player();

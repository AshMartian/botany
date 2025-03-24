import { Sound } from '@babylonjs/core';
import { useSettingsStore } from '@/stores/settingsStore';
import SoundMain from '@/models/sounds/SoundMain';

export default class Background extends SoundMain {
  filePath: string;
  sound: Sound;

  constructor() {
    super();
    this.filePath = this.path + '/' + 'cosmos.wav';
    const store = useSettingsStore();

    this.sound = new Sound(
      'Cosmos',
      this.filePath,
      globalThis.scene,
      () => {
        // this.subscribe(store, this.sound, 'sound');
      },
      {
        loop: true,
        autoplay: store.getSettingsValueByName('sound'),
      }
    );
  }
}

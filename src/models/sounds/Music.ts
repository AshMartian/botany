import { Sound } from '@babylonjs/core';
import SoundMain from '@/models/sounds/SoundMain';
import { useSettingsStore } from '@/stores/settingsStore';

export default class Music extends SoundMain {
  filePath: string;
  sound: Sound;

  constructor() {
    super();
    const store = useSettingsStore();
    this.filePath = this.path + '/level_1/music.wav';

    this.sound = new Sound(
      'Music',
      this.filePath,
      globalThis.scene,
      () => {
        // this.subscribe(store, this.sound, 'music');
      },
      {
        loop: true,
        autoplay: store.getSettingsValueByName('music'),
        volume: 0.3,
      }
    );
  }
}

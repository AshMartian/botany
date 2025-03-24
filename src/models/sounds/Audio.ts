import { Engine } from '@babylonjs/core';
import Music from '@/models/sounds/Music';
import Background from '@/models/sounds/Background';
import { useAppStore } from '@/stores/appStore';

export default class Audio {
  music: any;
  isLevelRun: boolean;
  pathAudio: string;

  constructor() {
    this.isLevelRun = false;
    this.pathAudio = 'resources/audio';
    const audioEngine = Engine.audioEngine;
    if (audioEngine) {
      audioEngine.useCustomUnlockedButton = true;

      const appStore = useAppStore();

      appStore.$subscribe((mutation) => {
        console.log('mutation', mutation);
        if (mutation.type == 'SET_PLAY' && !this.isLevelRun) {
          const context = audioEngine.audioContext;

          if (context) {
            context.resume();
          }

          this.isLevelRun = true;
          audioEngine.unlock();

          new Music();
          new Background();
        }
      });
    }
  }
}

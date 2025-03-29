import { Engine } from '@babylonjs/core';
import Music from '@/models/sounds/Music';
import Background from '@/models/sounds/Background';
import { useAppStore } from '@/stores/appStore';
import { MutationPayload } from 'pinia'; // Import Pinia type

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

      // Use a more specific type or any if MutationType is incorrect
      appStore.$subscribe((mutation: MutationPayload, state) => {
        // Use Pinia's type
        // console.log('Audio store mutation:', mutation); // Keep for debugging if needed

        // Check if the mutation is directly setting the 'play' state
        // Adjust based on the actual structure logged by the console.log above
        // This assumes the mutation looks like { type: 'direct', storeId: 'app', events: { key: 'play', newValue: true, ... } }
        if (
          mutation.storeId === 'app' && // Ensure it's the app store
          mutation.type === 'direct' && // Check mutation type
          mutation.events && // Ensure events exist
          (Array.isArray(mutation.events) // Handle single or multiple events
            ? mutation.events.some((e) => e.key === 'play')
            : mutation.events.key === 'play') &&
          !this.isLevelRun // Check if level is already running
        ) {
          // Check the new value from the state or event if needed
          const shouldPlay = state.play; // Assuming 'play' is a direct state property
          // Or: const shouldPlay = Array.isArray(mutation.events) ? mutation.events.find(e => e.key === 'play')?.newValue : mutation.events.newValue;

          if (shouldPlay) {
            console.log('Audio: Play state triggered, unlocking audio.');
            const context = audioEngine.audioContext;

            if (context && context.state === 'suspended') {
              context
                .resume()
                .then(() => {
                  console.log('AudioContext resumed successfully.');
                  // Unlock engine only after context is resumed
                  audioEngine.unlock();
                  this.isLevelRun = true;
                  new Music();
                  new Background();
                })
                .catch((error) => {
                  console.error('Failed to resume AudioContext:', error);
                });
            } else if (context && context.state === 'running') {
              // Already running, just unlock and start music
              audioEngine.unlock();
              this.isLevelRun = true;
              new Music();
              new Background();
            } else {
              console.warn('AudioContext not available or in unexpected state:', context?.state);
              // Attempt unlock anyway? Might depend on browser behavior
              audioEngine.unlock();
              this.isLevelRun = true;
              new Music();
              new Background();
            }
          }
        }
      });
    } else {
      console.warn('AudioEngine not available.');
    }
  }
}

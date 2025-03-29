import { Engine } from '@babylonjs/core';
import Music from '@/models/sounds/Music';
import Background from '@/models/sounds/Background';
// Import the state type (adjust name/path if necessary)
import { useAppStore, AppState } from '@/stores/appStore';
import { SubscriptionCallbackMutation } from 'pinia'; // Import Pinia type
import { DebuggerEvent } from 'vue-demi'; // Import DebuggerEvent

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

      // Provide the state type to SubscriptionCallbackMutation
      appStore.$subscribe((mutation: SubscriptionCallbackMutation<AppState>, state: AppState) => {
        // <-- Add <AppState> here and type state
        // console.log('Audio store mutation:', mutation); // Keep for debugging if needed

        // Check if the mutation involves the 'play' key
        const hasPlayEvent =
          mutation.events && // Ensure events exist
          (Array.isArray(mutation.events) // Handle single or multiple events
            ? mutation.events.some((e: DebuggerEvent) => e.key === 'play') // <-- Add type here
            : mutation.events.key === 'play');

        if (
          mutation.storeId === 'app' && // Ensure it's the app store
          mutation.type === 'direct' && // Check mutation type (adjust if needed)
          hasPlayEvent && // Check if 'play' key was involved
          !this.isLevelRun // Check if level is already running
        ) {
          // TODO: Verify if simply detecting the 'play' event (hasPlayEvent) is sufficient
          // or if a specific state property should be checked here instead of the removed 'state.play'.
          console.log('Audio: Play event triggered, unlocking audio.');
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
      });
    } else {
      console.warn('AudioEngine not available.');
    }
  }
}

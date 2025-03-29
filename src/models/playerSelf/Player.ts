import Body from '../сommon/Body';
import Character from '@/models/сommon/character/Character';
import Camera from '@/models/playerSelf/Camera';
import { usePlayerStore } from '@/stores/playerStore';
import { useAppStore } from '@/stores/appStore';
import Controller from '@/models/playerSelf/Controller';
import Move from './Move';

// Interface for components that need cleanup
interface Cleanable {
  cleanup?(): void;
  dispose?(): void; // Allow for dispose as well
}

class Player {
  private bodyInstance: Cleanable | null = null;
  private characterInstance: Cleanable | null = null;
  private cameraInstance: Cleanable | null = null;
  private controllerInstance: Cleanable | null = null;
  private moveInstance: Cleanable | null = null;
  private isInitialized = false; // Flag to prevent multiple inits without cleanup

  init(callbackLoad: any) {
    // Add a log to see if init is called *before* cleanup finishes setting the flag
    console.log(`🚀 Initializing PlayerSelf... (Current isInitialized: ${this.isInitialized})`);
    // If isInitialized is true here, it confirms the race condition.

    const playerId = usePlayerStore().selfPlayerId;
    if (!playerId) {
      console.error('PlayerSelf init failed: No selfPlayerId found in store.');
      return;
    }

    this.bodyInstance = new Body(playerId);
    // Cast Character to Cleanable if necessary, assuming it has a cleanup/dispose method
    this.characterInstance = new Character(playerId) as unknown as Cleanable;

    // Ensure characterInstance has a load method before calling it
    if (this.characterInstance && typeof (this.characterInstance as any).load === 'function') {
      (this.characterInstance as any).load(() => {
        console.log('   - Character loaded, initializing camera, controller, move...');
        this.cameraInstance = new Camera(); // Assuming Camera might have dispose/cleanup
        globalThis.camera = this.cameraInstance as Camera; // Store the specific instance, cast back if needed

        const appStore = useAppStore();
        if (!appStore.isMobile) {
          // Assuming Controller handles its own HMR cleanup via its own hook
          // We still store the instance if needed elsewhere, but don't manage its cleanup here
          this.controllerInstance = new Controller();
        }

        this.moveInstance = new Move(); // Assuming Move might have dispose/cleanup
        this.isInitialized = true; // Mark as initialized
        console.log('   - PlayerSelf components initialized.');
        callbackLoad(); // Call the original callback
      });
    } else {
      console.error('Character instance does not have a load method or is null.');
      // Handle the error appropriately, maybe call the callback with an error or skip further initialization
    }
  }

  public cleanup(): void {
    console.log('🧹 Cleaning up PlayerSelf instance...');
    if (!this.isInitialized) {
      console.log('   - PlayerSelf not initialized, skipping cleanup.');
      return;
    }

    // Call cleanup/dispose on managed instances if they exist and have the method
    const tryCleanup = (instance: Cleanable | null, name: string) => {
      if (instance) {
        if (typeof instance.cleanup === 'function') {
          try {
            instance.cleanup();
            console.log(`   - Cleaned up ${name}`);
          } catch (error) {
            console.error(`   - Error cleaning up ${name}:`, error);
          }
        } else if (typeof instance.dispose === 'function') {
          try {
            instance.dispose();
            console.log(`   - Disposed ${name}`);
          } catch (error) {
            console.error(`   - Error disposing ${name}:`, error);
          }
        } else {
          // console.log(`   - ${name} has no cleanup/dispose method.`);
        }
      }
    };

    tryCleanup(this.moveInstance, 'Move');
    // Note: Controller cleanup is assumed to be handled by its own HMR hook in Controller.ts
    // tryCleanup(this.controllerInstance, 'Controller'); // Do not call cleanup here if Controller handles its own
    tryCleanup(this.cameraInstance, 'Camera');
    tryCleanup(this.characterInstance, 'Character');
    tryCleanup(this.bodyInstance, 'Body');

    // Reset global references ONLY if they point to the instance being cleaned up
    if (globalThis.camera === this.cameraInstance) {
      globalThis.camera = undefined;
      console.log('   - Reset globalThis.camera');
    }

    // Reset instance variables
    this.bodyInstance = null;
    this.characterInstance = null;
    this.cameraInstance = null;
    this.controllerInstance = null; // Still reset the reference even if cleanup is external
    this.moveInstance = null;
    this.isInitialized = false; // Ready for re-initialization

    console.log('🧹 PlayerSelf cleanup complete.');
  }
}

const playerSelfInstance = new Player(); // Create the singleton instance

// Add Vite HMR hook (outside the class)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Dispose triggered for PlayerSelf.ts');
    // Call cleanup on the existing singleton instance
    playerSelfInstance.cleanup();
  });
}

export default playerSelfInstance; // Export the singleton instance

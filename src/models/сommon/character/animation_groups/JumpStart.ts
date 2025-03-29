import { AnimationGroup } from '@babylonjs/core';
import { AnimationGroupInterface } from './AnimationGroupInterface';

export default class JumpStart implements AnimationGroupInterface {
  animation: AnimationGroup | null;
  playerId: string;
  weight: number;
  autoPlayLoop: boolean;
  intervalId: number | null;
  name: string;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.weight = 0;
    this.autoPlayLoop = false; // This animation doesn't loop
    this.intervalId = null;
    this.name = 'JumpStart';

    // Add check for scene and get animation group
    if (globalThis.scene) {
      // Use globalThis.scene consistently
      this.animation = globalThis.scene.getAnimationGroupByName('JumpStart_' + playerId);
      if (this.animation) {
        // Configure the found animation group
        this.animation.name = 'JumpStart_' + this.playerId;
        this.animation.setWeightForAllAnimatables(this.weight);
        this.animation.stop(); // Ensure it's stopped initially
      } else {
        console.warn(`Animation group 'JumpStart_${playerId}' not found.`);
        this.animation = null;
      }
    } else {
      console.error(`Cannot get animation group 'JumpStart_${playerId}': scene is undefined.`);
      this.animation = null;
    }

    // Remove call to setAnimations()
    // this.setAnimations();
  }

  // Remove the setAnimations method
  // setAnimations() { ... }
}

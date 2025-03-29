import { AnimationGroup } from '@babylonjs/core';
import { AnimationGroupInterface } from './AnimationGroupInterface';

export default class JumpMiddle implements AnimationGroupInterface {
  animation: AnimationGroup | null;
  playerId: string;
  weight: number;
  autoPlayLoop: boolean;
  intervalId: number | null;
  name: string;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.weight = 0;
    this.autoPlayLoop = true; // This animation loops while in air
    this.intervalId = null;
    this.name = 'JumpMiddle';

    // Add check for scene and get animation group
    if (globalThis.scene) {
      this.animation = globalThis.scene.getAnimationGroupByName('JumpMiddle_' + playerId);
      if (this.animation) {
        // Configure the found animation group
        this.animation.name = 'JumpMiddle_' + this.playerId;
        this.animation.setWeightForAllAnimatables(this.weight);
        this.animation.play(this.autoPlayLoop);
      } else {
        console.warn(`Animation group 'JumpMiddle_${playerId}' not found.`);
        this.animation = null;
      }
    } else {
      console.error(`Cannot get animation group 'JumpMiddle_${playerId}': scene is undefined.`);
      this.animation = null;
    }

    // Remove call to setAnimations()
    // this.setAnimations();
  }

  // Remove the setAnimations method
  // setAnimations() { ... }
}

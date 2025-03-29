import { AnimationGroup } from '@babylonjs/core';
import { AnimationGroupInterface } from './AnimationGroupInterface';

export default class Sprint implements AnimationGroupInterface {
  animation: AnimationGroup | null;
  playerId: string;
  weight: number;
  autoPlayLoop: boolean;
  intervalId: number | null;
  name: string;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.weight = 0;
    this.autoPlayLoop = true;
    this.intervalId = null;
    this.name = 'Sprint';

    // Add check for scene and get animation group
    if (globalThis.scene) {
      // Use globalThis.scene consistently
      this.animation = globalThis.scene.getAnimationGroupByName('Sprint_' + playerId);
      if (this.animation) {
        // Configure the found animation group
        this.animation.name = 'Sprint_' + this.playerId;
        this.animation.setWeightForAllAnimatables(this.weight);
        this.animation.play(this.autoPlayLoop);
      } else {
        console.warn(`Animation group 'Sprint_${playerId}' not found.`);
        this.animation = null;
      }
    } else {
      console.error(`Cannot get animation group 'Sprint_${playerId}': scene is undefined.`);
      this.animation = null;
    }

    // Remove call to setAnimations()
    // this.setAnimations();
  }

  // Remove the setAnimations method
  // setAnimations() { ... }
}

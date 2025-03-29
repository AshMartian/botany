import { AnimationGroup } from '@babylonjs/core';
import { AnimationGroupInterface } from './AnimationGroupInterface';

export default class Idle implements AnimationGroupInterface {
  playerId: string;
  animation: AnimationGroup | null;
  weight: number;
  autoPlayLoop: boolean;
  intervalId: number | null;
  name: string;

  constructor(playerId: string) {
    this.playerId = playerId;
    this.weight = 0; // Initial weight
    this.autoPlayLoop = true;
    this.intervalId = null;
    this.name = 'Idle';

    // Add check for scene and get animation group
    if (globalThis.scene) {
      this.animation = globalThis.scene.getAnimationGroupByName('Idle_' + playerId);
      if (this.animation) {
        // Configure the found animation group
        this.animation.name = 'Idle_' + this.playerId; // Ensure name is set correctly
        this.animation.setWeightForAllAnimatables(this.weight);
        this.animation.play(this.autoPlayLoop); // Start playing if looping
        // Stop initially if weight is 0? Depends on blending logic.
        // If blending starts from 0, playing immediately is fine.
      } else {
        console.warn(`Animation group 'Idle_${playerId}' not found.`);
        this.animation = null; // Ensure it's null if not found
      }
    } else {
      console.error(`Cannot get animation group 'Idle_${playerId}': scene is undefined.`);
      this.animation = null;
    }

    // Remove call to setAnimations() as it's done above
    // this.setAnimations();
  }

  // Remove the setAnimations method as it's now handled in the constructor
  // setAnimations() { ... }
}

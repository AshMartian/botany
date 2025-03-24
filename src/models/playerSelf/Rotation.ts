import { Mesh, Vector3, Scene as BabylonScene } from '@babylonjs/core';
import { Forward } from '@/stores/playerStore';

export default class Rotation {
  private mesh: Mesh | null = null;
  private scene: BabylonScene;
  private rotationSpeed = 0.1;
  private targetRotation = 0;
  private currentRotation = 0;
  private isRotating = false;

  constructor(scene: BabylonScene) {
    this.scene = scene;
    this.setupRotationAnimation();
  }

  setMesh(mesh: Mesh) {
    this.mesh = mesh;
  }

  private setupRotationAnimation() {
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isRotating || !this.mesh) return;

      // Calculate the difference between current and target rotation
      let diff = this.targetRotation - this.currentRotation;

      // Normalize the difference to be between -PI and PI
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;

      // If we're close enough to the target, stop rotating
      if (Math.abs(diff) < 0.01) {
        this.isRotating = false;
        this.currentRotation = this.targetRotation;
        this.mesh.rotation.y = this.currentRotation;
        return;
      }

      // Move towards the target rotation
      this.currentRotation += diff * this.rotationSpeed;

      // Normalize current rotation
      if (this.currentRotation > Math.PI) this.currentRotation -= 2 * Math.PI;
      if (this.currentRotation < -Math.PI) this.currentRotation += 2 * Math.PI;

      // Apply rotation
      this.mesh.rotation.y = this.currentRotation;
    });
  }

  rotate(forward: Forward, direction: 'left' | 'right') {
    if (!this.mesh) return;

    // Get current forward direction
    const currentForward = new Vector3(
      (forward.right ? 1 : 0) - (forward.left ? 1 : 0),
      0,
      (forward.front ? 1 : 0) - (forward.back ? 1 : 0)
    );

    // Calculate current angle in radians
    const currentAngle = Math.atan2(currentForward.z, currentForward.x);

    // Determine rotation amount based on direction
    const rotationAmount = direction === 'left' ? Math.PI / 2 : -Math.PI / 2;

    // Calculate new target rotation
    this.targetRotation = currentAngle + rotationAmount;

    // Normalize target rotation
    if (this.targetRotation > Math.PI) this.targetRotation -= 2 * Math.PI;
    if (this.targetRotation < -Math.PI) this.targetRotation += 2 * Math.PI;

    // Start rotation animation
    this.isRotating = true;
  }

  // Calculate the angle between the forward vector and a given direction
  private calculateRelativeAngle(forward: Forward, angle: number): number {
    const forwardVector = new Vector3(
      (forward.right ? 1 : 0) - (forward.left ? 1 : 0),
      0,
      (forward.front ? 1 : 0) - (forward.back ? 1 : 0)
    );
    const currentAngle = Math.atan2(forwardVector.z, forwardVector.x);
    return currentAngle + angle;
  }

  // Set the rotation directly to a specific angle relative to the forward direction
  setAngle(forward: Forward, angle: number, step = 1) {
    if (!this.mesh || !this.mesh.rotation) {
      console.warn('Rotation.setAngle called but mesh or rotation is not ready');
      return; // Early return to prevent error
    }

    this.mesh.rotation.y = step * this.calculateRelativeAngle(forward, angle);
  }

  // Get the current rotation angle
  getAngle(): number {
    if (!this.mesh) return 0;
    return this.mesh.rotation.y;
  }
}

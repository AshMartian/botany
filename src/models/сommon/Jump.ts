import { AbstractMesh, Mesh, Nullable, Observer, Scalar, Scene, Vector3 } from '@babylonjs/core';
import { usePlayerStore, Forward, Player } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Helpers } from '@/models/Helpers';
import RayCastHead from '@/models/сommon/rayCast/RayCastHead';

export default class Jump {
  meshFoot: Mesh;
  meshHead: Mesh;
  player: Player;
  observerBefore?: Nullable<Observer<Scene>>;
  lastForward: Forward;
  jumpRunning: boolean;
  inertiaRunning: boolean;
  startHeight: number;
  height: number;
  speedRatio: number;
  nextStep: Vector3;
  rayCast: RayCastHead;
  lastJumpTime: number;
  playerStore = usePlayerStore();
  settingsStore = useSettingsStore();

  constructor(playerId: string) {
    this.meshFoot = globalThis.scene.getMeshById('playerFoot_' + playerId) as Mesh;
    this.meshHead = globalThis.scene.getMeshById('playerHead_' + playerId) as Mesh;
    this.player = this.playerStore.getPlayer(playerId)!;
    this.lastForward = { ...this.player.move.forward };
    this.jumpRunning = false;
    this.inertiaRunning = false;
    this.startHeight = 0;
    this.height = 0;
    this.speedRatio = 0.2;
    this.nextStep = Vector3.Zero();
    this.rayCast = new RayCastHead(this.meshFoot);
    this.lastJumpTime = 0;

    this.subscribe();

    this.observerBefore = globalThis.scene.onAfterRenderObservable.add(() => {
      this.beforeRender();
    });
  }

  subscribe() {
    this.playerStore.subscribe(this.player.id, (type: string, value: boolean) => {
      const currentTime = new Date().getTime();

      if (type === 'jump' && value) {
        if (
          !this.player.move.isFlying &&
          !this.jumpRunning &&
          currentTime - this.lastJumpTime > 400
        ) {
          this.lastJumpTime = currentTime;
          let jumpHeight = this.settingsStore.getSettings.jumpHeight;

          if (this.player.points) {
            jumpHeight = this.settingsStore.getSettings.jumpHeightSprint;
          }

          this.playerStore.setJumpStart(this.player.id);
          this.jumpEnable(jumpHeight);
        }
      }
    });
    this.playerStore.subscribe(this.player.id, (type: string, value: boolean) => {
      if (type === 'isFlying' && value === false) {
        this.inertiaRunning = false;
        this.jumpRunning = false;
        this.playerStore.setJumpRunning(this.player.id, false);
      }
    });
  }

  jumpEnable(height: number, speedRatio = 1) {
    if (this.player.move.isFlying || this.jumpRunning) {
      return;
    }

    this.startHeight = this.meshFoot.position.y;
    this.jumpRunning = true;

    // Add player's movement speed to jump height for momentum preservation
    const speedMove = this.player.move.speed;
    this.height = height + speedMove;

    // Apply custom speed ratio for jump pads or other boosters
    this.speedRatio = speedRatio;

    // Store the movement state at jump initiation for air control
    this.lastForward = { ...this.player.move.forward };
    this.inertiaRunning = true;

    // Update global state
    this.playerStore.setJumpRunning(this.player.id, true);
  }

  private jumpRun() {
    if (this.jumpRunning) {
      const currentHeight = Helpers.numberFixed(this.meshFoot.position.y, 3);
      const finishHeight = Helpers.numberFixed(this.startHeight + this.height, 3);

      if (currentHeight < finishHeight && currentHeight != finishHeight) {
        const speed = this.speedRatio;

        // Calculate the remaining distance to the finish height
        const remainingDistance = finishHeight - currentHeight;

        // Calculate the factor to slow down the speed as the remaining distance decreases
        const slowdownFactor = remainingDistance / this.height;

        // Calculate the adjusted speed by multiplying the speed with the slowdown factor
        let adjustedSpeed = speed * slowdownFactor;

        // Clamp the speed between min and max values for consistent experience
        const adjustedSpeedMin = 0.03;
        const adjustedSpeedMax = 0.4;

        adjustedSpeed = Scalar.Clamp(adjustedSpeed, adjustedSpeedMin, adjustedSpeedMax);

        // Apply the vertical movement with precision
        this.nextStep.y = Helpers.numberFixed(adjustedSpeed * average, 5);
      } else {
        // Jump has reached its peak or exceeded target height
        this.jumpRunning = false;
        this.playerStore.setJumpRunning(this.player.id, false);
      }
    }
  }

  private inertiaRun() {
    // Calculate base inertia speed from jump height
    let speed = this.height / 80;

    // Apply engine delta time for consistent movement
    speed = Helpers.numberFixed(speed * average, 5);

    // Apply directional inertia with custom multipliers for air control
    if (this.lastForward.front) {
      this.nextStep.z = speed * 0.95; // Slightly reduced forward momentum
    }

    if (this.lastForward.back) {
      this.nextStep.z = -speed * 0.8; // More reduced backward momentum
    }

    if (this.lastForward.left) {
      this.nextStep.x = -speed * 0.9; // Balanced lateral movement
    }

    if (this.lastForward.right) {
      this.nextStep.x = speed * 0.9; // Balanced lateral movement
    }
  }

  private setNewPosition() {
    if (this.nextStep.x || this.nextStep.y || this.nextStep.z) {
      const matrix = this.meshFoot.getWorldMatrix();
      const vector = Vector3.TransformNormal(this.nextStep, matrix);
      this.meshFoot.moveWithCollisions(vector);
    }
  }

  private checkHeadRay() {
    // Cast a ray upward to detect ceiling collisions
    const point = this.rayCast.cast((mesh: AbstractMesh) => {
      // Only consider enabled meshes with collision enabled
      return mesh.checkCollisions && mesh.isEnabled();
    });

    if (point) {
      // Ceiling hit detected - abort jump immediately
      this.jumpRunning = false;
      this.playerStore.setJumpRunning(this.player.id, false);

      // Apply a small downward force to prevent sticking
      this.nextStep.y = -0.01;
    }
  }

  private beforeRender() {
    if (this.jumpRunning || this.inertiaRunning) {
      this.nextStep = Vector3.Zero();

      if (this.jumpRunning) {
        this.jumpRun();
      }

      if (this.inertiaRunning && this.player.move.isFlying) {
        this.inertiaRun();
      }

      this.setNewPosition();

      this.checkHeadRay();
    }
  }

  dispose() {
    if (this.observerBefore) {
      globalThis.scene.onBeforeRenderObservable.remove(this.observerBefore);
    }
  }
}

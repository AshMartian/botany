import {
  Vector3,
  UniversalCamera,
  Scene,
  UniversalCamera as BabylonCamera,
  Ray,
  AbstractMesh,
  Axis,
  Scalar, // Added Scalar
  Observer, // Added Observer
} from '@babylonjs/core';
import { usePlayerStore, Player } from '@/stores/playerStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { Helpers } from '@/models/Helpers';

interface CalculateDistance {
  distance: number;
  amount: number;
}

// Camera configuration constants
const MAX_DIST_CAMERA_Z = 3.4;
const MAX_DIST_CAMERA_Y = 0.4;
const SHOULDER_OFFSET_X = -0.5; // Offset to the right for over-the-shoulder view
const SHOULDER_OFFSET_Y = 0.2; // Slight upward offset
const SHOULDER_OFFSET_Z = -0.3; // Slight forward offset to prevent clipping

// Zoom configuration
const MIN_ZOOM = 0.7; // Minimum zoom (closest to player)
const MAX_ZOOM = 2.0; // Maximum zoom (furthest from player)
const ZOOM_SPEED = 0.1; // How fast the zoom changes per scroll

export default class Camera {
  scene: Scene;
  babylonCamera: BabylonCamera;
  meshHead: AbstractMesh | null; // Allow null
  actualDistance: number;
  calculateDistance: CalculateDistance;
  player: Player | null; // Allow null if player might not exist
  public zoomFactor = 1.0;
  private _wheelListener: ((event: WheelEvent) => void) | null = null; // Store listener
  private _beforeRenderObserver: void | null = null; // Store observer

  constructor() {
    this.scene = globalThis.scene;
    this.babylonCamera = new UniversalCamera('playerCamera', Vector3.Zero(), this.scene);

    const store = usePlayerStore();
    this.player = store.selfPlayer ?? null; // Use nullish coalescing

    // Ensure meshHead is found before proceeding
    const mesh = this.scene.getMeshById('playerHead_' + store.selfPlayerId);
    if (!mesh) {
      console.error(`Camera setup failed: Mesh 'playerHead_${store.selfPlayerId}' not found.`);
      // Handle error appropriately - maybe throw or prevent further initialization
      this.meshHead = null; // Assign null
      // Player might also be considered invalid here
      this.player = null;
      // Reset calculateDistance defaults
      this.calculateDistance = {
        amount: 0.02,
        distance: -MAX_DIST_CAMERA_Z * this.zoomFactor,
      };
      this.actualDistance = -MAX_DIST_CAMERA_Z;
      return; // Stop constructor if mesh not found
    }
    this.meshHead = mesh as AbstractMesh;

    this.actualDistance = -MAX_DIST_CAMERA_Z;

    this.calculateDistance = {
      amount: 0,
      distance: 0,
    };

    this.init();
  }

  private init() {
    // Guard against calling init if meshHead wasn't found in constructor
    if (!this.meshHead) {
      console.warn('Camera.init skipped: meshHead not found.');
      return;
    }

    this.babylonCamera.maxZ = 500;
    this.babylonCamera.minZ = 0.02;
    this.babylonCamera.name = 'player';
    this.babylonCamera.fov = 1;
    this.scene.activeCamera = this.babylonCamera;

    this.setupWheelZoom();
    this.attachCamera();
  }

  private setupWheelZoom(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    // Store the listener function
    this._wheelListener = (event: WheelEvent) => {
      const inventoryStore = useInventoryStore();
      // Only handle zoom if inventory is not open
      const inventoryOpen = inventoryStore.isOpen || false;
      if (inventoryOpen) return;

      // Prevent default scroll behavior
      event.preventDefault();

      // Determine zoom direction (-1 for zoom in, 1 for zoom out)
      const delta = Math.sign(event.deltaY);

      // Update zoom factor with limits
      this.zoomFactor = Scalar.Clamp(this.zoomFactor + delta * ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM);
    };

    canvas.addEventListener('wheel', this._wheelListener);
  }

  private attachCamera() {
    // Store the observer
    this._beforeRenderObserver = this.scene.registerBeforeRender(() => {
      // Guard against running if meshHead is not valid or disposed
      if (!this.meshHead || this.meshHead.isDisposed() || !this.meshHead.position) {
        // console.warn("Camera attachCamera skipped: meshHead invalid or disposed.");
        return null;
      }

      this.setDistance();

      // Start with the head position
      const basePosition = this.meshHead.position.clone();

      // Calculate shoulder offset based on current rotation
      const rightDir = this.babylonCamera.getDirection(Axis.X);
      const upDir = this.babylonCamera.getDirection(Axis.Y);
      const forwardDir = this.babylonCamera.getDirection(Axis.Z);

      // Apply shoulder offset
      basePosition.addInPlace(rightDir.scale(SHOULDER_OFFSET_X));
      basePosition.addInPlace(upDir.scale(SHOULDER_OFFSET_Y));
      basePosition.addInPlace(forwardDir.scale(SHOULDER_OFFSET_Z));

      // Set camera position with shoulder offset
      this.babylonCamera.position = basePosition;

      // Smooth camera rotation
      const targetRotationX = this.meshHead.rotation.x;
      const targetRotationY = this.meshHead.rotation.y;

      this.babylonCamera.rotation.x = Scalar.Lerp(
        this.babylonCamera.rotation.x,
        targetRotationX,
        0.2
      );
      this.babylonCamera.rotation.y = Scalar.Lerp(
        this.babylonCamera.rotation.y,
        targetRotationY,
        0.2
      );

      // Apply zoom to the actual distance
      const targetDistance = this.calculateDistance.distance * this.zoomFactor;
      this.actualDistance = Number(
        Scalar.Lerp(this.actualDistance, targetDistance, this.calculateDistance.amount).toFixed(5)
      );

      // Apply camera offset based on actual distance with zoom
      const dirZ = this.babylonCamera.getDirection(Axis.Z);
      this.babylonCamera.position.addInPlace(dirZ.scaleInPlace(this.actualDistance));

      const dirY = this.babylonCamera.getDirection(Axis.Y);
      this.babylonCamera.position.addInPlace(dirY.scaleInPlace(-MAX_DIST_CAMERA_Y));
      return null;
    });
  }

  private setDistance() {
    // Guard against running if meshHead is not valid or disposed
    if (!this.meshHead || this.meshHead.isDisposed() || !this.meshHead.position) {
      this.calculateDistance.distance = -MAX_DIST_CAMERA_Z * this.zoomFactor; // Default distance
      this.calculateDistance.amount = 0.02;
      // console.warn("Camera setDistance skipped: meshHead invalid or disposed.");
      return;
    }

    const headPosition = this.meshHead.position;
    // Base forward vector is scaled by zoom factor
    let forward = new Vector3(0, -MAX_DIST_CAMERA_Y, -MAX_DIST_CAMERA_Z * this.zoomFactor);
    const m = this.meshHead.getWorldMatrix();
    forward = Vector3.TransformCoordinates(forward, m);
    const direction = Vector3.Normalize(forward.subtract(headPosition));
    let distance = -MAX_DIST_CAMERA_Z * this.zoomFactor;
    let amount = 0.02;

    // Added optional chaining for safety
    if (this.player?.move?.forward?.isMoving) {
      distance = -MAX_DIST_CAMERA_Z * this.zoomFactor - 1.2;
    }

    // Add offset to raycast start position to match shoulder view
    const rayStart = headPosition.clone();
    const rightDir = this.babylonCamera.getDirection(Axis.X);
    rayStart.addInPlace(rightDir.scale(SHOULDER_OFFSET_X));

    const ray = new Ray(rayStart, direction, Math.abs(distance));

    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      // Ensure mesh is valid and check collisions
      return mesh && !mesh.isDisposed() && mesh.checkCollisions;
    });

    if (pickResult && pickResult.pickedMesh) {
      // Apply zoom factor to collision distance
      distance = -Helpers.numberFixed(pickResult.distance - 1, 5); // Subtract buffer distance
      // Ensure distance doesn't become positive (camera inside object)
      distance = Math.min(distance, -0.1); // Ensure a minimum distance
      amount = 0.5; // Faster lerp when avoiding collision
    }

    this.calculateDistance.distance = distance;
    this.calculateDistance.amount = amount;
  }

  // --- Add this cleanup method ---
  public cleanup(): void {
    console.log('🧹 Cleaning up Camera instance...');

    // Remove wheel listener
    // Use optional chaining for safety during cleanup phases
    const canvas = this.scene?.getEngine()?.getRenderingCanvas();
    if (canvas && this._wheelListener) {
      canvas.removeEventListener('wheel', this._wheelListener);
      this._wheelListener = null;
      console.log('   - Removed camera wheel listener');
    } else {
      // console.log('   - Camera wheel listener already removed or canvas unavailable.');
    }

    // Remove before render observer
    if (this._beforeRenderObserver && this.scene && !this.scene.isDisposed) {
      // Check scene exists and is not disposed
      this.scene.onBeforeRenderObservable.remove(this._beforeRenderObserver);
      this._beforeRenderObserver = null;
      console.log('   - Removed camera beforeRender observer');
    } else {
      // console.log('   - Camera beforeRender observer already removed or scene disposed.');
    }

    // Dispose the camera itself IF it's appropriate
    // If this is the main scene camera managed by Game.ts, DO NOT dispose it here.
    // If it's a secondary camera specific to PlayerSelf, then dispose it.
    // Assuming it's the main camera (scene.activeCamera), we don't dispose it here.
    // this.babylonCamera?.dispose();

    // Nullify references
    this.meshHead = null;
    this.player = null;
    // this.scene = null; // Avoid nullifying scene if it's managed globally

    console.log('🧹 Camera cleanup complete.');
  }
  // --- End cleanup method ---
}

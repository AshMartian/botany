import {
  Vector3,
  UniversalCamera,
  Scene,
  UniversalCamera as BabylonCamera,
  Ray,
  AbstractMesh,
  Axis,
  Scalar,
} from '@babylonjs/core';
import store from '@/store/store';
import storeVuex from '@/store/vuex';
import { Player } from '@/store/types';
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
  meshHead: AbstractMesh;
  actualDistance: number;
  calculateDistance: CalculateDistance;
  player: Player;
  public zoomFactor = 1.0;

  constructor() {
    this.scene = globalThis.scene;
    this.babylonCamera = new UniversalCamera('playerCamera', Vector3.Zero(), this.scene);
    this.meshHead = this.scene.getMeshById('playerHead_' + store.getSelfPlayerId()) as AbstractMesh;
    this.actualDistance = -MAX_DIST_CAMERA_Z;
    this.player = store.getSelfPlayer();

    this.calculateDistance = {
      amount: 0,
      distance: 0,
    };

    this.init();
  }

  private init() {
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

    canvas.addEventListener('wheel', (event) => {
      // Only handle zoom if inventory is not open
      const inventoryOpen = storeVuex.getters['inventory/isInventoryOpen'] || false;
      if (inventoryOpen) return;

      // Prevent default scroll behavior
      event.preventDefault();

      // Determine zoom direction (-1 for zoom in, 1 for zoom out)
      const delta = Math.sign(event.deltaY);

      // Update zoom factor with limits
      this.zoomFactor = Scalar.Clamp(this.zoomFactor + delta * ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM);
    });
  }

  private attachCamera() {
    this.scene.registerBeforeRender(() => {
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
    });
  }

  private setDistance() {
    const headPosition = this.meshHead.position;
    // Base forward vector is scaled by zoom factor
    let forward = new Vector3(0, -MAX_DIST_CAMERA_Y, -MAX_DIST_CAMERA_Z * this.zoomFactor);
    const m = this.meshHead.getWorldMatrix();
    forward = Vector3.TransformCoordinates(forward, m);
    const direction = Vector3.Normalize(forward.subtract(headPosition));
    let distance = -MAX_DIST_CAMERA_Z * this.zoomFactor;
    let amount = 0.02;

    if (this.player.move.forward.isMoving) {
      distance = -MAX_DIST_CAMERA_Z * this.zoomFactor - 1.2;
    }

    // Add offset to raycast start position to match shoulder view
    const rayStart = headPosition.clone();
    const rightDir = this.babylonCamera.getDirection(Axis.X);
    rayStart.addInPlace(rightDir.scale(SHOULDER_OFFSET_X));

    const ray = new Ray(rayStart, direction, Math.abs(distance));

    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.checkCollisions;
    });

    if (pickResult && pickResult.pickedMesh) {
      // Apply zoom factor to collision distance
      distance = -Helpers.numberFixed(pickResult.distance - 1, 5);
      amount = 0.5;
    }

    this.calculateDistance.distance = distance;
    this.calculateDistance.amount = amount;
  }
}

import { usePlayerStore, Forward } from '@/stores/playerStore';
import { JoystickManagerOptions } from 'nipplejs';
import { isEqual } from 'lodash';

export default class ControllerJoystick {
  lastEventMove: string;

  constructor() {
    this.lastEventMove = '';

    this.setRotate();
  }

  setForward(nippleData: any) {
    const distance = nippleData.distance;

    const store = usePlayerStore();

    const oldForward = store.selfPlayer?.move.forward;
    const direction = this.getDirection(nippleData.angle.degree);

    // Preserve the sprint state from keyboard if it exists
    const currentSprint = oldForward?.sprint || false;

    const forward: Forward = {
      right: direction.right,
      front: direction.front,
      left: direction.left,
      back: direction.back,
      // Use joystick distance for sprint on mobile, but don't override keyboard sprint
      sprint: currentSprint || (distance > 40 && !oldForward?.isMoving),
      isMoving: distance > 10,
    };

    if (!isEqual(forward, oldForward) && store.selfPlayerId) {
      store.setForward(store.selfPlayerId, forward);
    }
  }

  moveEnd() {
    const store = usePlayerStore();
    if (!store.selfPlayerId) return;
    // Get current sprint state from keyboard if it exists
    const currentSprint = store.selfPlayer?.move.forward.sprint || false;

    store.setForward(store.selfPlayerId, {
      left: false,
      right: false,
      back: false,
      front: false,
      isMoving: false,
      // Preserve sprint state from keyboard
      sprint: currentSprint,
    });
  }

  getDirection(deg: number) {
    return {
      front: deg >= 22.5 && deg < 157.5,
      back: deg >= 202.5 && deg < 337.5,
      left: deg >= 112.5 && deg < 247.5,
      right: deg >= 292.5 || deg < 67.5,
    };
  }

  getOptionsMove() {
    return {
      zone: document.getElementById('controller_box_move'),
      color: '#fa72d3',
      mode: 'static',
      position: {
        right: '50px',
        top: '50px',
      },
    } as JoystickManagerOptions;
  }

  setJumpButton() {
    const jumpButton = document.getElementById('controller_button_jump') as HTMLElement;

    jumpButton.addEventListener('touchstart', () => {
      jumpButton.classList.add('active');
      const store = usePlayerStore();
      if (!store.selfPlayerId) return;
      store.setJump(store.selfPlayerId, true);
    });

    jumpButton.addEventListener('touchend', () => {
      jumpButton.classList.remove('active');
      const store = usePlayerStore();
      if (!store.selfPlayerId) return;
      store.setJump(store.selfPlayerId, false);
    });
  }

  setRotate() {
    const moveArea = document.getElementById('controller') as HTMLElement;
    let previousTouchX = 0;
    let previousTouchY = 0;

    moveArea.addEventListener('touchstart', (event) => {
      const touches = Array.from(event.touches);

      const touch = touches.find((touchElement) => {
        return touchElement.target == moveArea;
      });

      if (touch == undefined) {
        return;
      }

      previousTouchX = touch.clientX;
      previousTouchY = touch.clientY;
    });

    moveArea.addEventListener('touchmove', (event) => {
      const touches = Array.from(event.touches);

      const touch = touches.find((touchElement) => {
        return touchElement.target == moveArea;
      });

      if (touch == undefined) {
        return;
      }

      const currentTouchX = touch.clientX;
      const currentTouchY = touch.clientY;

      const movementX = currentTouchX - previousTouchX;
      const movementY = currentTouchY - previousTouchY;

      const store = usePlayerStore();
      if (!store.selfPlayerId) return;

      store.setRotate(store.selfPlayerId, movementY / 50, movementX / 80);

      previousTouchX = currentTouchX;
      previousTouchY = currentTouchY;
    });
  }
}

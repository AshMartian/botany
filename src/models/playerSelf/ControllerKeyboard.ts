import store from '@/store/store';
import { Forward, Player } from '@/store/types';
import { isEqual } from 'lodash';

export default class ControllerKeyboard {
  playerId: string;
  player: Player;
  keysPressed: { [key: string]: boolean };

  constructor() {
    this.playerId = store.getSelfPlayerId();
    this.player = store.getSelfPlayer();
    this.keysPressed = {};

    this.addKeyListeners();
  }

  private addKeyListeners() {
    window.addEventListener('keydown', (e) => {
      // Store the key state
      this.keysPressed[e.key.toLowerCase()] = true;

      // Update sprint state when Shift is pressed
      if (e.key === 'Shift') {
        this.updateForwardState();
      }
    });

    window.addEventListener('keyup', (e) => {
      // Update the key state
      this.keysPressed[e.key.toLowerCase()] = false;

      // Update sprint state when Shift is released
      if (e.key === 'Shift') {
        this.updateForwardState();
      }
    });
  }

  private updateForwardState() {
    const oldForward = store.getSelfPlayer().move.forward;

    // Create a new forward state with sprint set based on Shift key
    const forward: Forward = {
      ...oldForward,
      sprint: !!this.keysPressed['shift'],
    };

    // Only update if the state has changed
    if (!isEqual(forward, oldForward)) {
      store.setForward(this.playerId, forward);
    }
  }
}

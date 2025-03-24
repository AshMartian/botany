import MoveCommon from '../сommon/Move';
import { usePlayerStore } from '@/stores/playerStore';

export default class Move extends MoveCommon {
  static instance: Move;
  constructor() {
    super(usePlayerStore().selfPlayerId!);
  }
}

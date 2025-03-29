import { Mesh, Sound } from '@babylonjs/core';
import SoundMain from '@/models/sounds/SoundMain';
import { useSettingsStore } from '@/stores/settingsStore';
export default class Player extends SoundMain {
  soundRun: Sound;
  soundSprint: Sound;
  soundJumpFinish: Sound;
  playerId: string;
  store = useSettingsStore();

  constructor(playerId: string) {
    super();

    this.playerId = playerId;

    this.soundRun = new Sound(
      'PlayerWalk_' + playerId,
      this.path + '/' + 'player_run.wav',
      globalThis.scene,
      null,
      {
        loop: true,
        autoplay: false,
        spatialSound: true,
        maxDistance: 10,
      }
    );

    this.soundSprint = new Sound(
      'PlayerSprint_' + playerId,
      this.path + '/' + 'player_sprint.wav',
      globalThis.scene,
      null,
      {
        loop: true,
        autoplay: false,
        spatialSound: true,
        maxDistance: 10,
      }
    );

    this.soundJumpFinish = new Sound(
      'PlayerJumpFinish_' + playerId,
      this.path + '/' + 'player_jump_finish.wav',
      globalThis.scene,
      null,
      {
        loop: false,
        autoplay: false,
        spatialSound: true,
        maxDistance: 10,
      }
    );

    const meshFoot = globalThis.scene.getMeshById('playerFoot_' + playerId) as Mesh;
    this.soundRun.attachToMesh(meshFoot);
    this.soundSprint.attachToMesh(meshFoot);
    this.soundJumpFinish.attachToMesh(meshFoot);
  }

  playRun() {
    if (this.store.getSettingsValueByName('sound')) {
      if (!this.soundRun.isPlaying) {
        this.soundRun.play();
      }
    }
  }

  stopWalk() {
    if (this.store.getSettingsValueByName('sound')) {
      if (this.soundRun.isPlaying) {
        this.soundRun.stop();
      }
    }
  }

  playSprint() {
    if (this.store.getSettingsValueByName('sound')) {
      if (!this.soundSprint.isPlaying) {
        this.soundSprint.play();
      }
    }
  }

  stopSprint() {
    if (this.store.getSettingsValueByName('sound')) {
      if (this.soundSprint.isPlaying) {
        this.soundSprint.stop();
      }
    }
  }

  playJumpFinish() {
    if (this.store.getSettingsValueByName('sound')) {
      if (!this.soundJumpFinish.isPlaying) {
        this.soundJumpFinish.play();
      }
    }
  }

  stopJumpFinish() {
    if (this.store.getSettingsValueByName('sound')) {
      if (this.soundJumpFinish.isPlaying) {
        this.soundJumpFinish.stop();
      }
    }
  }
}

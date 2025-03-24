// import { Store } from 'pinia';
// import { Sound } from '@babylonjs/core';

export default class SoundMain {
  path: string;

  constructor() {
    this.path = import.meta.env.VUE_APP_RESOURCES_PATH + 'audio';
  }

  // subscribe(store: Store<any>, sound: Sound, type: string) {
  //   store.$subscribe((mutation, state) => {
  //     if (mutation.type == 'SET_SETTING_FIELD_VALUE') {
  //       if (mutation.state.name == type) {
  //         if (store.getSettingsValueByName(type)) {
  //           if (sound && !sound.isPlaying) {
  //             sound.play();
  //           }
  //         } else {
  //           if (sound && sound.isPlaying) {
  //             sound.stop();
  //           }
  //         }
  //       }
  //     }
  //   });
  // }
}

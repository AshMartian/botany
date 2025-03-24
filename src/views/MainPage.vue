<template>
  <div id="main_page" class="main_background">
    <div class="main_background_points">
      <div class="top_bar_container">
        <div class="top_bar">
          <div @click="goToSettingsPage" class="settings">
            <img src="../assets/images/settings-icon.svg" />
          </div>
          <div class="sound">
            <img src="../assets/images/sound-icon.svg" />
          </div>
        </div>
      </div>

      <div class="button-container">
        <div class="play">
          <div @click="play" class="button">
            <span class="label">{{ $t('message.play') }}</span>
            <span class="icon">
              <span></span>
            </span>
            <span class="label_font">{{ $t('message.play') }}</span>
          </div>
        </div>
        <div class="play">
          <div @click="goToPlayWithFriendsPage" class="button">
            <span class="label">{{ $t('message.play_with_friends') }}</span>
            <span class="icon">
              <span></span>
            </span>
            <span class="label_font">{{ $t('message.play_with_friends') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import '../styles/main_page.sass';
import { useAppStore } from '@/stores/appStore';

export default defineComponent({
  setup() {
    // Use Pinia app store instead of Vuex
    const appStore = useAppStore();

    const goToSettingsPage = () => {
      appStore.goToSettingsPage();
    };

    const goToPlayWithFriendsPage = () => {
      appStore.goToPlayWithFriendsPage();
    };

    const play = () => {
      // Use Pinia actions instead of Vuex mutations
      appStore.goToLevelPage('1');
    };

    return {
      goToSettingsPage,
      goToPlayWithFriendsPage,
      play,
    };
  },
});
</script>

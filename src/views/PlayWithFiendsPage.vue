<template>
  <div id="play_with_friends_page">
    <div>
      <div class="tabs_container">
        <ul class="tabs">
          <li :class="{ active: isCreate }" @click="toggleIsCreate">
            {{ $t('message.create_a_game') }}
          </li>
          <li :class="{ active: isJoin }" @click="toggleIsJoin">
            {{ $t('message.join_a_game') }}
          </li>
        </ul>
      </div>
      <div class="box_forms">
        <div v-if="isCreate" class="box_form">
          <div class="input_label">{{ $t('message.password') }}</div>
          <div class="input_box">
            <div class="input_value">{{ password }}</div>
            <div @click="copyPassword" class="input_action copy">
              {{ $t('message.copy') }}
            </div>
          </div>
        </div>
        <div v-if="isJoin" class="box_form">
          <div class="input_label">{{ $t('message.password') }}</div>
          <div class="input_box">
            <input
              type="text"
              v-model="passwordFriend"
              :placeholder="$t('message.enter_password')"
            />
          </div>
        </div>
      </div>
      <div class="line_form">
        <div @click="goToMainPage" class="button secondary">
          {{ $t('message.back') }}
        </div>
        <div @click="play" class="button primary">{{ $t('message.play') }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import copy from 'copy-to-clipboard';
import '../styles/play_with_friends_page.sass';
import { useAppStore } from '@/stores/appStore';

export default defineComponent({
  setup() {
    // Use Pinia app store instead of Vuex
    const appStore = useAppStore();

    // Component state
    const isCreate = ref(true);
    const isJoin = ref(false);
    const password = ref(generatePassword()); // Generate random password on load
    const passwordFriend = ref('');

    // Generate a random password
    function generatePassword(): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    // Toggle between create and join modes
    const toggleIsCreate = () => {
      isCreate.value = true;
      isJoin.value = false;
    };

    const toggleIsJoin = () => {
      isCreate.value = false;
      isJoin.value = true;
    };

    // Copy password to clipboard
    const copyPassword = () => {
      copy(password.value);
    };

    // Navigate back to main page
    const goToMainPage = () => {
      appStore.goToMainPage();
    };

    // Start playing with friends
    const play = () => {
      // Use a different level ID for multiplayer to distinguish it from single player
      const levelId = isCreate.value
        ? `multiplayer-host-${password.value}`
        : `multiplayer-client-${passwordFriend.value}`;

      appStore.goToLevelPage(levelId);
    };

    return {
      isCreate,
      isJoin,
      password,
      passwordFriend,
      toggleIsCreate,
      toggleIsJoin,
      copyPassword,
      goToMainPage,
      play,
    };
  },
});
</script>

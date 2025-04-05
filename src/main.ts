import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createI18n } from 'vue-i18n';
import './styles/app.sass';

const messages = {
  en: {
    message: {
      play: 'play',
      settings: 'settings',
      back: 'back',
      play_with_friends: 'play with friends',
      loading: 'loading',
      are_you_ready: 'are you ready?',
      points: 'points',
      back_to_savepoint: 'back to savepoint',
    },
    // Add build menu translations here for consistency
    buildMenu: {
      title: 'Build Menu',
      noBlueprints: 'No blueprints available.',
      close: 'Close',
      noCost: 'Free',
    },
  },
  ru: {
    message: {
      play: 'играть',
      settings: 'настройки',
      back: 'назад',
      play_with_friends: 'играть с друзьями',
      loading: 'загрузка',
      are_you_ready: 'вы готовы?',
      back_to_savepoint: 'вернуться к точки сохранения',
    },
    // Add Russian build menu translations
    buildMenu: {
      title: 'Меню строительства',
      noBlueprints: 'Нет доступных чертежей.',
      close: 'Закрыть',
      noCost: 'Бесплатно',
    },
  },
};

const i18n = createI18n({
  legacy: false, // <-- Add this line
  locale: 'en', // set locale
  fallbackLocale: 'en', // set fallback locale
  messages, // set locale messages
});
const pinia = createPinia();

createApp(App).use(i18n).use(pinia).mount('#app');

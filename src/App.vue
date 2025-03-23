<template>
  <component :is="currentPage"></component>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PlayWithFiendsPage from '@/views/PlayWithFiendsPage.vue';
import LevelPage from '@/views/LevelPage.vue';
import MainPage from '@/views/MainPage.vue';

export default defineComponent({
  computed: {
    currentPage() {
      return this.$store.state.currentPage;
    },
  },
  components: {
    MainPage,
    LevelPage,
    PlayWithFiendsPage,
  },
});
</script>

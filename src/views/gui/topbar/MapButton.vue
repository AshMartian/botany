<template>
  <div id="map_button">
    <button @click="open">map</button>
  </div>
</template>

<style>
#map_button {
  height: 100%;
  flex: 1;
  text-align: left;
}
</style>

<script>
import { useAppStore } from '@/stores/appStore';

export default {
  methods: {
    open() {
      const appStore = useAppStore();
      appStore.setMapOpen(!appStore.mapOpen);
    },
  },
};
</script>

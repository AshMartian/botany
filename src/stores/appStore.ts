// src/stores/appStore.ts
import { defineStore } from 'pinia';

export type PageType = 'MainPage' | 'LevelPage' | 'PlayWithFiendsPage' | 'SettingsPage';

interface AppState {
  currentPage: PageType;
  pendingLevelId: string | null;
  isFirstLoad: boolean;
  isMobile: boolean;
  menuOpen: boolean;
  mapOpen: boolean;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    currentPage: 'MainPage',
    pendingLevelId: null,
    isFirstLoad: true,
    isMobile: (() => {
      const userAgent = navigator.userAgent || navigator.vendor;
      return /android|iphone|ipad|ipod|iemobile|blackberry|mini|windows ce|palm/i.test(userAgent);
    })(),
    menuOpen: false,
    mapOpen: false,
  }),

  actions: {
    setPage(page: PageType) {
      this.currentPage = page;
    },

    setLevelId(levelId: string) {
      this.pendingLevelId = levelId;
    },

    goToMainPage() {
      this.currentPage = 'MainPage';
    },

    goToLevelPage(levelId: string) {
      this.pendingLevelId = levelId;
      this.currentPage = 'LevelPage';
    },

    goToPlayWithFriendsPage() {
      this.currentPage = 'PlayWithFiendsPage';
    },

    goToSettingsPage() {
      this.currentPage = 'SettingsPage';
    },

    setFirstLoadComplete() {
      this.isFirstLoad = false;
    },
    setMenuOpen(isOpen: boolean) {
      this.menuOpen = isOpen;
    },
    toggleMenu() {
      this.menuOpen = !this.menuOpen;
    },
    setMapOpen(isOpen: boolean) {
      this.mapOpen = isOpen;
    },
  },
});

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VUE_APP_SERVER_DOMAIN: string;
  readonly VUE_APP_RESOURCES_PATH: string;
  readonly VUE_APP_SERVER_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

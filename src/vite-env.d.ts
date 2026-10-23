/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

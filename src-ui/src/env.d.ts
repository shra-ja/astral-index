/// <reference types="vite/client" />

// The build-time feature toggles (decision 0026), checked by the Vite configuration.
interface ImportMetaEnv {
  readonly VITE_FEATURE_GENSHIN_IMPACT: 'true' | 'false'
}

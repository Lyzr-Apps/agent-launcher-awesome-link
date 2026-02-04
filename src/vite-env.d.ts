/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_ID?: string
  readonly VITE_LYZR_API_KEY?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

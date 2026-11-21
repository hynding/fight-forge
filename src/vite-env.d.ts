/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Fight Forge API (server/), e.g. https://api.example.com. Without it the game has no online features. */
  readonly VITE_API_URL?: string
}

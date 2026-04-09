/// <reference types="vite/client" />
/// <reference types="@atcute/atproto" />

interface ImportMetaEnv {
  readonly VITE_OAUTH_CLIENT_ID: string;
  readonly VITE_OAUTH_REDIRECT_URI: string;
  readonly VITE_OAUTH_SCOPE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

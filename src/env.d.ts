/// <reference types="astro/client" />

interface ImportMetaEnv {
	// GitHub API の未認証レート制限を避けるための任意のトークン。
	// .env に GITHUB_TOKEN=xxxx として設定する(公開してはいけないため PUBLIC_ prefix は付けない)。
	readonly GITHUB_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

/// <reference types="astro/client" />

interface ImportMetaEnv {
	// GitHub API の未認証レート制限を避けるための任意のトークン。
	// .env に GITHUB_TOKEN=xxxx として設定する(公開してはいけないため PUBLIC_ prefix は付けない)。
	readonly GITHUB_TOKEN?: string;
	// server/ (自前のGitHub活動集計API) のURL。未設定なら外部APIにフォールバックする。
	readonly GITHUB_ACTIVITY_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

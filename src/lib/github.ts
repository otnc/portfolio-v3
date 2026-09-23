import { api } from './api';

// GitHub関連のデータ取得は全て server/ (Hono API) を経由する。
// Astro/ブラウザ側から外部サイトを直接叩かないことで、任意の外部ホストへのリクエストや取得結果の扱いを1箇所(サーバー側)に集約する。

export interface LanguageStat {
	name: string;
	percentage: number;
	color: string;
}

export interface Repo {
	name: string;
	owner: string;
	url: string;
	description: string;
	stars: number;
	// リポジトリ全体(自分以外の分も含む)の合計マージ数・合計Issue数。
	mergedCount: number | null;
	issueCount: number | null;
	pinned?: boolean;
	languages?: LanguageStat[];
	topLanguage?: { name: string; color: string };
}

export interface Contribution {
	repo: string;
	owner: string;
	name: string;
	url: string;
	mergedCount: number;
	issueCount: number;
	stars: number | null;
	languages?: LanguageStat[];
}

export function fetchWorks(user: string): Promise<Repo[]> {
	return api<Repo[]>(`/works/${user}`);
}

export function fetchMergedContributions(user: string): Promise<Contribution[]> {
	return api<Contribution[]>(`/contributions/${user}`);
}

import { ofetch } from 'ofetch';

// GitHub関連のデータ取得は全て server/ (Hono API) を経由する。
// Astro/ブラウザ側から外部サイトを直接叩かないことで、任意の外部ホストへのリクエストや取得結果の扱いを1箇所(サーバー側)に集約する。
const BASE_URL = 'http://127.0.0.1:3010/api';

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
	stars: number | null;
}

export async function fetchWorks(user: string): Promise<Repo[]> {
	try {
		return await ofetch<Repo[]>(`${BASE_URL}/works/${user}`);
	} catch {
		return [];
	}
}

export async function fetchMergedContributions(user: string): Promise<Contribution[]> {
	try {
		return await ofetch<Contribution[]>(`${BASE_URL}/contributions/${user}`);
	} catch {
		return [];
	}
}

import { getLanguageColor } from './languageColors';

const SEARCH_REPOS_URL = 'https://api.github.com/search/repositories';
const SEARCH_ISSUES_URL = 'https://api.github.com/search/issues';
const PINNED_API_URL = 'https://pinned.berrysauce.dev/get';
const UNGH_API_URL = 'https://ungh.cc';

// .env に GITHUB_TOKEN を置いておくと、開発時など未認証レート制限に
// 引っかかりやすい場面で認証済みリクエストとして送られる(必須ではない)。
function githubHeaders(): HeadersInit {
	const token = import.meta.env.GITHUB_TOKEN;
	const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	return headers;
}

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
	// 内訳を取得できた場合のみ入る。取れなければ undefined。
	languages?: LanguageStat[];
	// 内訳が取れなくても、検索結果に含まれる最多言語だけは分かる。
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

interface SearchRepoItem {
	name?: unknown;
	owner?: { login?: unknown };
	html_url?: unknown;
	description?: unknown;
	stargazers_count?: unknown;
	language?: unknown;
}

interface PinnedItem {
	author?: unknown;
	name?: unknown;
	description?: unknown;
	stars?: unknown;
	language?: unknown;
	languageColor?: unknown;
}

async function fetchAllRepos(user: string): Promise<Repo[]> {
	try {
		const url = `${SEARCH_REPOS_URL}?q=user:${user}&sort=stars&order=desc&per_page=100`;
		const response = await fetch(url, { headers: githubHeaders() });
		if (!response.ok) return [];

		const data = await response.json();
		const items: SearchRepoItem[] = Array.isArray(data?.items) ? data.items : [];

		return items.map((item) => {
			const language = typeof item.language === 'string' ? item.language : undefined;
			return {
				name: String(item.name ?? ''),
				owner: String(item.owner?.login ?? user),
				url: String(item.html_url ?? ''),
				description: String(item.description ?? ''),
				stars: Number(item.stargazers_count ?? 0),
				topLanguage: language ? { name: language, color: getLanguageColor(language) } : undefined,
			};
		});
	} catch {
		return [];
	}
}

// GitHub には固定(ピン留め)リポジトリを取得する公式APIがないため、
// 非公式API (pinned.berrysauce.dev) から owner/repo 単位で取得する。
// 自分がオーナーでないリポジトリ(fork/所属先など)が固定されている場合もあるため、
// author を保持して正しいリポジトリを指す。
async function fetchPinnedRepos(user: string): Promise<Repo[]> {
	try {
		const response = await fetch(`${PINNED_API_URL}/${user}`);
		if (!response.ok) return [];

		const data = await response.json();
		const items: PinnedItem[] = Array.isArray(data) ? data : [];

		return items.map((item) => {
			const owner = String(item.author ?? user);
			const name = String(item.name ?? '');
			const language = typeof item.language === 'string' ? item.language : undefined;
			const languageColor =
				typeof item.languageColor === 'string' ? item.languageColor : undefined;

			return {
				name,
				owner,
				url: `https://github.com/${owner}/${name}`,
				description: String(item.description ?? ''),
				stars: Number(item.stars ?? 0),
				pinned: true,
				topLanguage: language
					? { name: language, color: languageColor ?? getLanguageColor(language) }
					: undefined,
			};
		});
	} catch {
		return [];
	}
}

// 可能な場合は言語ごとのバイト数から使用割合を計算する。
// レート制限等で取れない場合は null を返し、呼び出し側は
// 検索結果に含まれる最多言語(topLanguage)だけの表示にフォールバックする。
async function fetchLanguageBreakdown(owner: string, name: string): Promise<LanguageStat[] | null> {
	try {
		// 言語ごとのバイト内訳は ungh.cc に無いため、ここだけは GitHub 本家を叩く。
		const response = await fetch(`https://api.github.com/repos/${owner}/${name}/languages`, {
			headers: githubHeaders(),
		});
		if (!response.ok) return null;

		const data: Record<string, number> = await response.json();
		const total = Object.values(data).reduce((sum, bytes) => sum + bytes, 0);
		if (total <= 0) return null;

		return Object.entries(data)
			.map(([langName, bytes]) => ({
				name: langName,
				percentage: (bytes / total) * 100,
				color: getLanguageColor(langName),
			}))
			.sort((a, b) => b.percentage - a.percentage);
	} catch {
		return null;
	}
}

async function withLanguageBreakdown(repos: Repo[]): Promise<Repo[]> {
	return Promise.all(
		repos.map(async (repo) => {
			const languages = await fetchLanguageBreakdown(repo.owner, repo.name);
			return languages ? { ...repo, languages } : repo;
		}),
	);
}

export async function fetchWorks(user: string, otherLimit = 9): Promise<Repo[]> {
	const [allRepos, pinnedRepos] = await Promise.all([fetchAllRepos(user), fetchPinnedRepos(user)]);

	const pinnedUrlSet = new Set(pinnedRepos.map((repo) => repo.url));
	const otherRepos = allRepos.filter((repo) => !pinnedUrlSet.has(repo.url)).slice(0, otherLimit);

	return withLanguageBreakdown([...pinnedRepos, ...otherRepos]);
}

interface SearchIssueItem {
	repository_url?: unknown;
}

// GitHub 本家はレート制限が厳しいので、単純なスター数取得は
// キャッシュ済みの ungh.cc 経由にして制限を回避する。
// それでも取得できないことはあるため、失敗時は 0 と偽らず null を返す
// (呼び出し側で「不明」として扱い、表示や並び順から除外する)。
async function fetchRepoStars(owner: string, name: string): Promise<number | null> {
	try {
		const response = await fetch(`${UNGH_API_URL}/repos/${owner}/${name}`);
		if (!response.ok) return null;

		const data = await response.json();
		const stars = data?.repo?.stars;
		return typeof stars === 'number' ? stars : null;
	} catch {
		return null;
	}
}

// フォークして送った Pull Request が、外部(自分以外が所有する)リポジトリで
// マージされたものを集計する。GitHub に専用APIは無いため、
// Issues/PR検索の `is:merged` + 自分のリポジトリを除外する条件で代用する。
// 規模(スター数)が大きいプロジェクト順に並べたいので、集計後に
// それぞれのリポジトリのスター数を取得してソートし直す。
export async function fetchMergedContributions(user: string): Promise<Contribution[]> {
	try {
		const query = `type:pr+author:${user}+is:merged+-user:${user}`;
		const url = `${SEARCH_ISSUES_URL}?q=${query}&per_page=100`;
		const response = await fetch(url, { headers: githubHeaders() });
		if (!response.ok) return [];

		const data = await response.json();
		const items: SearchIssueItem[] = Array.isArray(data?.items) ? data.items : [];

		const counts = new Map<string, number>();
		for (const item of items) {
			const match = String(item.repository_url ?? '').match(/repos\/([^/]+)\/([^/]+)$/);
			if (!match) continue;
			const repo = `${match[1]}/${match[2]}`;
			counts.set(repo, (counts.get(repo) ?? 0) + 1);
		}

		const contributions = await Promise.all(
			[...counts.entries()].map(async ([repo, mergedCount]) => {
				const [owner, name] = repo.split('/');
				const stars = await fetchRepoStars(owner, name);
				return { repo, owner, name, url: `https://github.com/${repo}`, mergedCount, stars };
			}),
		);

		// スター数が不明なもの(取得失敗)は末尾に回し、既知の値同士はスター数、
		// 同数ならマージ数で比較する。
		return contributions.sort((a, b) => {
			if (a.stars === null && b.stars === null) return b.mergedCount - a.mergedCount;
			if (a.stars === null) return 1;
			if (b.stars === null) return -1;
			return b.stars - a.stars || b.mergedCount - a.mergedCount;
		});
	} catch {
		return [];
	}
}

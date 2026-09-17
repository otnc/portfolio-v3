import * as cheerio from 'cheerio';
import { ofetch } from 'ofetch';
import { env } from './env.js';
import { getLanguageColor } from './languageColors.js';
import { cached } from './simpleCache.js';
import { getBrowserUserAgent } from './userAgent.js';

const SEARCH_REPOS_URL = 'https://api.github.com/search/repositories';
const SEARCH_ISSUES_URL = 'https://api.github.com/search/issues';
const PINNED_API_URL = 'https://pinned.berrysauce.dev/get';
const UNGH_API_URL = 'https://ungh.cc';

const WORKS_TTL_MS = 12 * 60 * 60 * 1000;

function githubHeaders(): Record<string, string> {
	return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.githubToken}` };
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

interface SearchRepoItem {
	name?: unknown;
	owner?: { login?: unknown };
	html_url?: unknown;
	description?: unknown;
	stargazers_count?: unknown;
	language?: unknown;
}

async function fetchAllRepos(user: string): Promise<Repo[]> {
	try {
		const data = await ofetch<{ items?: SearchRepoItem[] }>(SEARCH_REPOS_URL, {
			query: { q: `user:${user}`, sort: 'stars', order: 'desc', per_page: 100 },
			headers: githubHeaders(),
		});
		const items = Array.isArray(data.items) ? data.items : [];

		return Promise.all(
			items.map(async (item) => {
				const language = typeof item.language === 'string' ? item.language : undefined;
				return {
					name: String(item.name ?? ''),
					owner: String(item.owner?.login ?? user),
					url: String(item.html_url ?? ''),
					description: String(item.description ?? ''),
					stars: Number(item.stargazers_count ?? 0),
					topLanguage: language ? { name: language, color: await getLanguageColor(language) } : undefined,
				};
			}),
		);
	} catch {
		return [];
	}
}

interface PinnedItem {
	author?: unknown;
	name?: unknown;
	description?: unknown;
	stars?: unknown;
	language?: unknown;
	languageColor?: unknown;
}

function parseCompactNumber(text: string): number | null {
	const match = text.trim().match(/^([\d.]+)(k|m)?$/i);
	if (!match) return null;
	const value = Number(match[1]);
	if (Number.isNaN(value)) return null;
	const unit = match[2]?.toLowerCase();
	if (unit === 'k') return Math.round(value * 1_000);
	if (unit === 'm') return Math.round(value * 1_000_000);
	return Math.round(value);
}

// GitHub には固定(ピン留め)リポジトリを取得する公式APIが無いため、プロフィールページのHTMLを解析して取得する。
// それも失敗した場合のみ、非公式API (pinned.berrysauce.dev) にフォールバックする。
async function scrapePinnedRepos(user: string): Promise<Repo[]> {
	const html = await ofetch(`https://github.com/${user}`, {
		responseType: 'text',
		headers: { 'User-Agent': getBrowserUserAgent() },
	});
	const $ = cheerio.load(html);

	const repos = $('.js-pinned-item-list-item')
		.map((_, el) => {
			const $item = $(el);
			const link = $item.find('a[data-hydro-click]').first();
			const href = link.attr('href') ?? '';
			const [owner, name] = href.replace(/^\//, '').split('/');
			if (!owner || !name) return null;

			const languageName = $item.find('[itemprop="programmingLanguage"]').first().text().trim();
			const languageColor = $item
				.find('.repo-language-color')
				.first()
				.attr('style')
				?.match(/background-color:\s*(#[0-9a-fA-F]{3,6})/)?.[1];
			const starsText = $item
				.find('a[href$="/stargazers"]')
				.first()
				.text()
				.replace(/[^\d.km]/gi, '');
			const stars = parseCompactNumber(starsText);

			const repo: Repo = {
				name,
				owner,
				url: `https://github.com/${owner}/${name}`,
				description: $item.find('.pinned-item-desc').first().text().trim(),
				stars: stars ?? 0,
				pinned: true,
				topLanguage: languageName ? { name: languageName, color: languageColor ?? '' } : undefined,
			};
			return repo;
		})
		.get()
		.filter((repo): repo is Repo => repo !== null);

	// 言語色がHTML中に見つからなかった分だけ、Linguistの色一覧で補う。
	return Promise.all(
		repos.map(async (repo) => {
			if (repo.topLanguage && !repo.topLanguage.color) {
				repo.topLanguage.color = await getLanguageColor(repo.topLanguage.name);
			}
			return repo;
		}),
	);
}

async function fetchPinnedFromApi(user: string): Promise<Repo[]> {
	const items = await ofetch<PinnedItem[]>(`${PINNED_API_URL}/${user}`);
	if (!Array.isArray(items)) return [];

	return Promise.all(
		items.map(async (item) => {
			const owner = String(item.author ?? user);
			const name = String(item.name ?? '');
			const language = typeof item.language === 'string' ? item.language : undefined;
			const languageColor = typeof item.languageColor === 'string' ? item.languageColor : undefined;

			return {
				name,
				owner,
				url: `https://github.com/${owner}/${name}`,
				description: String(item.description ?? ''),
				stars: Number(item.stars ?? 0),
				pinned: true,
				topLanguage: language
					? { name: language, color: languageColor ?? (await getLanguageColor(language)) }
					: undefined,
			};
		}),
	);
}

async function fetchPinnedRepos(user: string): Promise<Repo[]> {
	try {
		const scraped = await scrapePinnedRepos(user);
		if (scraped.length > 0) return scraped;
	} catch {
		// HTML構造の変化などで解析に失敗した場合は下のフォールバックに委ねる。
	}

	try {
		return await fetchPinnedFromApi(user);
	} catch {
		return [];
	}
}

// 可能な場合は言語ごとのバイト数から使用割合を計算する。
// レート制限等で取れない場合は null を返し、呼び出し側は検索結果に含まれる最多言語(topLanguage)だけの表示にフォールバックする。
async function fetchLanguageBreakdown(owner: string, name: string): Promise<LanguageStat[] | null> {
	try {
		const data = await ofetch<Record<string, number>>(
			`https://api.github.com/repos/${owner}/${name}/languages`,
			{ headers: githubHeaders() },
		);
		const total = Object.values(data).reduce((sum, bytes) => sum + bytes, 0);
		if (total <= 0) return null;

		const stats = await Promise.all(
			Object.entries(data).map(async ([langName, bytes]) => ({
				name: langName,
				percentage: (bytes / total) * 100,
				color: await getLanguageColor(langName),
			})),
		);
		return stats.sort((a, b) => b.percentage - a.percentage);
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

export async function getWorks(user: string, otherLimit = 9): Promise<Repo[]> {
	return cached('works', user, WORKS_TTL_MS, async () => {
		const [allRepos, pinnedRepos] = await Promise.all([fetchAllRepos(user), fetchPinnedRepos(user)]);

		const pinnedUrlSet = new Set(pinnedRepos.map((repo) => repo.url));
		const otherRepos = allRepos.filter((repo) => !pinnedUrlSet.has(repo.url)).slice(0, otherLimit);

		return withLanguageBreakdown([...pinnedRepos, ...otherRepos]);
	});
}

interface SearchIssueItem {
	repository_url?: unknown;
}

// スター数は公式APIを優先し、レート制限などで取れなかった場合のみ ungh.cc にフォールバックする。
// それでも取得できないことはあるため、失敗時は 0 と偽らず null を返す(呼び出し側で「不明」として扱い、表示や並び順から除外する)。
async function fetchRepoStars(owner: string, name: string): Promise<number | null> {
	try {
		const data = await ofetch<{ stargazers_count?: unknown }>(
			`https://api.github.com/repos/${owner}/${name}`,
			{ headers: githubHeaders() },
		);
		if (typeof data.stargazers_count === 'number') return data.stargazers_count;
	} catch {
		// 公式APIがレート制限等で失敗した場合はフォールバックへ。
	}

	try {
		const data = await ofetch<{ repo?: { stars?: unknown } }>(`${UNGH_API_URL}/repos/${owner}/${name}`);
		return typeof data.repo?.stars === 'number' ? data.repo.stars : null;
	} catch {
		return null;
	}
}

// フォークして送った Pull Request が、外部(自分以外が所有する)リポジトリでマージされたものを集計する。GitHub に専用APIは無いため、Issues/PR検索の `is:merged` + 自分のリポジトリを除外する条件で代用する。
// 規模(スター数)が大きいプロジェクト順に並べたいので、集計後にそれぞれのリポジトリのスター数を取得してソートし直す。
export async function getMergedContributions(user: string): Promise<Contribution[]> {
	return cached('contributions', user, WORKS_TTL_MS, async () => {
		try {
			// ofetchの query オプションは値をそのままURLエンコードするため、+ 区切りだと
			// リテラルの "+" として送られてしまう(スペースとして解釈されない)。単語区切りは半角スペースにする。
			const query = `type:pr author:${user} is:merged -user:${user}`;
			const data = await ofetch<{ items?: SearchIssueItem[] }>(SEARCH_ISSUES_URL, {
				query: { q: query, per_page: 100 },
				headers: githubHeaders(),
			});
			const items = Array.isArray(data.items) ? data.items : [];

			const grouped = new Map<string, number>();
			for (const item of items) {
				const match = String(item.repository_url ?? '').match(/repos\/([^/]+)\/([^/]+)$/);
				if (!match) continue;
				const repo = `${match[1]}/${match[2]}`;
				grouped.set(repo, (grouped.get(repo) ?? 0) + 1);
			}

			const contributions = await Promise.all(
				[...grouped.entries()].map(async ([repo, mergedCount]) => {
					const [owner, name] = repo.split('/');
					const stars = await fetchRepoStars(owner, name);
					return { repo, owner, name, url: `https://github.com/${repo}`, mergedCount, stars };
				}),
			);

			// スター数が不明なもの(取得失敗)は末尾に回し、既知の値同士はスター数、同数ならマージ数で比較する。
			return contributions.sort((a, b) => {
				if (a.stars === null && b.stars === null) return b.mergedCount - a.mergedCount;
				if (a.stars === null) return 1;
				if (b.stars === null) return -1;
				return b.stars - a.stars || b.mergedCount - a.mergedCount;
			});
		} catch {
			return [];
		}
	});
}

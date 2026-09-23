import * as cheerio from 'cheerio';
import { ofetch } from 'ofetch';
import { env } from './env.js';
import { fetchRepoActivityCounts } from './githubGraphql.js';
import { getLanguageColor } from './languageColors.js';
import { cached } from './simpleCache.js';
import { getBrowserUserAgent } from './userAgent.js';

const SEARCH_REPOS_URL = 'https://api.github.com/search/repositories';
const SEARCH_ISSUES_URL = 'https://api.github.com/search/issues';
const PINNED_API_URL = 'https://pinned.berrysauce.dev/get';
const UNGH_API_URL = 'https://ungh.cc';

// クライアント側から都度取得されるため短めにする(stale-while-revalidateなので待たされない)。
// GitHub APIのレート制限(認証済み5000/h)に対して1回の再取得は数十リクエスト程度。
const WORKS_TTL_MS = 60 * 60 * 1000;

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

interface SearchRepoItem {
	name?: unknown;
	owner?: { login?: unknown };
	html_url?: unknown;
	description?: unknown;
	stargazers_count?: unknown;
	language?: unknown;
}

async function fetchAllRepos(user: string): Promise<Repo[]> {
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
				mergedCount: null,
				issueCount: null,
				topLanguage: language ? { name: language, color: await getLanguageColor(language) } : undefined,
			};
		}),
	);
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
				mergedCount: null,
				issueCount: null,
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
				mergedCount: null,
				issueCount: null,
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

	// 両方失敗した場合はthrowして、古いキャッシュを空の結果で上書きしないようにする。
	return fetchPinnedFromApi(user);
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

async function withLanguageBreakdown<T extends { owner: string; name: string; languages?: LanguageStat[] }>(
	repos: T[],
): Promise<T[]> {
	return Promise.all(
		repos.map(async (repo) => {
			const languages = await fetchLanguageBreakdown(repo.owner, repo.name);
			return languages ? { ...repo, languages } : repo;
		}),
	);
}

// リポジトリ全体(自分以外の分も含む)の合計マージ数・合計Issue数を付与する。
async function withActivityCounts(repos: Repo[]): Promise<Repo[]> {
	const counts = await fetchRepoActivityCounts(repos.map((repo) => ({ owner: repo.owner, name: repo.name })));
	return repos.map((repo) => {
		const count = counts.get(`${repo.owner}/${repo.name}`);
		return count ? { ...repo, ...count } : repo;
	});
}

export async function getWorks(user: string, otherLimit = 9): Promise<Repo[]> {
	return cached('works', user, WORKS_TTL_MS, async () => {
		const [allRepos, pinnedRepos] = await Promise.all([fetchAllRepos(user), fetchPinnedRepos(user)]);

		const pinnedUrlSet = new Set(pinnedRepos.map((repo) => repo.url));
		const otherRepos = allRepos.filter((repo) => !pinnedUrlSet.has(repo.url)).slice(0, otherLimit);

		const repos = await withLanguageBreakdown([...pinnedRepos, ...otherRepos]);
		return withActivityCounts(repos);
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

// GitHub Search API は1クエリにつき最大1,000件(per_page 100 × 10ページ)までしか返さない。
// この上限まで全ページを取得する。
async function searchIssuesAll(query: string): Promise<SearchIssueItem[]> {
	const items: SearchIssueItem[] = [];
	for (let page = 1; page <= 10; page += 1) {
		// ofetchの query オプションは値をそのままURLエンコードするため、+ 区切りだと
		// リテラルの "+" として送られてしまう(スペースとして解釈されない)。単語区切りは半角スペースにする。
		const data = await ofetch<{ items?: SearchIssueItem[] }>(SEARCH_ISSUES_URL, {
			query: { q: query, per_page: 100, page },
			headers: githubHeaders(),
		});
		const pageItems = Array.isArray(data.items) ? data.items : [];
		items.push(...pageItems);
		if (pageItems.length < 100) break;
	}
	return items;
}

function groupByRepo(items: SearchIssueItem[]): Map<string, number> {
	const grouped = new Map<string, number>();
	for (const item of items) {
		const match = String(item.repository_url ?? '').match(/repos\/([^/]+)\/([^/]+)$/);
		if (!match) continue;
		const repo = `${match[1]}/${match[2]}`;
		grouped.set(repo, (grouped.get(repo) ?? 0) + 1);
	}
	return grouped;
}

// フォークして送った Pull Request が外部(自分以外が所有する)リポジトリでマージされたものと、
// 外部リポジトリに立てた Issue を、それぞれ集計する。GitHub に専用APIは無いため、Issues/PR検索の
// `is:merged` / `type:issue` + 自分のリポジトリを除外する条件で代用する。
// 規模(スター数)が大きいプロジェクト順に並べたいので、集計後にそれぞれのリポジトリのスター数を取得してソートし直す。
export async function getMergedContributions(user: string): Promise<Contribution[]> {
	return cached('contributions', user, WORKS_TTL_MS, async () => {
		const [mergedItems, issueItems] = await Promise.all([
			searchIssuesAll(`type:pr author:${user} is:merged -user:${user}`),
			searchIssuesAll(`type:issue author:${user} -user:${user}`),
		]);

		const mergedByRepo = groupByRepo(mergedItems);
		const issuesByRepo = groupByRepo(issueItems);
		const repos = new Set([...mergedByRepo.keys(), ...issuesByRepo.keys()]);

		const contributions = await Promise.all(
			[...repos].map(async (repo) => {
				const [owner, name] = repo.split('/');
				const stars = await fetchRepoStars(owner, name);
				return {
					repo,
					owner,
					name,
					url: `https://github.com/${repo}`,
					mergedCount: mergedByRepo.get(repo) ?? 0,
					issueCount: issuesByRepo.get(repo) ?? 0,
					stars,
				};
			}),
		);

		const withLanguages = await withLanguageBreakdown(contributions);

		// スター数が不明なもの(取得失敗)は末尾に回し、既知の値同士はスター数、同数なら貢献数(マージ+Issue)で比較する。
		return withLanguages.sort((a, b) => {
			const aTotal = a.mergedCount + a.issueCount;
			const bTotal = b.mergedCount + b.issueCount;
			if (a.stars === null && b.stars === null) return bTotal - aTotal;
			if (a.stars === null) return 1;
			if (b.stars === null) return -1;
			return b.stars - a.stars || bTotal - aTotal;
		});
	});
}

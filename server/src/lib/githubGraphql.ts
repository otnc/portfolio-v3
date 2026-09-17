import { env } from './env.js';
import { getLanguageColor } from './languageColors.js';
import type { CommitActivityDay, LanguageStat, ProfileStats } from '../types.js';

const GRAPHQL_URL = 'https://api.github.com/graphql';

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const response = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.githubToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) {
		throw new Error(`GitHub GraphQL API error ${response.status}: ${await response.text()}`);
	}

	const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
	if (json.errors?.length) {
		throw new Error(`GitHub GraphQL API returned errors: ${json.errors.map((e) => e.message).join('; ')}`);
	}
	if (!json.data) {
		throw new Error('GitHub GraphQL API returned no data');
	}
	return json.data;
}

// --- プロフィール + 公開リポジトリの言語内訳(スター数・フォロワー数込み)を
//     ページネーションしながら1種類のクエリで取得する ---

interface RepoLanguagesPage {
	user: {
		login: string;
		name: string | null;
		url: string;
		avatarUrl: string;
		createdAt: string;
		followers: { totalCount: number };
		repositories: {
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
			nodes: {
				stargazerCount: number;
				languages: {
					edges: { size: number; node: { name: string; color: string | null } }[];
				};
			}[];
		};
	};
}

const REPO_LANGUAGES_QUERY = /* GraphQL */ `
	query ($login: String!, $after: String) {
		user(login: $login) {
			login
			name
			url
			avatarUrl
			createdAt
			followers {
				totalCount
			}
			repositories(
				first: 100
				after: $after
				ownerAffiliations: OWNER
				isFork: false
				privacy: PUBLIC
			) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					stargazerCount
					languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
						edges {
							size
							node {
								name
								color
							}
						}
					}
				}
			}
		}
	}
`;

export async function fetchProfileAndLanguages(login: string): Promise<{
	profile: Omit<ProfileStats, 'total_contributions' | 'fetched_at'>;
	languages: LanguageStat[];
	createdAt: string;
}> {
	const languageBytes = new Map<string, { bytes: number; color: string }>();
	let totalStars = 0;
	let repoCount = 0;
	let after: string | null = null;
	let profileInfo: RepoLanguagesPage['user'] | null = null;

	do {
		const page: RepoLanguagesPage = await graphql<RepoLanguagesPage>(REPO_LANGUAGES_QUERY, { login, after });
		profileInfo = page.user;

		for (const repo of page.user.repositories.nodes) {
			repoCount += 1;
			totalStars += repo.stargazerCount;
			for (const edge of repo.languages.edges) {
				const key = edge.node.name;
				const prev = languageBytes.get(key);
				const color = edge.node.color ?? getLanguageColor(key);
				languageBytes.set(key, { bytes: (prev?.bytes ?? 0) + edge.size, color });
			}
		}

		after = page.user.repositories.pageInfo.hasNextPage
			? page.user.repositories.pageInfo.endCursor
			: null;
	} while (after);

	const totalBytes = [...languageBytes.values()].reduce((sum, l) => sum + l.bytes, 0);
	const languages: LanguageStat[] = [...languageBytes.entries()]
		.map(([name, { bytes, color }]) => ({
			name,
			bytes,
			percentage: totalBytes > 0 ? Number(((bytes / totalBytes) * 100).toFixed(2)) : 0,
			color,
		}))
		.sort((a, b) => b.bytes - a.bytes);

	if (!profileInfo) {
		throw new Error(`GitHub user "${login}" が見つかりませんでした`);
	}

	return {
		profile: {
			login: profileInfo.login,
			name: profileInfo.name,
			html_url: profileInfo.url,
			avatar_url: profileInfo.avatarUrl,
			followers: profileInfo.followers.totalCount,
			public_repos: repoCount,
			total_stars: totalStars,
		},
		languages,
		createdAt: profileInfo.createdAt,
	};
}

// --- 全期間の総コントリビュート数 ---
// GraphQL の contributionsCollection は1回のクエリで最大1年分しか
// 取得できないため、アカウント作成年〜現在の年まで、エイリアスを使って
// 1回のリクエストにまとめて問い合わせる。

interface AllTimeContributionsResult {
	[alias: string]: { contributionCalendar: { totalContributions: number } };
}

export async function fetchAllTimeContributions(login: string, createdAt: string): Promise<number> {
	const startYear = new Date(createdAt).getUTCFullYear();
	const currentYear = new Date().getUTCFullYear();

	const yearRanges: { alias: string; from: string; to: string }[] = [];
	for (let year = startYear; year <= currentYear; year += 1) {
		yearRanges.push({
			alias: `y${year}`,
			from: `${year}-01-01T00:00:00Z`,
			to: `${year}-12-31T23:59:59Z`,
		});
	}

	const fields = yearRanges
		.map(
			({ alias, from, to }) => /* GraphQL */ `
				${alias}: contributionsCollection(from: "${from}", to: "${to}") {
					contributionCalendar {
						totalContributions
					}
				}`,
		)
		.join('\n');

	const query = /* GraphQL */ `
		query ($login: String!) {
			user(login: $login) {
				${fields}
			}
		}
	`;

	const data = await graphql<{ user: AllTimeContributionsResult }>(query, { login });

	return yearRanges.reduce(
		(sum, { alias }) => sum + (data.user[alias]?.contributionCalendar.totalContributions ?? 0),
		0,
	);
}

// --- 直近N日間の日次コントリビュート数 ---

interface RecentActivityResult {
	user: {
		contributionsCollection: {
			contributionCalendar: {
				weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
			};
		};
	};
}

const RECENT_ACTIVITY_QUERY = /* GraphQL */ `
	query ($login: String!, $from: DateTime!, $to: DateTime!) {
		user(login: $login) {
			contributionsCollection(from: $from, to: $to) {
				contributionCalendar {
					weeks {
						contributionDays {
							date
							contributionCount
						}
					}
				}
			}
		}
	}
`;

export async function fetchRecentActivity(login: string, days = 30): Promise<CommitActivityDay[]> {
	const to = new Date();
	const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

	const data = await graphql<RecentActivityResult>(RECENT_ACTIVITY_QUERY, {
		login,
		from: from.toISOString(),
		to: to.toISOString(),
	});

	return data.user.contributionsCollection.contributionCalendar.weeks
		.flatMap((week) => week.contributionDays)
		.map((day) => ({ date: day.date, count: day.contributionCount }));
}

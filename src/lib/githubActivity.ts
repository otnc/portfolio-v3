// 自前の server/ (Hono, github-most-used-langs 互換 + 全期間コントリビュート対応)
// を立てたらそちらを指す。未設定時は暫定で montblank.fun の既存APIにフォールバック。
const API_URL = import.meta.env.GITHUB_ACTIVITY_API_URL ?? 'https://github-most-used-langs.montblank.fun/';

export interface GithubProfileStats {
	login: string;
	htmlUrl: string;
	avatarUrl: string;
	followers: number;
	publicRepos: number;
	totalStars: number;
	// server/ 側(自前API)なら常に数値が入る。外部APIにフォールバックしている間は
	// まだ対応していないため null になる。
	totalContributions: number | null;
}

export interface LanguageStat {
	name: string;
	percentage: number;
	color: string;
}

export interface CommitActivityDay {
	date: string;
	count: number;
}

export interface GithubActivity {
	profile: GithubProfileStats;
	languages: LanguageStat[];
	commitActivity: CommitActivityDay[];
}

export async function fetchGithubActivity(): Promise<GithubActivity | null> {
	try {
		const response = await fetch(API_URL, { cache: 'no-store' });
		if (!response.ok) return null;

		const data = await response.json();
		if (!data?.profile) return null;

		return {
			profile: {
				login: String(data.profile.login ?? ''),
				htmlUrl: String(data.profile.html_url ?? ''),
				avatarUrl: String(data.profile.avatar_url ?? ''),
				followers: Number(data.profile.followers ?? 0),
				publicRepos: Number(data.profile.public_repos ?? 0),
				totalStars: Number(data.profile.total_stars ?? 0),
				totalContributions:
					typeof data.profile.total_contributions === 'number'
						? data.profile.total_contributions
						: null,
			},
			languages: Array.isArray(data.languages)
				? data.languages.map((lang: Record<string, unknown>) => ({
						name: String(lang.name ?? ''),
						percentage: Number(lang.percentage ?? 0),
						color: String(lang.color ?? '#8b8b8b'),
					}))
				: [],
			commitActivity: Array.isArray(data.commit_activity)
				? data.commit_activity.map((day: Record<string, unknown>) => ({
						date: String(day.date ?? ''),
						count: Number(day.count ?? 0),
					}))
				: [],
		};
	} catch {
		return null;
	}
}

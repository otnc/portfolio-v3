import { api } from './api';

// server/ (Hono, github-most-used-langs 互換 + 全期間コントリビュート対応) のAPIを常に使う。
const GITHUB_USER = 'otnc';

export interface GithubProfileStats {
	login: string;
	htmlUrl: string;
	avatarUrl: string;
	followers: number;
	publicRepos: number;
	totalStars: number;
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

export async function fetchGithubActivity(user = GITHUB_USER): Promise<GithubActivity> {
	const data = await api<Record<string, unknown>>(`/github/${user}`);
	if (!data?.profile || typeof data.profile !== 'object') {
		throw new Error('GitHub activity response has no profile');
	}
	const profile = data.profile as Record<string, unknown>;

	return {
		profile: {
			login: String(profile.login ?? ''),
			htmlUrl: String(profile.html_url ?? ''),
			avatarUrl: String(profile.avatar_url ?? ''),
			followers: Number(profile.followers ?? 0),
			publicRepos: Number(profile.public_repos ?? 0),
			totalStars: Number(profile.total_stars ?? 0),
			totalContributions:
				typeof profile.total_contributions === 'number' ? profile.total_contributions : null,
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
}

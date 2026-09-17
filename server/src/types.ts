export interface LanguageStat {
	name: string;
	bytes: number;
	percentage: number;
	color: string;
}

export interface ProfileStats {
	login: string;
	name: string | null;
	html_url: string;
	avatar_url: string;
	followers: number;
	public_repos: number;
	total_stars: number;
	// github-most-used-langs には無かった、今回追加した項目。
	total_contributions: number;
	fetched_at: string;
}

export interface CommitActivityDay {
	date: string;
	count: number;
}

export interface GithubActivityPayload {
	profile: ProfileStats;
	languages: LanguageStat[];
	commit_activity: CommitActivityDay[];
	meta: {
		cached: boolean;
		cached_at: string;
		ttl_seconds: number;
	};
}

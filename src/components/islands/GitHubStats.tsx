import { formatNumber } from '../../lib/format';
import { fetchGithubActivity, type GithubActivity } from '../../lib/githubActivity';
import { useFresh } from '../../lib/useFresh';
import styles from './GitHubStats.module.css';

interface Props {
	initial: GithubActivity | null;
	user?: string;
	profileUrl: string;
}

function Activity({ activity }: { activity: GithubActivity }) {
	const { profile, languages, commitActivity } = activity;
	const maxCommitCount = Math.max(1, ...commitActivity.map((day) => day.count));

	return (
		<div class={styles.card}>
			<div class={styles.contributionsHero}>
				<p class={styles.heroValue}>
					{profile.totalContributions !== null ? formatNumber(profile.totalContributions) : '—'}
				</p>
				<p class={styles.heroLabel}>
					Total Contributions
					{profile.totalContributions === null && <span class={styles.heroNote}>(近日対応)</span>}
				</p>
			</div>

			<div class={styles.statsGrid}>
				<div class={styles.stat}>
					<p class={styles.value}>{formatNumber(profile.followers)}</p>
					<p class={styles.label}>Followers</p>
				</div>
				<div class={styles.stat}>
					<p class={styles.value}>{formatNumber(profile.publicRepos)}</p>
					<p class={styles.label}>Public Repos</p>
				</div>
				<div class={styles.stat}>
					<p class={styles.value}>{formatNumber(profile.totalStars)}</p>
					<p class={styles.label}>Total Stars</p>
				</div>
			</div>

			{languages.length > 0 && (
				<div class={styles.languages}>
					<div class={styles.langBar}>
						{languages.map((lang) => (
							<span key={lang.name} style={{ width: `${lang.percentage}%`, backgroundColor: lang.color }} />
						))}
					</div>
					<ul class={`${styles.langList} scrollbox`}>
						{languages.map((lang) => (
							<li key={lang.name}>
								<span class={styles.dot} style={{ backgroundColor: lang.color }} />
								<span class={styles.langName}>{lang.name}</span>
								<span class={styles.langPercentage}>{lang.percentage.toFixed(2)}%</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{commitActivity.length > 0 && (
				<div class={styles.commitActivity}>
					<div class={styles.bars}>
						{commitActivity.map((day) => (
							<span
								key={day.date}
								class={styles.bar}
								title={`${day.date}: ${day.count} commits`}
								style={{ height: `${Math.max((day.count / maxCommitCount) * 100, 4)}%` }}
							/>
						))}
					</div>
					<p class={styles.rangeLabel}>直近{commitActivity.length}日間のコミット数</p>
				</div>
			)}
		</div>
	);
}

export default function GitHubStats({ initial, user, profileUrl }: Props) {
	const activity = useFresh(initial, () => fetchGithubActivity(user));

	if (!activity) {
		return (
			<p class={styles.empty}>
				GitHubのアクティビティを取得できませんでした。
				<a href={profileUrl} target="_blank" rel="noopener noreferrer">
					GitHub
				</a>
				から確認してください。
			</p>
		);
	}
	return <Activity activity={activity} />;
}

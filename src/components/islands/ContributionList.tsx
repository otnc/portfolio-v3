import { formatCompactNumber, formatNumber } from '../../lib/format';
import { fetchMergedContributions, type Contribution } from '../../lib/github';
import { useFresh } from '../../lib/useFresh';
import Octicon from './Octicon';
import RepoName from './RepoName';
import styles from './ContributionList.module.css';

interface Props {
	initial: Contribution[];
	profileUser: string;
}

function ContributionCard({ item }: { item: Contribution }) {
	const primaryLanguage = item.languages?.[0];
	const percentage = primaryLanguage !== undefined ? primaryLanguage.percentage.toFixed(0) : undefined;

	return (
		<a class={styles.item} href={item.url} target="_blank" rel="noopener noreferrer">
			<div class={styles.text}>
				<p class={styles.repo}>
					<RepoName text={item.repo} />
				</p>
				{primaryLanguage && (
					<span class={styles.langLabel}>
						<span class={styles.dot} style={{ backgroundColor: primaryLanguage.color }} />
						{primaryLanguage.name}
						{percentage !== undefined && <span class={styles.percentage}>{percentage}%</span>}
					</span>
				)}
			</div>
			<div class={styles.meta}>
				<span
					class={`${styles.stat} ${styles.stars}`}
					title={typeof item.stars === 'number' ? `${formatNumber(item.stars)} stars` : undefined}
				>
					<Octicon name="star-fill" />
					<span class={styles.statValue}>
						{typeof item.stars === 'number' ? formatCompactNumber(item.stars) : '-'}
					</span>
				</span>
				<span
					class={`${styles.stat} ${styles.merged}`}
					title={item.mergedCount > 0 ? `${formatNumber(item.mergedCount)} merged pull requests` : undefined}
				>
					<Octicon name="git-merge" />
					<span class={styles.statValue}>
						{item.mergedCount > 0 ? formatCompactNumber(item.mergedCount) : '-'}
					</span>
				</span>
				<span
					class={`${styles.stat} ${styles.issues}`}
					title={item.issueCount > 0 ? `${formatNumber(item.issueCount)} issues opened` : undefined}
				>
					<Octicon name="issue-opened" />
					<span class={styles.statValue}>
						{item.issueCount > 0 ? formatCompactNumber(item.issueCount) : '-'}
					</span>
				</span>
			</div>
		</a>
	);
}

export default function ContributionList({ initial, profileUser }: Props) {
	const contributions = useFresh(initial, () => fetchMergedContributions(profileUser));

	if (contributions.length === 0) {
		return <p class={styles.empty}>コントリビュートが見つかりませんでした。</p>;
	}

	return (
		<div class={`${styles.card} scrollbox`}>
			{contributions.map((item) => (
				<ContributionCard key={item.repo} item={item} />
			))}
		</div>
	);
}

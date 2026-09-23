import { formatCompactNumber, formatNumber } from '../../lib/format';
import { fetchMergedContributions, type Contribution } from '../../lib/github';
import { useFresh } from '../../lib/useFresh';
import Octicon from './Octicon';
import styles from './ContributionList.module.css';

interface Props {
	initial: Contribution[];
	profileUser: string;
}

export default function ContributionList({ initial, profileUser }: Props) {
	const contributions = useFresh(initial, () => fetchMergedContributions(profileUser));

	if (contributions.length === 0) {
		return <p class={styles.empty}>コントリビュートが見つかりませんでした。</p>;
	}

	return (
		<div class={`${styles.card} scrollbox`}>
			{contributions.map((item) => (
				<a key={item.repo} class={styles.item} href={item.url} target="_blank" rel="noopener noreferrer">
					<p class={styles.repo}>{item.repo}</p>
					<div class={styles.meta}>
						{typeof item.stars === 'number' && (
							<span class={`${styles.stat} ${styles.stars}`} title={`${formatNumber(item.stars)} stars`}>
								<Octicon name="star-fill" />
								{formatCompactNumber(item.stars)}
							</span>
						)}
						{item.mergedCount > 0 && (
							<span
								class={`${styles.stat} ${styles.merged}`}
								title={`${formatNumber(item.mergedCount)} merged pull requests`}
							>
								<Octicon name="git-merge" />
								{formatNumber(item.mergedCount)}
							</span>
						)}
						{item.issueCount > 0 && (
							<span
								class={`${styles.stat} ${styles.issues}`}
								title={`${formatNumber(item.issueCount)} issues opened`}
							>
								<Octicon name="issue-opened" />
								{formatNumber(item.issueCount)}
							</span>
						)}
					</div>
				</a>
			))}
		</div>
	);
}

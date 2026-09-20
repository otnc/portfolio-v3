import { formatNumber } from '../../lib/format';
import { fetchMergedContributions, type Contribution } from '../../lib/github';
import { useFresh } from '../../lib/useFresh';
import styles from './ContributionList.module.css';

interface Props {
	initial: Contribution[];
	profileUser: string;
}

export default function ContributionList({ initial, profileUser }: Props) {
	const contributions = useFresh(initial, () => fetchMergedContributions(profileUser));

	if (contributions.length === 0) {
		return <p class={styles.empty}>マージされたPull Requestが見つかりませんでした。</p>;
	}

	return (
		<div class={`${styles.card} scrollbox`}>
			{contributions.map((item) => (
				<a key={item.repo} class={styles.item} href={item.url} target="_blank" rel="noopener noreferrer">
					<p class={styles.repo}>{item.repo}</p>
					<div class={styles.meta}>
						{typeof item.stars === 'number' && (
							<span class={`${styles.stat} ${styles.stars}`}>
								<span aria-hidden="true">★</span>
								{formatNumber(item.stars)}
							</span>
						)}
						<span class={`${styles.stat} ${styles.merged}`}>
							<span aria-hidden="true">⇄</span>
							{formatNumber(item.mergedCount)} merged
						</span>
					</div>
				</a>
			))}
		</div>
	);
}

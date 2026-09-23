import { fetchMergedContributions, type Contribution } from '../../lib/github';
import { useFresh } from '../../lib/useFresh';
import LanguageRow from './LanguageRow';
import RepoName from './RepoName';
import StatsColumn from './StatsColumn';
import styles from './ContributionList.module.css';

interface Props {
	initial: Contribution[];
	profileUser: string;
}

function ContributionCard({ item }: { item: Contribution }) {
	const languages = item.languages?.slice(0, 3) ?? [];

	return (
		<a class={styles.item} href={item.url} target="_blank" rel="noopener noreferrer">
			<div class={styles.text}>
				<p class={styles.repo}>
					<RepoName text={item.repo} />
				</p>
				{languages.length > 0 && <LanguageRow languages={languages} />}
			</div>
			<StatsColumn stars={item.stars} merged={item.mergedCount} issues={item.issueCount} />
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

import { formatNumber } from '../../lib/format';
import { fetchWorks, type Repo } from '../../lib/github';
import { useFresh } from '../../lib/useFresh';
import LanguageRow from './LanguageRow';
import Octicon from './Octicon';
import RepoName from './RepoName';
import styles from './WorkList.module.css';

interface Props {
	initial: Repo[];
	profileUrl: string;
	profileUser: string;
}

function WorkCard({ repo, profileUser }: { repo: Repo; profileUser: string }) {
	const title = repo.owner === profileUser ? repo.name : `${repo.owner}/${repo.name}`;
	// 言語ごとのバイト数が取れている場合は上位3件、取れなかった場合は検索結果のtopLanguage(割合なし)1件のみ。
	const languages = repo.languages?.slice(0, 3) ?? (repo.topLanguage ? [repo.topLanguage] : []);

	return (
		<a class={styles.work} href={repo.url} target="_blank" rel="noopener noreferrer">
			<div class={styles.text}>
				<p class={styles.title}>
					{repo.pinned && (
						<span class={styles.pin} title="Pinned" aria-label="Pinned">
							<Octicon name="pin" size={13} />
						</span>
					)}
					<RepoName text={title} />
				</p>
				{repo.description && <p class={styles.description}>{repo.description}</p>}
				{languages.length > 0 && <LanguageRow languages={languages} />}
			</div>
			{typeof repo.stars === 'number' && (
				<span class={styles.stars}>
					<Octicon name="star-fill" class={styles.star} />
					{formatNumber(repo.stars)}
				</span>
			)}
		</a>
	);
}

export default function WorkList({ initial, profileUrl, profileUser }: Props) {
	const repos = useFresh(initial, () => fetchWorks(profileUser));

	if (repos.length === 0) {
		return (
			<p class={styles.empty}>
				リポジトリを取得できませんでした。
				<a href={profileUrl} target="_blank" rel="noopener noreferrer">
					GitHub
				</a>
				から確認してください。
			</p>
		);
	}

	return (
		<div class={`${styles.card} scrollbox`}>
			{repos.map((repo) => (
				<WorkCard key={repo.url} repo={repo} profileUser={profileUser} />
			))}
		</div>
	);
}

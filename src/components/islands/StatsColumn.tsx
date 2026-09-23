import { formatCompactNumber, formatNumber } from '../../lib/format';
import Octicon, { type OcticonName } from './Octicon';
import styles from './StatsColumn.module.css';

interface Stat {
	icon: OcticonName;
	value: number | null;
	label: string;
	colorClass: string;
}

interface Props {
	stars: number | null;
	merged: number | null;
	issues: number | null;
}

// star/merged/issue の3つを縦に並べる、Works/Contributions共通の右側カラム。
// 値が無い(null または 0)場合は "-" にする。
export default function StatsColumn({ stars, merged, issues }: Props) {
	const stats: Stat[] = [
		{ icon: 'star-fill', value: stars, label: 'stars', colorClass: styles.stars },
		{ icon: 'git-merge', value: merged, label: 'merged pull requests', colorClass: styles.merged },
		{ icon: 'issue-opened', value: issues, label: 'issues opened', colorClass: styles.issues },
	];

	return (
		<div class={styles.meta}>
			{stats.map((stat) => (
				<span
					key={stat.label}
					class={`${styles.stat} ${stat.colorClass}`}
					title={stat.value ? `${formatNumber(stat.value)} ${stat.label}` : undefined}
				>
					<Octicon name={stat.icon} />
					<span class={styles.statValue}>{stat.value ? formatCompactNumber(stat.value) : '-'}</span>
				</span>
			))}
		</div>
	);
}

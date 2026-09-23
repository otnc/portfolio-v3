import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import styles from './LanguageRow.module.css';

interface Props {
	languages: { name: string; percentage?: number; color: string }[];
	class?: string;
}

// 第2・第3言語まで表示したいが、枠の幅次第では収まらない。
// 全言語をいったん並べて実際の幅を測り、コンテナ幅をはみ出す末尾の言語だけ非表示にする。
// (最初の1件だけは必ず表示し、それすら入り切らない場合は行内で省略する)
export default function LanguageRow({ languages, class: className }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [visibleCount, setVisibleCount] = useState(languages.length);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const measure = () => {
			const items = Array.from(container.children) as HTMLElement[];
			const available = container.clientWidth;
			let count = 0;
			for (const item of items) {
				if (count > 0 && item.offsetLeft + item.offsetWidth > available) break;
				count += 1;
			}
			setVisibleCount(Math.max(count, 1));
		};

		// 隠れている項目はoffsetWidthが0になり正しく測れないため、
		// 毎回いったん全件表示に戻してから(次のフレームで)測り直す。
		let frame = 0;
		const scheduleMeasure = () => {
			setVisibleCount(languages.length);
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};

		scheduleMeasure();
		if (typeof ResizeObserver === 'undefined') {
			return () => cancelAnimationFrame(frame);
		}
		const observer = new ResizeObserver(scheduleMeasure);
		observer.observe(container);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, [languages]);

	return (
		<div ref={containerRef} class={`${styles.row} ${className ?? ''}`}>
			{languages.map((lang, index) => (
				<span
					key={lang.name}
					class={styles.item}
					style={{ display: index < visibleCount ? undefined : 'none' }}
				>
					<span class={styles.dot} style={{ backgroundColor: lang.color }} />
					{lang.name}
					{lang.percentage !== undefined && (
						<span class={styles.percentage}>{lang.percentage.toFixed(0)}%</span>
					)}
				</span>
			))}
		</div>
	);
}

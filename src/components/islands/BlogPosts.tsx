import { fetchLatestBlogPosts, type BlogPost } from '../../lib/blog';
import { useFresh } from '../../lib/useFresh';
import styles from './BlogPosts.module.css';

// ビルド時(Node)とブラウザでタイムゾーンが違っても表示がずれないよう固定する。
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	timeZone: 'Asia/Tokyo',
});

function formatDate(pubDate: string): string | undefined {
	const date = new Date(pubDate);
	return Number.isNaN(date.getTime()) ? undefined : dateFormat.format(date);
}

const NEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

// 公開から1週間以内の記事にはNewラベルを付ける。
function isNew(pubDate: string): boolean {
	const time = new Date(pubDate).getTime();
	return !Number.isNaN(time) && Date.now() - time >= 0 && Date.now() - time <= NEW_WITHIN_MS;
}

interface Props {
	initial: BlogPost[];
}

export default function BlogPosts({ initial }: Props) {
	const posts = useFresh(initial, () => fetchLatestBlogPosts(30));

	if (posts.length === 0) {
		return <p class={styles.empty}>最新記事を取得できませんでした。</p>;
	}

	return (
		<div class={`${styles.card} scrollbox`}>
			{posts.map((post) => {
				const date = post.pubDate ? formatDate(post.pubDate) : undefined;
				return (
					<a key={post.url} class={styles.post} href={post.url} target="_blank" rel="noopener noreferrer">
						<div class={styles.text}>
							<p class={styles.title}>
								{post.pubDate && isNew(post.pubDate) && <span class={styles.newBadge}>New</span>}
								<span class={styles.source}>{post.source}</span>
								{post.title}
							</p>
							{post.description && <p class={styles.description}>{post.description}</p>}
							{date && <p class={styles.date}>{date}</p>}
						</div>
						<span class={styles.arrow} aria-hidden="true">
							→
						</span>
					</a>
				);
			})}
		</div>
	);
}

import { XMLParser } from 'fast-xml-parser';
import { ofetch } from 'ofetch';
import { cached } from './simpleCache.js';

// 記事の更新に追従できるよう短めにする(stale-while-revalidateなので待たされない)。
const BLOG_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS = 30;

export interface BlogPost {
	title: string;
	url: string;
	description: string;
	pubDate: string;
	source: string;
}

interface FeedEntry {
	title?: unknown;
	link?: unknown;
	url?: unknown;
	description?: unknown;
	pubDate?: unknown;
	published?: unknown;
	updated?: unknown;
	summary?: unknown;
	content?: unknown;
}

interface FeedConfig {
	source: string;
	url: string;
}

const FEEDS: FeedConfig[] = [
	{ source: 'Blog', url: 'https://blog.montblank.fun/rss.xml' },
	{ source: 'Zenn', url: 'https://zenn.dev/devuloper/feed' },
	{ source: 'Qiita', url: 'https://qiita.com/devuloper/feed' },
	{ source: 'note', url: 'https://note.com/otoneko1102/rss' },
];

function text(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number') return String(value);
	if (value && typeof value === 'object' && '#text' in value) {
		return String((value as Record<string, unknown>)['#text'] ?? '');
	}
	return '';
}

function link(value: unknown): string {
	if (typeof value === 'string') return value;
	if (!Array.isArray(value) && value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return String(record.href ?? record['@_href'] ?? '');
	}
	if (Array.isArray(value)) {
		const alternate = value.find((item) => {
			if (!item || typeof item !== 'object') return false;
			const record = item as Record<string, unknown>;
			return !record.rel || record.rel === 'alternate' || record['@_rel'] === 'alternate';
		});
		return link(alternate);
	}
	return '';
}

async function fetchFeed({ source, url }: FeedConfig): Promise<BlogPost[]> {
	const xml = await ofetch(url, { responseType: 'text' });
	const feed = new XMLParser().parse(xml);

	const rawItems = feed?.rss?.channel?.item ?? feed?.feed?.entry;
	const items: FeedEntry[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

	return items.slice(0, MAX_ITEMS).map((item) => {
		const isAtom = Boolean(feed?.feed);
		return {
			title: text(item.title),
			url: link(item.link) || text(item.url),
			description: text(item.description ?? item.summary ?? item.content),
			pubDate: text(item.pubDate ?? (isAtom ? item.published ?? item.updated : undefined)),
			source,
		};
	});
}

export async function getBlogPosts(limit: number): Promise<BlogPost[]> {
	const posts = await cached('blog', 'feed-v3', BLOG_TTL_MS, async () => {
		const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
		const successful: BlogPost[][] = [];
		for (const [index, result] of results.entries()) {
			if (result.status === 'fulfilled') {
				successful.push(result.value);
			} else {
				console.error(`[blog] ${FEEDS[index].source}フィードの取得に失敗:`, result.reason);
			}
		}
		if (successful.length === 0) {
			throw new Error('すべてのブログフィードを取得できませんでした');
		}
		return successful
			.flat()
			.filter((post) => post.title && post.url)
			.sort((a, b) => {
				const dateA = Date.parse(a.pubDate);
				const dateB = Date.parse(b.pubDate);
				return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
			})
			.slice(0, MAX_ITEMS);
	});
	return posts.slice(0, limit);
}

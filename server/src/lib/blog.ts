import { XMLParser } from 'fast-xml-parser';
import { ofetch } from 'ofetch';
import { cached } from './simpleCache.js';

const FEED_URL = 'https://blog.montblank.fun/rss.xml';
// 記事の更新に追従できるよう短めにする(stale-while-revalidateなので待たされない)。
const BLOG_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS = 30;

export interface BlogPost {
	title: string;
	url: string;
	description: string;
	pubDate: string;
}

interface FeedItem {
	title?: unknown;
	link?: unknown;
	description?: unknown;
	pubDate?: unknown;
}

async function fetchFeed(): Promise<BlogPost[]> {
	const xml = await ofetch(FEED_URL, { responseType: 'text' });
	const feed = new XMLParser().parse(xml);

	const rawItems = feed?.rss?.channel?.item;
	const items: FeedItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

	return items.slice(0, MAX_ITEMS).map((item) => ({
		title: String(item.title ?? ''),
		url: String(item.link ?? ''),
		description: String(item.description ?? ''),
		pubDate: String(item.pubDate ?? ''),
	}));
}

export async function getBlogPosts(limit: number): Promise<BlogPost[]> {
	const posts = await cached('blog', 'feed', BLOG_TTL_MS, fetchFeed);
	return posts.slice(0, limit);
}

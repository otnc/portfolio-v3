import { XMLParser } from 'fast-xml-parser';

const FEED_URL = 'https://blog.montblank.fun/rss.xml';

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

export async function fetchLatestBlogPosts(limit = 5): Promise<BlogPost[]> {
	try {
		const response = await fetch(FEED_URL);
		if (!response.ok) return [];

		const xml = await response.text();
		const parser = new XMLParser();
		const feed = parser.parse(xml);

		const rawItems = feed?.rss?.channel?.item;
		const items: FeedItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

		return items.slice(0, limit).map((item) => ({
			title: String(item.title ?? ''),
			url: String(item.link ?? ''),
			description: String(item.description ?? ''),
			pubDate: String(item.pubDate ?? ''),
		}));
	} catch {
		return [];
	}
}

import { api } from './api';

export interface BlogPost {
	title: string;
	url: string;
	description: string;
	pubDate: string;
}

export function fetchLatestBlogPosts(limit = 15): Promise<BlogPost[]> {
	return api<BlogPost[]>('/blog', { query: { limit } });
}

import { api } from './api';

export interface BlogPost {
	title: string;
	url: string;
	description: string;
	pubDate: string;
	source: string;
}

export function fetchLatestBlogPosts(limit = 30): Promise<BlogPost[]> {
	return api<BlogPost[]>('/blog', { query: { limit } });
}

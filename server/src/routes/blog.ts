import { Hono } from 'hono';
import { getBlogPosts } from '../lib/blog.js';

export const blogRoute = new Hono();

blogRoute.get('/', async (c) => {
	const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 15) || 15, 1), 30);

	try {
		return c.json(await getBlogPosts(limit));
	} catch (error) {
		console.error('[api] /api/blog の取得に失敗:', error);
		return c.json({ error: 'ブログの記事を取得できませんでした' }, 502);
	}
});

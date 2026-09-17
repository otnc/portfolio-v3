import { Hono } from 'hono';
import { getGithubActivity } from '../lib/cache.js';

export const githubRoute = new Hono();

githubRoute.get('/:user', async (c) => {
	const user = c.req.param('user');

	try {
		const payload = await getGithubActivity(user);
		return c.json(payload);
	} catch (error) {
		console.error(`[api] /api/github/${user} の取得に失敗:`, error);
		return c.json({ error: 'GitHubの情報を取得できませんでした' }, 502);
	}
});

import { Hono } from 'hono';
import { getMergedContributions, getWorks } from '../lib/githubWorks.js';

export const worksRoute = new Hono();

worksRoute.get('/:user', async (c) => {
	const user = c.req.param('user');
	const otherLimit = Number(c.req.query('otherLimit') ?? 9);

	try {
		const works = await getWorks(user, otherLimit);
		return c.json(works);
	} catch (error) {
		console.error(`[api] /api/works/${user} の取得に失敗:`, error);
		return c.json({ error: 'GitHubのリポジトリ情報を取得できませんでした' }, 502);
	}
});

export const contributionsRoute = new Hono();

contributionsRoute.get('/:user', async (c) => {
	const user = c.req.param('user');

	try {
		const contributions = await getMergedContributions(user);
		return c.json(contributions);
	} catch (error) {
		console.error(`[api] /api/contributions/${user} の取得に失敗:`, error);
		return c.json({ error: 'コントリビュート情報を取得できませんでした' }, 502);
	}
});

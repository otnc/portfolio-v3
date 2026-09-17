import { Hono } from 'hono';
import { getFavicon } from '../lib/favicon.js';

export const faviconRoute = new Hono();

// クライアントに外部サイトを直接叩かせず、必ずこのAPI経由でfaviconを取得・配信する。
faviconRoute.get('/', async (c) => {
	const targetUrl = c.req.query('url');
	if (!targetUrl) {
		return c.json({ error: 'url クエリパラメータが必要です' }, 400);
	}

	try {
		const { contentType, body } = await getFavicon(targetUrl);
		c.header('Content-Type', contentType);
		c.header('Cache-Control', 'public, max-age=86400');
		return c.body(Uint8Array.from(body));
	} catch (error) {
		console.error(`[api] /api/favicon (${targetUrl}) の取得に失敗:`, error);
		return c.json({ error: 'faviconを取得できませんでした' }, 502);
	}
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env } from './lib/env.js';
import { scheduleRefresh, warmCache } from './lib/cache.js';
import { counterRoute } from './routes/counter.js';
import { faviconRoute } from './routes/favicon.js';
import { githubRoute } from './routes/github.js';
import { contributionsRoute, worksRoute } from './routes/works.js';

const app = new Hono();

app.route('/api/github', githubRoute);
app.route('/api/works', worksRoute);
app.route('/api/contributions', contributionsRoute);
app.route('/api/favicon', faviconRoute);
app.route('/api/counter', counterRoute);

// Astro のビルド成果物 (dist/) をそのまま配信する。
app.use('*', serveStatic({ root: env.staticDir }));

// どのルートにも一致しなかった場合、Astroが生成した404.htmlをステータス404で返す。
app.notFound(async (c) => {
	try {
		const html = await readFile(path.resolve(env.staticDir, '404.html'), 'utf-8');
		return c.html(html, 404);
	} catch {
		return c.text('404 Not Found', 404);
	}
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
	console.log(`marron-portfolio-server listening on http://localhost:${info.port}`);
});

// 起動時にキャッシュを温めておき、以後は定期的に裏で更新し続ける。
void warmCache(env.defaultUser);
scheduleRefresh(env.defaultUser, env.refreshIntervalMs);

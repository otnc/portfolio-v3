import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env } from './lib/env.js';
import { scheduleRefresh, warmCache } from './lib/cache.js';
import { githubRoute } from './routes/github.js';

const app = new Hono();

app.route('/api/github', githubRoute);

// Astro のビルド成果物 (dist/) をそのまま配信する。
app.use('*', serveStatic({ root: env.staticDir }));
app.use('*', serveStatic({ root: env.staticDir, path: '404.html' }));

serve({ fetch: app.fetch, port: env.port }, (info) => {
	console.log(`marron-portfolio-server listening on http://localhost:${info.port}`);
});

// 起動時にキャッシュを温めておき、以後は定期的に裏で更新し続ける。
void warmCache(env.defaultUser);
scheduleRefresh(env.defaultUser, env.refreshIntervalMs);

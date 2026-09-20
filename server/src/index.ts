import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env } from './lib/env.js';
import { scheduleRefresh, warmCache } from './lib/cache.js';
import { getBlogPosts } from './lib/blog.js';
import { getMergedContributions, getWorks } from './lib/githubWorks.js';
import { blogRoute } from './routes/blog.js';
import { counterRoute } from './routes/counter.js';
import { faviconRoute } from './routes/favicon.js';
import { githubRoute } from './routes/github.js';
import { contributionsRoute, worksRoute } from './routes/works.js';

const app = new Hono();

// ブラウザから都度取得されるデータ系のAPIは、短時間だけブラウザ側でもキャッシュさせる。
// (カウンターは毎回サーバーに届く必要があるので対象外)
for (const dataPath of ['/api/github/*', '/api/works/*', '/api/contributions/*', '/api/blog']) {
	app.use(dataPath, async (c, next) => {
		await next();
		if (c.res.ok) c.header('Cache-Control', 'public, max-age=60');
	});
}

// 全グリフ入りのフォントは、このサイト自身のページから読み込まれたときだけ返す。
// ブラウザは @font-face の取得時に Sec-Fetch-Site / Sec-Fetch-Dest を付与する。
// URL直打ち・他サイトからの直リンク・ヘッダーなしのツール(curl等)は 403 にする。
// ヘッダーを偽装すれば取得できてしまうため完全な防止ではなく、手間を増やすための措置。
app.use('/fonts/AkazukinPOP-full.woff2', async (c, next) => {
	const site = c.req.header('sec-fetch-site');
	const dest = c.req.header('sec-fetch-dest');
	if (site !== 'same-origin' || dest !== 'font') return c.text('Forbidden', 403);

	await next();
	c.header('Cache-Control', 'private, max-age=86400');
	c.header('X-Robots-Tag', 'noindex');
});

app.route('/api/github', githubRoute);
app.route('/api/blog', blogRoute);
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
// 最初の訪問者が待たされないよう、works/contributions/blog も起動時に温めておく。
for (const warm of [
	() => getWorks(env.defaultUser),
	() => getMergedContributions(env.defaultUser),
	() => getBlogPosts(15),
]) {
	warm().catch((error) => console.error('[cache] 起動時のウォームアップに失敗:', error));
}
scheduleRefresh(env.defaultUser, env.refreshIntervalMs);

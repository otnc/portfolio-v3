import { lookup } from 'node:dns/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { ofetch } from 'ofetch';

// favicon取得先のサイトに人間のブラウザとして振る舞う。UAで弾く/出し分けるサイトがあるため。
const BROWSER_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../cache/favicon');
const FAVICON_TTL_MS = 7 * 24 * 60 * 60 * 1000; // faviconは滅多に変わらないので長め。

export interface FaviconResult {
	contentType: string;
	body: Buffer;
}

function cacheFilePath(pageUrl: string): string {
	return path.join(CACHE_DIR, `${encodeURIComponent(pageUrl)}.json`);
}

function isPrivateIp(address: string): boolean {
	const version = isIP(address);
	if (version === 4) {
		const [a, b] = address.split('.').map(Number);
		return (
			a === 127 ||
			a === 10 ||
			a === 0 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		);
	}
	if (version === 6) {
		const lower = address.toLowerCase();
		return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
	}
	return false;
}

// 任意のURLを受け取ってサーバー側から取得しに行くエンドポイントなので、
// http/https以外や、社内/ローカルネットワークへ向くURL(SSRF)を弾く。
async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
	const url = new URL(rawUrl);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`許可されていないプロトコル: ${url.protocol}`);
	}

	const hostname = url.hostname;
	if (hostname === 'localhost' || isPrivateIp(hostname)) {
		throw new Error('ローカル/内部アドレスへのアクセスは許可されていません');
	}

	const records = await lookup(hostname, { all: true });
	if (records.some((record) => isPrivateIp(record.address))) {
		throw new Error('内部アドレスに解決されるホストへのアクセスは許可されていません');
	}

	return url;
}

async function resolveFaviconUrl(pageUrl: string): Promise<string> {
	try {
		const html = await ofetch(pageUrl, {
			responseType: 'text',
			headers: { 'User-Agent': BROWSER_USER_AGENT },
		});
		const $ = cheerio.load(html);
		const href = $('link[rel~="icon"]').first().attr('href');
		if (href) return new URL(href, pageUrl).toString();
	} catch {
		// HTML取得/解析に失敗したら /favicon.ico にフォールバック。
	}
	return new URL('/favicon.ico', pageUrl).toString();
}

async function downloadFavicon(pageUrl: string): Promise<FaviconResult> {
	const faviconUrl = await resolveFaviconUrl(pageUrl);
	// ページのHTML(=対象サイトが自由に書ける内容)から抽出したURLなので、こちらも改めて検証する。
	await assertSafePublicUrl(faviconUrl);
	const response = await ofetch.raw(faviconUrl, {
		responseType: 'arrayBuffer',
		headers: { 'User-Agent': BROWSER_USER_AGENT },
	});

	const contentType = response.headers.get('content-type') ?? 'image/x-icon';
	if (!contentType.startsWith('image/')) {
		throw new Error(`favicon ではないレスポンス: ${contentType}`);
	}

	return { contentType, body: Buffer.from(response._data as ArrayBuffer) };
}

// 対象サイトのURLをそのまま外部リンクとして貼らず、必ずこのサーバー経由で取得・配信することで、
// クライアントが任意の外部ホストへ直接リクエストを飛ばさずに済むようにする。
export async function getFavicon(pageUrl: string): Promise<FaviconResult> {
	await assertSafePublicUrl(pageUrl);
	const file = cacheFilePath(pageUrl);

	try {
		const raw = await readFile(file, 'utf-8');
		const cached: { cachedAt: number; contentType: string; base64: string } = JSON.parse(raw);
		if (Date.now() - cached.cachedAt < FAVICON_TTL_MS) {
			return { contentType: cached.contentType, body: Buffer.from(cached.base64, 'base64') };
		}
	} catch {
		// キャッシュが無い/壊れている場合はそのまま取得へ進む。
	}

	const result = await downloadFavicon(pageUrl);
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(
		file,
		JSON.stringify({
			cachedAt: Date.now(),
			contentType: result.contentType,
			base64: result.body.toString('base64'),
		}),
		'utf-8',
	);
	return result;
}

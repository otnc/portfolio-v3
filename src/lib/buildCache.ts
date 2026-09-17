import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// astro build 時の GitHub 系フェッチ結果をディスクに置いておくキャッシュ。
// レート制限を避けるため、ビルドを何度も走らせても TTL 内は同じ結果を使い回す。
// import.meta.url はビルド時のバンドル先(dist/ 配下)を指してしまうため使わず、
// astro build を実行しているプロジェクトルート (cwd) を基準にする。
const CACHE_DIR = path.join(process.cwd(), '.cache');
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 半日。最大でも24時間は超えない。

function cacheFilePath(key: string): string {
	return path.join(CACHE_DIR, `${key}.json`);
}

export async function getOrFetch<T>(
	key: string,
	fetcher: () => Promise<T>,
	ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
	const filePath = cacheFilePath(key);

	try {
		const raw = await readFile(filePath, 'utf-8');
		const cached: { cachedAt: number; data: T } = JSON.parse(raw);
		if (Date.now() - cached.cachedAt < ttlMs) {
			return cached.data;
		}
	} catch {
		// キャッシュが無い/壊れている場合はそのまま取得へ進む。
	}

	const data = await fetcher();
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(filePath, JSON.stringify({ cachedAt: Date.now(), data }), 'utf-8');
	return data;
}

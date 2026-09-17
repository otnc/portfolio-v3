import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// works/contributions/favicon など、activity(cache.ts)ほど頻繁に叩かれない
// エンドポイント向けの汎用ファイルキャッシュ。namespaceごとにディレクトリを分ける。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = path.join(__dirname, '../../cache');

const inFlight = new Map<string, Promise<unknown>>();

function filePath(namespace: string, key: string): string {
	return path.join(CACHE_ROOT, namespace, `${encodeURIComponent(key)}.json`);
}

export async function cached<T>(
	namespace: string,
	key: string,
	ttlMs: number,
	fetcher: () => Promise<T>,
): Promise<T> {
	const file = filePath(namespace, key);

	try {
		const raw = await readFile(file, 'utf-8');
		const parsed: { cachedAt: number; data: T } = JSON.parse(raw);
		if (Date.now() - parsed.cachedAt < ttlMs) {
			return parsed.data;
		}
	} catch {
		// キャッシュが無い/壊れている場合はそのまま取得へ進む。
	}

	const inFlightKey = `${namespace}:${key}`;
	const existing = inFlight.get(inFlightKey) as Promise<T> | undefined;
	if (existing) return existing;

	const task = (async () => {
		try {
			const data = await fetcher();
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, JSON.stringify({ cachedAt: Date.now(), data }), 'utf-8');
			return data;
		} finally {
			inFlight.delete(inFlightKey);
		}
	})();

	inFlight.set(inFlightKey, task);
	return task;
}

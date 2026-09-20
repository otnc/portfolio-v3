import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// works/contributions/blog など、activity(cache.ts)以外のエンドポイント向けの汎用キャッシュ。
// namespaceごとにディレクトリを分ける。
//
// stale-while-revalidate: TTLが切れていても古い値を即座に返し、裏で再取得する。
// ブラウザ(クライアント側描画)から呼ばれても待たされないようにするため。
// 再取得に失敗した場合は古い値を返し続ける(stale-if-error)。fetcherは失敗時に
// 空配列などを返さず throw すること(空の結果で古い値を上書きしないため)。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = path.join(__dirname, '../../cache');

interface Entry<T> {
	cachedAt: number;
	data: T;
}

const memory = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function filePath(namespace: string, key: string): string {
	return path.join(CACHE_ROOT, namespace, `${encodeURIComponent(key)}.json`);
}

async function readEntry<T>(id: string, file: string): Promise<Entry<T> | null> {
	const inMemory = memory.get(id);
	if (inMemory) return inMemory as Entry<T>;

	try {
		const entry: Entry<T> = JSON.parse(await readFile(file, 'utf-8'));
		memory.set(id, entry);
		return entry;
	} catch {
		return null;
	}
}

function refresh<T>(id: string, file: string, fetcher: () => Promise<T>): Promise<T> {
	const existing = inFlight.get(id) as Promise<T> | undefined;
	if (existing) return existing;

	const task = (async () => {
		try {
			const entry: Entry<T> = { cachedAt: Date.now(), data: await fetcher() };
			memory.set(id, entry);
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, JSON.stringify(entry), 'utf-8');
			return entry.data;
		} finally {
			inFlight.delete(id);
		}
	})();

	inFlight.set(id, task);
	return task;
}

export async function cached<T>(
	namespace: string,
	key: string,
	ttlMs: number,
	fetcher: () => Promise<T>,
): Promise<T> {
	const id = `${namespace}:${key}`;
	const file = filePath(namespace, key);
	const entry = await readEntry<T>(id, file);

	if (!entry) return refresh(id, file, fetcher);

	if (Date.now() - entry.cachedAt >= ttlMs) {
		refresh(id, file, fetcher).catch((error) => {
			console.error(`[cache] ${id} のバックグラウンド再取得に失敗:`, error);
		});
	}
	return entry.data;
}

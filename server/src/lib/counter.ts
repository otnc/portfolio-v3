import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// cache/ とは違い、これは再取得できない永続データなので独立したディレクトリに置く
// (cache/ はいつ消してもよい前提で運用しているため混ぜない)。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const COUNTER_FILE = path.join(DATA_DIR, 'counter.json');

let count: number | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<number> {
	if (count !== null) return count;
	try {
		const raw = await readFile(COUNTER_FILE, 'utf-8');
		const parsed: { count?: unknown } = JSON.parse(raw);
		count = typeof parsed.count === 'number' ? parsed.count : 0;
	} catch {
		count = 0;
	}
	return count;
}

async function persist(): Promise<void> {
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(COUNTER_FILE, JSON.stringify({ count }), 'utf-8');
}

// 同時アクセスで書き込みが競合してカウントが飛ばないよう、直列化する。
export async function incrementCounter(): Promise<number> {
	await load();
	count = (count ?? 0) + 1;
	writeQueue = writeQueue.then(persist);
	await writeQueue;
	return count;
}

export async function getCounter(): Promise<number> {
	return load();
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { fetchAllTimeContributions, fetchProfileAndLanguages, fetchRecentActivity } from './githubGraphql.js';
import type { GithubActivityPayload } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../cache');

function cacheFilePath(user: string): string {
	return path.join(CACHE_DIR, `github-${user}.json`);
}

// user -> 最新の集計結果。バックグラウンド更新中もこの参照から
// 常に(多少古くても)即答できるようにする。
const memoryCache = new Map<string, GithubActivityPayload>();
const inFlight = new Map<string, Promise<GithubActivityPayload>>();

async function computeActivity(user: string): Promise<GithubActivityPayload> {
	const { profile, languages, createdAt } = await fetchProfileAndLanguages(user);
	const [totalContributions, commitActivity] = await Promise.all([
		fetchAllTimeContributions(user, createdAt),
		fetchRecentActivity(user, 30),
	]);

	const payload: GithubActivityPayload = {
		profile: {
			...profile,
			total_contributions: totalContributions,
			fetched_at: new Date().toISOString(),
		},
		languages,
		commit_activity: commitActivity,
		meta: {
			cached: false,
			cached_at: new Date().toISOString(),
			ttl_seconds: env.cacheTtlSeconds,
		},
	};

	return payload;
}

async function persist(user: string, payload: GithubActivityPayload): Promise<void> {
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cacheFilePath(user), JSON.stringify(payload, null, 2), 'utf-8');
}

async function loadFromDisk(user: string): Promise<GithubActivityPayload | null> {
	try {
		const raw = await readFile(cacheFilePath(user), 'utf-8');
		return JSON.parse(raw) as GithubActivityPayload;
	} catch {
		return null;
	}
}

function isStale(payload: GithubActivityPayload): boolean {
	const age = Date.now() - new Date(payload.meta.cached_at).getTime();
	return age > payload.meta.ttl_seconds * 1000;
}

// キャッシュを実際に再計算する。同時に複数リクエストが来ても
// 二重に GitHub へ問い合わせないよう in-flight Promise を共有する。
async function refresh(user: string): Promise<GithubActivityPayload> {
	const existing = inFlight.get(user);
	if (existing) return existing;

	const task = (async () => {
		try {
			const payload = await computeActivity(user);
			memoryCache.set(user, payload);
			await persist(user, payload);
			return payload;
		} finally {
			inFlight.delete(user);
		}
	})();

	inFlight.set(user, task);
	return task;
}

// リクエストからは常にキャッシュを即座に返す。
// 無ければ初回のみ待つ。古くなっていたら裏で再取得しつつ、
// 取得済みの(少し古い)値をそのまま返す(stale-while-revalidate)。
// 再取得に失敗しても、既存のキャッシュがあればそれを返し続ける(stale-if-error)。
export async function getGithubActivity(user: string): Promise<GithubActivityPayload> {
	let payload = memoryCache.get(user) ?? (await loadFromDisk(user)) ?? undefined;

	if (payload) {
		memoryCache.set(user, payload);
		if (isStale(payload)) {
			refresh(user).catch((error) => {
				console.error(`[cache] ${user} のバックグラウンド再取得に失敗:`, error);
			});
		}
		return { ...payload, meta: { ...payload.meta, cached: true } };
	}

	// キャッシュが一切無い(初回起動直後など)場合のみ、取得完了を待つ。
	payload = await refresh(user);
	return payload;
}

export async function warmCache(user: string): Promise<void> {
	try {
		await refresh(user);
		console.log(`[cache] ${user} のキャッシュを更新しました`);
	} catch (error) {
		console.error(`[cache] ${user} の初回取得に失敗しました:`, error);
	}
}

export function scheduleRefresh(user: string, intervalMs: number): void {
	setInterval(() => {
		refresh(user).catch((error) => {
			console.error(`[cache] ${user} の定期再取得に失敗:`, error);
		});
	}, intervalMs);
}

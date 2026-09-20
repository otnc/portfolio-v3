import { ofetch } from 'ofetch';

// ビルド時(Node)は server/ を直接、ブラウザでは同一オリジンの /api を叩く。
// ポートは .env の PORT と一致させること。
const ORIGIN = import.meta.env.SSR ? 'http://127.0.0.1:3010' : '';

export const api = ofetch.create({ baseURL: `${ORIGIN}/api` });

// ビルド時に取得へ失敗しても、ページ全体のビルドは止めず初期表示を空にしておく
// (ブラウザ側で再取得する)。
export function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
	return promise.catch(() => fallback);
}

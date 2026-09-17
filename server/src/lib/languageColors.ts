import { ofetch } from 'ofetch';

// GitHub Linguist の色一覧(有志によるJSONミラー)。GraphQL の repository.languages が
// 色そのものも返すので基本的にはそちらを優先し、これは取れなかった時の保険として使う。
const COLORS_URL = 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json';
const COLORS_TTL_MS = 24 * 60 * 60 * 1000;

const FALLBACK_COLOR = '#8b8b8b';

interface RawColorEntry {
	color?: string | null;
}

let cache: { fetchedAt: number; colors: Record<string, string> } | null = null;

async function loadColorMap(): Promise<Record<string, string>> {
	if (cache && Date.now() - cache.fetchedAt < COLORS_TTL_MS) {
		return cache.colors;
	}

	try {
		// raw.githubusercontent.com は Content-Type: text/plain で返すため、ofetchの
		// 自動判定に任せず明示的にJSONとしてパースする(大きめのファイルだと自動判定に失敗し、
		// 生の文字列のまま返ってきてしまうことがある)。
		const raw = await ofetch<Record<string, RawColorEntry>>(COLORS_URL, {
			parseResponse: JSON.parse,
		});
		const colors: Record<string, string> = {};
		for (const [name, entry] of Object.entries(raw)) {
			if (typeof entry.color === 'string') colors[name] = entry.color;
		}
		cache = { fetchedAt: Date.now(), colors };
		return colors;
	} catch {
		return cache?.colors ?? {};
	}
}

export async function getLanguageColor(name: string): Promise<string> {
	const colors = await loadColorMap();
	return colors[name] ?? FALLBACK_COLOR;
}

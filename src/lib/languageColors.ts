import { ofetch } from 'ofetch';
import { getOrFetch } from './buildCache';

// GitHub Linguist 準拠の色一覧(有志によるJSONミラー)。丸ごと取得してキャッシュする。
const COLORS_URL = 'https://raw.githubusercontent.com/ozh/github-colors/master/colors.json';
const COLORS_TTL_MS = 24 * 60 * 60 * 1000;

const FALLBACK_COLOR = '#8b8b8b';

// 取得自体に失敗した時だけ使う最低限のフォールバック。
const FALLBACK_COLORS: Record<string, string> = {
	TypeScript: '#3178c6',
	JavaScript: '#f1e05a',
	HTML: '#e34c26',
	CSS: '#663399',
	Python: '#3572A5',
};

interface RawColorEntry {
	color?: string | null;
}

async function fetchColorMap(): Promise<Record<string, string>> {
	try {
		const raw = await getOrFetch(
			'language-colors',
			() => ofetch<Record<string, RawColorEntry>>(COLORS_URL),
			COLORS_TTL_MS,
		);

		const colors: Record<string, string> = {};
		for (const [name, entry] of Object.entries(raw)) {
			if (typeof entry.color === 'string') colors[name] = entry.color;
		}
		return colors;
	} catch {
		return FALLBACK_COLORS;
	}
}

let colorMapPromise: Promise<Record<string, string>> | null = null;

function loadColorMap(): Promise<Record<string, string>> {
	colorMapPromise ??= fetchColorMap();
	return colorMapPromise;
}

export async function getLanguageColor(name: string): Promise<string> {
	const colors = await loadColorMap();
	return colors[name] ?? FALLBACK_COLOR;
}

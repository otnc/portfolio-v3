// GitHub Linguist の色を一部抜粋(なければ中間グレーにフォールバック)。
// フロントエンド側 (src/lib/languageColors.ts) と同じ考え方だが、GraphQL の repository.languages が色そのものも返すので、基本的にはそちらを優先し、これは取れなかった時の保険として使う。
const LANGUAGE_COLORS: Record<string, string> = {
	TypeScript: '#3178c6',
	JavaScript: '#f1e05a',
	Svelte: '#ff3e00',
	Astro: '#ff5a03',
	CSS: '#663399',
	MoonBit: '#b92381',
	MDX: '#fcb32c',
	HTML: '#e34c26',
	Vue: '#41b883',
	CoffeeScript: '#244776',
	Java: '#b07219',
	Shell: '#89e051',
	'C++': '#f34b7d',
	Go: '#00ADD8',
	PowerShell: '#012456',
	Pug: '#a86454',
	Lua: '#000080',
	'C#': '#178600',
	'Vim Script': '#199f4b',
	LiveScript: '#499886',
	Python: '#3572A5',
	Ruby: '#701516',
	Makefile: '#427819',
	Batchfile: '#C1F12E',
	Dockerfile: '#384d54',
	Rust: '#dea584',
	PHP: '#4F5D95',
	C: '#555555',
	Kotlin: '#A97BFF',
	Swift: '#F05138',
};

const FALLBACK_COLOR = '#8b8b8b';

export function getLanguageColor(name: string): string {
	return LANGUAGE_COLORS[name] ?? FALLBACK_COLOR;
}

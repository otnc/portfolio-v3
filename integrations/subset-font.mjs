// フォントを配信用に加工する Astro integration。
// ブラウザ側で動的に差し込まれる文字(Blogの記事タイトルなど)にも対応するため、
// 「使用文字だけのsubset」と「全グリフ入りのfull」の2つを生成する。
// CSS側ではfullを先に、subsetを unicode-range 付きで後に宣言しており、ビルド時点で使っている文字は
// 軽量なsubsetから、それ以外の文字が現れたときだけfullが読み込まれる。
// fullはサーバー側で参照元チェックをかけて配信する(server/src/index.ts)。
//
// - dev サーバー起動時 (astro:server:setup):
//     元フォントをそのまま /fonts/<name>.otf として配信する。 (開発中はどんな文字を打っても表示できるようにするため)
// - ビルド完了後 (astro:build:done):
//     出力された html を走査して使用文字を集計し、その文字だけを含む woff2 サブセットを生成して出力ディレクトリに書き出す。
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import subsetFont from 'subset-font';

// フォント自体には含まれていなくても、CSS の都合上常に含めておきたい最低限の文字(半角スペース・記号など)。
const BASE_CHARS =
	' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

async function walkHtmlFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkHtmlFiles(fullPath)));
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			files.push(fullPath);
		}
	}
	return files;
}

function allBmpChars() {
	let text = '';
	for (let code = 0x20; code <= 0xffff; code += 1) {
		if (code >= 0xd800 && code <= 0xdfff) continue;
		text += String.fromCodePoint(code);
	}
	return text;
}

// 使用文字を unicode-range 形式 (連続する範囲はまとめる) にする。
function toUnicodeRange(chars) {
	const codes = [...chars].map((ch) => ch.codePointAt(0)).sort((a, b) => a - b);
	const parts = [];
	for (let i = 0; i < codes.length;) {
		let j = i;
		while (j + 1 < codes.length && codes[j + 1] === codes[j] + 1) j += 1;
		const hex = (n) => n.toString(16).toUpperCase();
		parts.push(i === j ? `U+${hex(codes[i])}` : `U+${hex(codes[i])}-${hex(codes[j])}`);
		i = j + 1;
	}
	return parts.join(',');
}

// fonts.css のプレースホルダー (U+E000) を、実際にsubsetへ含めた文字の範囲に差し替える。
async function writeUnicodeRange(outDir, chars, logger) {
	const range = toUnicodeRange(chars);
	const cssDir = path.join(outDir, '_astro');
	let replaced = 0;
	for (const name of await readdir(cssDir).catch(() => [])) {
		if (!name.endsWith('.css')) continue;
		const file = path.join(cssDir, name);
		const css = await readFile(file, 'utf-8');
		const next = css.replace(/unicode-range:\s*U\+E000/gi, () => `unicode-range:${range}`);
		if (next !== css) {
			await writeFile(file, next);
			replaced += 1;
		}
	}
	if (replaced === 0) logger.warn('unicode-range のプレースホルダーが見つかりませんでした。');
}

function extractText(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

/**
 * @param {object} options
 * @param {URL} options.sourceFont 元フォント(未加工)の場所
 * @param {string} [options.fullPublicPath] 全グリフ入りフォントの配信パス
 * @param {string} [options.publicPath] 本番用サブセットの配信パス
 * @param {string} [options.devPublicPath] 開発中に元フォントを配信するパス
 */
export default function subsetFontIntegration({
	sourceFont,
	publicPath = '/fonts/AkazukinPOP-subset.woff2',
	devPublicPath = '/fonts/AkazukinPOP.otf',
	fullPublicPath = '/fonts/AkazukinPOP-full.woff2',
} = {}) {
	if (!sourceFont) {
		throw new Error('subsetFontIntegration: `sourceFont` is required');
	}

	const sourcePath = fileURLToPath(sourceFont);

	return {
		name: 'subset-font',
		hooks: {
			'astro:server:setup': ({ server, logger }) => {
				server.middlewares.use(async (req, res, next) => {
					if (req.url !== devPublicPath) {
						return next();
					}
					try {
						const buffer = await readFile(sourcePath);
						res.setHeader('Content-Type', 'font/otf');
						res.end(buffer);
					} catch (error) {
						logger.error(`dev font の読み込みに失敗しました: ${error}`);
						next(error);
					}
				});
			},
			'astro:build:done': async ({ dir, logger }) => {
				const outDir = fileURLToPath(dir);
				const htmlFiles = await walkHtmlFiles(outDir);

				const chars = new Set(BASE_CHARS);
				for (const file of htmlFiles) {
					const html = await readFile(file, 'utf-8');
					for (const ch of extractText(html)) {
						chars.add(ch);
					}
				}

				const sourceBuffer = await readFile(sourcePath);
				const subsetBuffer = await subsetFont(sourceBuffer, [...chars].join(''), {
					targetFormat: 'woff2',
				});

				await writeUnicodeRange(outDir, chars, logger);
				const fullBuffer = await subsetFont(sourceBuffer, allBmpChars(), { targetFormat: 'woff2' });
				const fullFile = path.join(outDir, fullPublicPath.replace(/^\//, ''));
				await mkdir(path.dirname(fullFile), { recursive: true });
				await writeFile(fullFile, fullBuffer);
				logger.info(`full: ${(fullBuffer.length / 1024).toFixed(0)} KB を生成しました。`);

				const outputFile = path.join(outDir, publicPath.replace(/^\//, ''));
				await mkdir(path.dirname(outputFile), { recursive: true });
				await writeFile(outputFile, subsetBuffer);

				logger.info(
					`${chars.size} 文字に絞り込み、${(subsetBuffer.length / 1024).toFixed(1)} KB のサブセットを生成しました。`,
				);
			},
		},
	};
}

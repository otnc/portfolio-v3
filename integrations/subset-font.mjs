// 使用フォントを実際に使われている文字だけに絞り込む Astro integration。
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
 * @param {string} [options.publicPath] 本番用サブセットの配信パス
 * @param {string} [options.devPublicPath] 開発中に元フォントを配信するパス
 */
export default function subsetFontIntegration({
	sourceFont,
	publicPath = '/fonts/AkazukinPOP-subset.woff2',
	devPublicPath = '/fonts/AkazukinPOP.otf',
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

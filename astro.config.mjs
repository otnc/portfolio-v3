// @ts-check
import { defineConfig } from 'astro/config';
import subsetFont from './integrations/subset-font.mjs';

// https://astro.build/config
export default defineConfig({
	integrations: [
		subsetFont({
			sourceFont: new URL('./src/fonts/AkazukinPOP.otf', import.meta.url),
		}),
	],
	vite: {
		server: {
			// dev時、ブラウザからの相対パス /api/* を server/ (Hono) へ転送する。
			// 本番ではnginx/Anubis経由で同一オリジンから配信されるため不要。
			proxy: {
				'/api': 'http://127.0.0.1:3010',
			},
		},
	},
});

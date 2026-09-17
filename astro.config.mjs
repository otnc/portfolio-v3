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
});

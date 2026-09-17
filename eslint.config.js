// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'.astro/**',
			'.cache/**',
			'node_modules/**',
			'server/dist/**',
			'server/cache/**',
			'server/node_modules/**',
			'public/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...astro.configs['flat/recommended'],
	eslintConfigPrettier,
	{
		// Node上で動く設定ファイル/server側はNodeのグローバル(URL, process等)を許可する。
		files: ['*.config.mjs', 'integrations/**/*.mjs', 'server/**/*.ts'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		rules: {
			// 未使用引数は _ prefix で明示すれば許可する(コールバックの第一引数を捨てる場合など)。
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		},
	},
);

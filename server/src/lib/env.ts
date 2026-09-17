function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`環境変数 ${name} が設定されていません(.env を確認してください)`);
	}
	return value;
}

export const env = {
	githubToken: required('GITHUB_TOKEN'),
	defaultUser: process.env.GITHUB_DEFAULT_USER ?? 'otnc',
	port: Number(process.env.PORT ?? 3000),
	staticDir: process.env.STATIC_DIR ?? '../dist',
	cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 43200),
	refreshIntervalMs: Number(process.env.REFRESH_INTERVAL_MS ?? 43200000),
};

import UserAgent from 'user-agents';

// 外部サイトのHTMLをUAで弾く/出し分けられないよう、実在のデスクトップChrome系UAを1つ選んで使い回す。
// プロセス起動中は固定(リクエストごとに変えない)。
const userAgent = new UserAgent({ deviceCategory: 'desktop' });

export function getBrowserUserAgent(): string {
	return userAgent.toString();
}

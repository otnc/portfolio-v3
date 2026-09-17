import { Hono } from 'hono';
import { getCounter, incrementCounter } from '../lib/counter.js';

export const counterRoute = new Hono();

// クライアント側のJSからのみ呼ばれる想定(bot/クローラーはJSを実行しないため
// カウントされない)。GETは現在値の参照のみで増やさない。
counterRoute.get('/', async (c) => {
	const count = await getCounter();
	return c.json({ count });
});

counterRoute.post('/', async (c) => {
	const count = await incrementCounter();
	return c.json({ count });
});

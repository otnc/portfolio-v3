import { useEffect, useState } from 'preact/hooks';

// ビルド時に焼き込んだ値(initial)をまず表示し、マウント後にブラウザから最新値を取得して差し替える。
// 取得に失敗した場合は initial のままにする。
export function useFresh<T>(initial: T, load: () => Promise<T>): T {
	const [data, setData] = useState(initial);

	useEffect(() => {
		let active = true;
		load()
			.then((fresh) => {
				if (active) setData(fresh);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	return data;
}

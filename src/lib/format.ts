// Star数などの桁数が大きくなりうる数値を "10,000" のように3桁区切りで表示する。
export function formatNumber(value: number): string {
	return value.toLocaleString('en-US');
}

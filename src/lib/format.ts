// Star数などの桁数が大きくなりうる数値を "10,000" のように3桁区切りで表示する。
export function formatNumber(value: number): string {
	return value.toLocaleString('en-US');
}

// GitHub のUI(スター数など)に合わせて "1.2k" "3.4M" のように短縮表示する。
// 1000未満はそのまま、1000以上は小数第1位まで(末尾の ".0" は省略)。
export function formatCompactNumber(value: number): string {
	if (value < 1000) return formatNumber(value);

	const units: [number, string][] = [
		[1_000_000_000, 'b'],
		[1_000_000, 'M'],
		[1_000, 'k'],
	];
	const [divisor, suffix] = units.find(([unit]) => value >= unit) ?? [1, ''];
	const rounded = Math.floor((value / divisor) * 10) / 10;
	return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

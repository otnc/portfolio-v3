interface Props {
	text: string;
	class?: string;
}

// "owner/repo" のように長くなりがちな名前を、"..." で切り詰める代わりに
// "/" の直後にだけ改行できる <wbr> を挟む。owner名やrepo名自体の途中では折り返さない。
export default function RepoName({ text, class: className }: Props) {
	const slashIndex = text.indexOf('/');
	if (slashIndex === -1) return <span class={className}>{text}</span>;

	return (
		<span class={className}>
			{text.slice(0, slashIndex + 1)}
			<wbr />
			{text.slice(slashIndex + 1)}
		</span>
	);
}

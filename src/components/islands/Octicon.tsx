import gitMerge from '@primer/octicons/build/svg/git-merge-16.svg?raw';
import pin from '@primer/octicons/build/svg/pin-16.svg?raw';
import people from '@primer/octicons/build/svg/people-16.svg?raw';
import repo from '@primer/octicons/build/svg/repo-16.svg?raw';
import starFill from '@primer/octicons/build/svg/star-fill-16.svg?raw';

const OCTICONS = {
	'git-merge': gitMerge,
	pin,
	people,
	repo,
	'star-fill': starFill,
} as const;

export type OcticonName = keyof typeof OCTICONS;

interface Props {
	name: OcticonName;
	size?: number;
	class?: string;
}

export default function Octicon({ name, size = 14, class: className }: Props) {
	return (
		<span
			class={className}
			aria-hidden="true"
			style={{ display: 'inline-flex', width: `${size}px`, height: `${size}px`, fill: 'currentColor' }}
			dangerouslySetInnerHTML={{
				__html: OCTICONS[name].replace(/ width="16" height="16"/, ' width="100%" height="100%"'),
			}}
		/>
	);
}

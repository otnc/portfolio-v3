import * as simpleIcons from 'simple-icons';

const SERVICE_ICON_KEYS: Record<string, keyof typeof simpleIcons> = {
	github: 'siGithub',
	twitter: 'siX',
	wakatime: 'siWakatime',
	discord: 'siDiscord',
	misskey: 'siMisskey',
	instagram: 'siInstagram',
	soundcloud: 'siSoundcloud',
	spotify: 'siSpotify',
};

export interface ServiceIcon {
	svg: string;
	hex: string;
}

export function getServiceIcon(slug: string): ServiceIcon | undefined {
	const exportName = SERVICE_ICON_KEYS[slug];
	if (!exportName) return undefined;

	const icon = simpleIcons[exportName] as { svg: string; hex: string };
	return { svg: icon.svg, hex: icon.hex };
}

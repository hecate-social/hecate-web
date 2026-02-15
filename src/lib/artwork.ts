export interface HeroClip {
	src: string;
	caption: string;
}

export const heroClips: HeroClip[] = [
	{ src: '/artwork/holds-up-key.mp4', caption: 'She who holds the key' },
	{ src: '/artwork/aura-turns-head.mp4', caption: 'Guardian of the crossroads' },
	{ src: '/artwork/portal.mp4', caption: 'Through the portal' },
	{ src: '/artwork/mysterious-snakes.mp4', caption: 'Ancient mysteries' },
	{ src: '/artwork/guardian-hounds-serpent.mp4', caption: 'Guardians at the gate' },
	{ src: '/artwork/close-up.mp4', caption: 'Eyes of amber' },
	{ src: '/artwork/realm-yield-to-key.mp4', caption: 'The realm shall yield' },
	{ src: '/artwork/sensual.mp4', caption: 'Power and grace' },
	{ src: '/artwork/key-hounds.mp4', caption: 'Key and hounds' },
	{ src: '/artwork/snakes.mp4', caption: 'Serpent wisdom' },
	{ src: '/artwork/silent-mysterious.mp4', caption: 'Silent watcher' },
	{ src: '/artwork/sexy.mp4', caption: 'The goddess awakens' },
	{ src: '/artwork/guardians-rise.mp4', caption: 'Guardians rise' }
];

export type HeroMedia = { type: 'video'; src: string; caption: string }
	| { type: 'image'; src: string; caption: string };

/** Pick a random video clip */
export function randomClip(): HeroClip {
	return heroClips[Math.floor(Math.random() * heroClips.length)];
}

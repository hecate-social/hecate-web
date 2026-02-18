// Studio registry — core studios (hardcoded) + plugin studios (from discovery)
import { derived } from 'svelte/store';
import { plugins } from '$lib/stores/plugins';

export interface StudioTab {
	id: string;
	name: string;
	icon: string;
	path: string;
	isPlugin: boolean;
}

export interface StudioCard {
	id: string;
	name: string;
	icon: string;
	path: string;
	description: string;
	ready: boolean;
	isPlugin: boolean;
}

export const coreStudios: StudioTab[] = [
	{ id: 'llm', name: 'LLM', icon: '\u{1F916}', path: '/llm', isPlugin: false },
	{ id: 'node', name: 'Node', icon: '\u{1F310}', path: '/node', isPlugin: false },
	{ id: 'social', name: 'Social', icon: '\u{1F4AC}', path: '/social', isPlugin: false },
	{ id: 'devops', name: 'Martha', icon: '\u{2699}\u{FE0F}', path: '/devops', isPlugin: false },
	{ id: 'arcade', name: 'Arcade', icon: '\u{1F3AE}', path: '/arcade', isPlugin: false }
];

export const coreStudioCards: StudioCard[] = [
	{
		id: 'llm',
		name: 'LLM Studio',
		icon: '\u{1F916}',
		path: '/llm',
		description: 'Chat with AI models, streaming responses, provider management',
		ready: true,
		isPlugin: false
	},
	{
		id: 'node',
		name: 'Node Studio',
		icon: '\u{1F310}',
		path: '/node',
		description: 'Node inspector, mesh view, marketplace',
		ready: true,
		isPlugin: false
	},
	{
		id: 'social',
		name: 'Social Studio',
		icon: '\u{1F4AC}',
		path: '/social',
		description: 'IRC, forums, feeds, community',
		ready: true,
		isPlugin: false
	},
	{
		id: 'devops',
		name: 'Martha Studio',
		icon: '\u{2699}\u{FE0F}',
		path: '/devops',
		description: 'Venture initiation, division planning, deployment',
		ready: true,
		isPlugin: false
	},
	{
		id: 'arcade',
		name: 'Arcade Studio',
		icon: '\u{1F3AE}',
		path: '/arcade',
		description: 'Games and entertainment',
		ready: false,
		isPlugin: false
	}
];

// Reactive: core tabs + discovered plugin tabs
export const studioTabs = derived(plugins, ($plugins) => {
	const pluginTabs: StudioTab[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: capitalize(p.manifest.name),
		icon: p.manifest.icon,
		path: `/${p.manifest.name}`,
		isPlugin: true
	}));
	return [...coreStudios, ...pluginTabs];
});

// Reactive: core cards + discovered plugin cards
export const studioCards = derived(plugins, ($plugins) => {
	const pluginCards: StudioCard[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: `${capitalize(p.manifest.name)} Studio`,
		icon: p.manifest.icon,
		path: `/${p.manifest.name}`,
		description: p.manifest.description,
		ready: true,
		isPlugin: true
	}));
	return [...coreStudioCards, ...pluginCards];
});

// Reactive: all studio paths (for keyboard nav)
export const studioPaths = derived(studioTabs, ($tabs) => [
	'/',
	...$tabs.map((t) => t.path)
]);

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

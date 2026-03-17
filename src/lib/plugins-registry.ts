// Plugin registry — core pages (always present) + discovered third-party plugins
import { derived } from 'svelte/store';
import { apps } from '$lib/stores/apps';
import { resolveEmoji } from '$lib/emoji';

export interface PluginTab {
	id: string;
	name: string;
	icon: string;
	path: string;
	isPlugin: boolean;
}

export interface PluginCardData {
	id: string;
	name: string;
	icon: string;
	path: string;
	description: string;
	ready: boolean;
	isPlugin: boolean;
}

// Core pages — always available, use main daemon socket.
const CORE_TABS: PluginTab[] = [
	{ id: 'settings', name: 'Settings', icon: '\u2699', path: '/settings', isPlugin: false },
	{ id: 'llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', isPlugin: false },
	{ id: 'appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', isPlugin: false },
	{ id: 'observer', name: 'Observer', icon: '\uD83D\uDD2C', path: '/observer', isPlugin: false },
	{ id: 'mesh', name: 'Mesh', icon: '\uD83C\uDF10', path: '/mesh', isPlugin: false },
];

const CORE_CARDS: PluginCardData[] = [
	{ id: 'settings', name: 'Settings', icon: '\u2699', path: '/settings', description: 'Node identity, realms, and preferences', ready: true, isPlugin: false },
	{ id: 'llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', description: 'Chat with AI models across providers', ready: true, isPlugin: false },
	{ id: 'appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', description: 'Browse and install plugins', ready: true, isPlugin: false },
	{ id: 'observer', name: 'Observer', icon: '\uD83D\uDD2C', path: '/observer', description: 'BEAM debugger and diagnostics', ready: true, isPlugin: false },
	{ id: 'mesh', name: 'Mesh', icon: '\uD83C\uDF10', path: '/mesh', description: 'Mesh network status and discovery', ready: true, isPlugin: false },
];

const CORE_IDS = new Set(CORE_TABS.map((t) => t.id));

// Reactive: core tabs + installed plugin tabs
export const pluginTabs = derived(apps, ($apps) => {
	const discovered: PluginTab[] = Array.from($apps.values())
		.filter((a) => !CORE_IDS.has(a.info.name))
		.map((a) => ({
			id: a.info.name,
			name: a.manifest?.display_name || a.info.display_name || capitalize(a.info.name),
			icon: resolveEmoji(a.manifest?.icon ?? a.info.icon),
			path: `/plugin/${a.info.name}`,
			isPlugin: true
		}));
	return [...CORE_TABS, ...discovered];
});

// Reactive: core cards + installed plugin cards
export const pluginCards = derived(apps, ($apps) => {
	const discovered: PluginCardData[] = Array.from($apps.values())
		.filter((a) => !CORE_IDS.has(a.info.name))
		.map((a) => ({
			id: a.info.name,
			name: a.manifest?.display_name || a.info.display_name || capitalize(a.info.name),
			icon: resolveEmoji(a.manifest?.icon ?? a.info.icon),
			path: `/plugin/${a.info.name}`,
			description: a.manifest?.description ?? a.info.status_label,
			ready: a.online,
			isPlugin: true
		}));
	return [...CORE_CARDS, ...discovered];
});

// Reactive: all navigable paths (for keyboard nav)
export const pluginPaths = derived(pluginTabs, ($tabs) => [
	'/',
	...$tabs.map((t) => t.path)
]);

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

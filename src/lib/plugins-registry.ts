// Plugin registry — core pages (always present) + discovered third-party plugins
import { derived } from 'svelte/store';
import { plugins } from '$lib/stores/plugins';

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

// Core pages — always available, use main daemon socket
const CORE_TABS: PluginTab[] = [
	{ id: '__settings', name: 'Settings', icon: '\u2699', path: '/settings', isPlugin: false },
	{ id: '__llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', isPlugin: false },
	{ id: '__appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', isPlugin: false },
];

const CORE_CARDS: PluginCardData[] = [
	{ id: '__settings', name: 'Settings', icon: '\u2699', path: '/settings', description: 'Node identity, pairing, and preferences', ready: true, isPlugin: false },
	{ id: '__llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', description: 'Chat with AI models across providers', ready: true, isPlugin: false },
	{ id: '__appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', description: 'Browse and install plugins', ready: true, isPlugin: false },
];

// Reactive: core tabs + discovered plugin tabs
export const pluginTabs = derived(plugins, ($plugins) => {
	const discovered: PluginTab[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: capitalize(p.manifest.name),
		icon: p.manifest.icon,
		path: `/plugin/${p.manifest.name}`,
		isPlugin: true
	}));
	return [...CORE_TABS, ...discovered];
});

// Reactive: core cards + discovered plugin cards
export const pluginCards = derived(plugins, ($plugins) => {
	const discovered: PluginCardData[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: capitalize(p.manifest.name),
		icon: p.manifest.icon,
		path: `/plugin/${p.manifest.name}`,
		description: p.manifest.description,
		ready: true,
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

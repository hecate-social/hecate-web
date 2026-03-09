// Plugin registry — core pages (always present) + discovered third-party plugins
import { derived } from 'svelte/store';
import { apps } from '$lib/stores/apps';

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
];

const CORE_CARDS: PluginCardData[] = [
	{ id: 'settings', name: 'Settings', icon: '\u2699', path: '/settings', description: 'Node identity, realms, and preferences', ready: true, isPlugin: false },
	{ id: 'llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', description: 'Chat with AI models across providers', ready: true, isPlugin: false },
	{ id: 'appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', description: 'Browse and install plugins', ready: true, isPlugin: false },
];

const CORE_IDS = new Set(CORE_TABS.map((t) => t.id));

// Reactive: core tabs + installed plugin tabs
export const pluginTabs = derived(apps, ($apps) => {
	const discovered: PluginTab[] = Array.from($apps.values())
		.filter((a) => !CORE_IDS.has(a.info.name))
		.map((a) => ({
			id: a.info.name,
			name: capitalize(a.info.name),
			icon: a.manifest?.icon ?? a.info.icon ?? '\uD83D\uDD0C',
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
			name: capitalize(a.info.name),
			icon: a.manifest?.icon ?? a.info.icon ?? '\uD83D\uDD0C',
			path: `/plugin/${a.info.name}`,
			description: a.manifest?.description ?? statusDescription(a.info.status_label),
			ready: a.online,
			isPlugin: true
		}));
	return [...CORE_CARDS, ...discovered];
});

function statusDescription(statusLabel: string): string {
	switch (statusLabel) {
		case 'Running': return 'Running';
		case 'Starting': return 'Starting up...';
		case 'Downloading': return 'Downloading image...';
		case 'Installed':
		case 'Ready': return 'Installed — click Start in Appstore';
		case 'Stopping': return 'Stopping...';
		case 'Stopped': return 'Stopped — click Start in Appstore';
		default: return statusLabel || 'Installed';
	}
}

// Reactive: all navigable paths (for keyboard nav)
export const pluginPaths = derived(pluginTabs, ($tabs) => [
	'/',
	...$tabs.map((t) => t.path)
]);

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

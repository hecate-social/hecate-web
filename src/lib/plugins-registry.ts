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
	group?: string;
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
	{ id: 'briefcase', name: 'Briefcase', icon: '\uD83D\uDCBC', path: '/briefcase', isPlugin: false },
	{ id: 'llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', isPlugin: false },
	{ id: 'mesh', name: 'Mesh', icon: '\uD83C\uDF10', path: '/mesh', isPlugin: false },
	{ id: 'appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', isPlugin: false },
	{ id: 'site', name: 'Site', icon: '\uD83C\uDFE0', path: '/site', isPlugin: false },
	{ id: 'settings', name: 'Settings', icon: '\u2699', path: '/settings', isPlugin: false },
	// Observer views — each a direct-jump entry grouped under "Observer"
	{ id: 'obs-system', name: 'System', icon: '\uD83D\uDCCA', path: '/observer', isPlugin: false, group: 'Observer' },
	{ id: 'obs-processes', name: 'Processes', icon: '\u2699', path: '/observer/processes', isPlugin: false, group: 'Observer' },
	{ id: 'obs-ets', name: 'ETS Tables', icon: '\uD83D\uDCE6', path: '/observer/ets', isPlugin: false, group: 'Observer' },
	{ id: 'obs-supervision', name: 'Supervision', icon: '\uD83C\uDF33', path: '/observer/supervision', isPlugin: false, group: 'Observer' },
	{ id: 'obs-plugins', name: 'Plugins', icon: '\uD83D\uDD0C', path: '/observer/plugins', isPlugin: false, group: 'Observer' },
	{ id: 'obs-stores', name: 'Event Stores', icon: '\uD83D\uDCC1', path: '/observer/stores', isPlugin: false, group: 'Observer' },
	{ id: 'obs-pg', name: 'PG Groups', icon: '\uD83D\uDD17', path: '/observer/subscriptions', isPlugin: false, group: 'Observer' },
];

const CORE_CARDS: PluginCardData[] = [
	{ id: 'site', name: 'Site', icon: '\uD83C\uDFE0', path: '/site', description: 'Site identity, realm membership, and cluster nodes', ready: true, isPlugin: false },
	{ id: 'settings', name: 'Settings', icon: '\u2699', path: '/settings', description: 'Node identity, realms, and preferences', ready: true, isPlugin: false },
	{ id: 'llm', name: 'LLM', icon: '\uD83E\uDD16', path: '/llm', description: 'Chat with AI models across providers', ready: true, isPlugin: false },
	{ id: 'appstore', name: 'Appstore', icon: '\uD83C\uDFEA', path: '/appstore', description: 'Browse and install plugins', ready: true, isPlugin: false },
	{ id: 'observer', name: 'Observer', icon: '\uD83D\uDD2C', path: '/observer', description: 'BEAM debugger and diagnostics', ready: true, isPlugin: false },
	{ id: 'mesh', name: 'Mesh', icon: '\uD83C\uDF10', path: '/mesh', description: 'Mesh network status and discovery', ready: true, isPlugin: false },
	{ id: 'briefcase', name: 'Briefcase', icon: '\uD83D\uDCBC', path: '/briefcase', description: 'Documents, files, and folders', ready: true, isPlugin: false },
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

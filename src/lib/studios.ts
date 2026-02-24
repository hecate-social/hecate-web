// Studio registry — all apps are discovered plugins (no hardcoded core studios)
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

// Reactive: all tabs from discovered plugins
export const studioTabs = derived(plugins, ($plugins) => {
	const pluginTabs: StudioTab[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: capitalize(p.manifest.name),
		icon: p.manifest.icon,
		path: `/plugin/${p.manifest.name}`,
		isPlugin: true
	}));
	return pluginTabs;
});

// Reactive: all cards from discovered plugins
export const studioCards = derived(plugins, ($plugins) => {
	const pluginCards: StudioCard[] = Array.from($plugins.values()).map((p) => ({
		id: p.manifest.name,
		name: capitalize(p.manifest.name),
		icon: p.manifest.icon,
		path: `/plugin/${p.manifest.name}`,
		description: p.manifest.description,
		ready: true,
		isPlugin: true
	}));
	return pluginCards;
});

// Reactive: all studio paths (for keyboard nav)
export const studioPaths = derived(studioTabs, ($tabs) => [
	'/',
	...$tabs.map((t) => t.path)
]);

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

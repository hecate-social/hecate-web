// Activity log store
//
// Captures plugin lifecycle events for a session-scoped activity feed.
// Events are ephemeral (not persisted) — cleared on page reload.

import { writable, derived } from 'svelte/store';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEntry {
	id: number;
	timestamp: number;
	message: string;
	level: ActivityLevel;
	plugin?: string;
}

const MAX_ENTRIES = 50;

let counter = 0;

export const activities = writable<ActivityEntry[]>([]);

export const activityCount = derived(activities, ($a) => $a.length);

export function logActivity(message: string, level: ActivityLevel, plugin?: string): void {
	const entry: ActivityEntry = {
		id: ++counter,
		timestamp: Date.now(),
		message,
		level,
		plugin
	};

	activities.update((all) => {
		const next = [entry, ...all];
		return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
	});
}

export function clearActivity(): void {
	activities.update(() => []);
}

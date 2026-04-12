// Interaction mode — normal (mouse-driven GUI) or zen (keyboard-driven, terminal-like).
// Persists to localStorage. Applies `data-mode` attribute on <html> for CSS hooks.

import { writable } from 'svelte/store';

export type InteractionMode = 'normal' | 'zen';

const STORAGE_KEY = 'hecate-mode';

function getInitialMode(): InteractionMode {
	if (typeof localStorage === 'undefined') return 'normal';
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === 'zen' ? 'zen' : 'normal';
}

function createModeStore() {
	const { subscribe, set, update } = writable<InteractionMode>(getInitialMode());

	function apply(m: InteractionMode) {
		if (typeof document !== 'undefined') {
			document.documentElement.dataset.mode = m;
		}
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, m);
		}
	}

	apply(getInitialMode());

	return {
		subscribe,
		set(m: InteractionMode) {
			apply(m);
			set(m);
		},
		toggle() {
			update((current) => {
				const next: InteractionMode = current === 'normal' ? 'zen' : 'normal';
				apply(next);
				return next;
			});
		}
	};
}

export const mode = createModeStore();

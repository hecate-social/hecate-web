import { writable } from 'svelte/store';

export type Theme = 'vivid' | 'subtle';

const STORAGE_KEY = 'hecate-theme';

function getInitialTheme(): Theme {
	if (typeof localStorage === 'undefined') return 'vivid';
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === 'subtle' ? 'subtle' : 'vivid';
}

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(getInitialTheme());

	function applyTheme(theme: Theme) {
		if (typeof document !== 'undefined') {
			document.documentElement.dataset.theme = theme;
		}
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, theme);
		}
	}

	// Apply on creation
	applyTheme(getInitialTheme());

	return {
		subscribe,
		set(theme: Theme) {
			applyTheme(theme);
			set(theme);
		},
		toggle() {
			update((current) => {
				const next: Theme = current === 'vivid' ? 'subtle' : 'vivid';
				applyTheme(next);
				return next;
			});
		}
	};
}

export const theme = createThemeStore();

// Zoom store — terminal-style font size scaling
//
// Ctrl+Shift+= (plus)  → zoom in
// Ctrl+Shift+-          → zoom out
// Ctrl+Shift+0          → reset
//
// Persists to localStorage. Applies via CSS custom property on <html>.

import { writable, get } from 'svelte/store';
import { registerShortcut } from './keyboard';

const STORAGE_KEY = 'hecate-zoom-level';
const MIN = 0.5;
const MAX = 3.0;
const STEP = 0.05;
const DEFAULT = 1.0;

function loadZoom(): number {
	if (typeof localStorage === 'undefined') return DEFAULT;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored) {
		const val = parseFloat(stored);
		if (!isNaN(val) && val >= MIN && val <= MAX) return val;
	}
	return DEFAULT;
}

export const zoomLevel = writable(loadZoom());

function applyZoom(level: number) {
	if (typeof document === 'undefined') return;
	document.documentElement.style.fontSize = `${level * 100}%`;
}

// Apply on load
applyZoom(loadZoom());

zoomLevel.subscribe((level) => {
	applyZoom(level);
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, String(level));
	}
});

export function zoomIn() {
	zoomLevel.update(z => Math.min(MAX, Math.round((z + STEP) * 100) / 100));
}

export function zoomOut() {
	zoomLevel.update(z => Math.max(MIN, Math.round((z - STEP) * 100) / 100));
}

export function zoomReset() {
	zoomLevel.set(DEFAULT);
}

// Register global shortcuts
registerShortcut({
	key: '=',
	modifiers: ['ctrl', 'shift'],
	label: 'Zoom In',
	category: 'View',
	handler: zoomIn,
});

registerShortcut({
	key: '+',
	modifiers: ['ctrl', 'shift'],
	label: 'Zoom In',
	category: 'View',
	handler: zoomIn,
});

registerShortcut({
	key: '-',
	modifiers: ['ctrl', 'shift'],
	label: 'Zoom Out',
	category: 'View',
	handler: zoomOut,
});

registerShortcut({
	key: '0',
	modifiers: ['ctrl', 'shift'],
	label: 'Reset Zoom',
	category: 'View',
	handler: zoomReset,
});

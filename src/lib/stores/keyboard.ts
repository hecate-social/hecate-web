// Keyboard store — overlay stack, shortcut registry, global dispatch
import { writable, get } from 'svelte/store';

// --- Overlay Stack ---

interface OverlayEntry {
	id: string;
	onClose: () => void;
}

const overlayStack = writable<OverlayEntry[]>([]);

export function pushOverlay(id: string, onClose: () => void): void {
	overlayStack.update(($stack) => {
		// Remove duplicate if already present
		const filtered = $stack.filter((e) => e.id !== id);
		return [...filtered, { id, onClose }];
	});
}

export function popOverlay(id?: string): void {
	overlayStack.update(($stack) => {
		if ($stack.length === 0) return $stack;
		if (id) return $stack.filter((e) => e.id !== id);
		return $stack.slice(0, -1);
	});
}

// --- Shortcut Registry ---

type Modifier = 'ctrl' | 'alt' | 'shift';

export interface Shortcut {
	key: string;
	modifiers: Modifier[];
	label: string;
	category: string;
	handler: () => void;
}

const shortcuts = writable<Shortcut[]>([]);

export function registerShortcut(s: Shortcut): () => void {
	shortcuts.update(($s) => [...$s, s]);
	return () => {
		shortcuts.update(($s) => $s.filter((x) => x !== s));
	};
}

export { shortcuts };

// --- Global Dispatch ---

function isInputFocused(): boolean {
	const el = document.activeElement;
	if (!el) return false;
	const tag = el.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if ((el as HTMLElement).isContentEditable) return true;
	return false;
}

function matchesModifiers(e: KeyboardEvent, mods: Modifier[]): boolean {
	const wantCtrl = mods.includes('ctrl');
	const wantAlt = mods.includes('alt');
	const wantShift = mods.includes('shift');
	return (
		e.ctrlKey === wantCtrl &&
		e.altKey === wantAlt &&
		e.shiftKey === wantShift
	);
}

export function dispatchKeydown(e: KeyboardEvent): void {
	// 1. Escape → pop top overlay
	if (e.key === 'Escape') {
		const stack = get(overlayStack);
		if (stack.length > 0) {
			e.preventDefault();
			e.stopPropagation();
			const top = stack[stack.length - 1];
			top.onClose();
			popOverlay(top.id);
			return;
		}
	}

	// 2. Match shortcut registry
	const registered = get(shortcuts);
	for (const s of registered) {
		if (s.key !== e.key) continue;
		if (!matchesModifiers(e, s.modifiers)) continue;

		// Skip non-modified shortcuts when input is focused
		const hasModifier = s.modifiers.length > 0;
		if (!hasModifier && isInputFocused()) continue;

		e.preventDefault();
		s.handler();
		return;
	}
}

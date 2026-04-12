// Vim modal state — only meaningful when interaction mode is 'zen'.
// NORMAL: navigation + command keys (g, G, 1-9, :, /)
// INSERT: text input (pass keystrokes through to focused input)
// VISUAL: selection (reserved for future use)

import { writable } from 'svelte/store';

export type VimMode = 'normal' | 'insert' | 'visual';

export const vimMode = writable<VimMode>('normal');

export function setVimMode(m: VimMode): void {
	vimMode.set(m);
}

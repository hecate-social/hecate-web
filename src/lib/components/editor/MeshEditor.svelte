<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { EditorState, type Extension } from '@codemirror/state';
	import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
	import { defaultKeymap, indentWithTab } from '@codemirror/commands';
	import { indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { vim, Vim, getCM } from '@replit/codemirror-vim';
	import { history, historyKeymap } from '@codemirror/commands';
	import { languageForFilename, languageLabel } from './languages.js';
	import { hecateTheme, hecateHighlightStyle } from './theme.js';

	let { path, onstatuschange, onsave }: {
		path: string;
		onstatuschange?: (status: { saving: boolean; charCount: number; wordCount: number; lang: string; mode: string }) => void;
		onsave?: () => void;
	} = $props();

	const fileName = path.substring(path.lastIndexOf('/') + 1);
	const fileExt = path.substring(path.lastIndexOf('.')).toLowerCase();
	const lang = languageLabel(fileExt);

	let container: HTMLElement;
	let view: EditorView | null = null;
	let saving = $state(false);
	let loadError = $state('');
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	// --- Tauri FS ---
	async function fsRead(filePath: string): Promise<string> {
		const fsMod: any = await import('@tauri-apps/plugin-fs');
		const bytes: Uint8Array = await fsMod.readFile(filePath);
		return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
	}

	async function fsWrite(filePath: string, text: string): Promise<void> {
		const fsMod: any = await import('@tauri-apps/plugin-fs');
		const bytes = new TextEncoder().encode(text);
		await fsMod.writeFile(filePath, bytes);
	}

	// --- Lifecycle ---
	onMount(async () => {
		let content = '';
		try {
			content = await fsRead(path);
		} catch (e: any) {
			loadError = `fsRead failed: ${e?.message ?? e}`;
		}

		// Build extensions
		const extensions: Extension[] = [
			vim(),
			lineNumbers(),
			highlightActiveLine(),
			highlightActiveLineGutter(),
			foldGutter(),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			highlightSelectionMatches(),
			history(),
			keymap.of([
				...historyKeymap,
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...foldKeymap,
				indentWithTab,
			]),
			hecateTheme,
			hecateHighlightStyle,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					scheduleSave();
				}
				reportStatus();
			}),
		];

		// Add language support (async — lazy loaded from @codemirror/language-data)
		const langSupport = await languageForFilename(fileName);
		if (langSupport) extensions.push(langSupport);

		const state = EditorState.create({ doc: content, extensions });
		view = new EditorView({ state, parent: container });

		// Register custom vim ex-commands
		registerVimCommands();

		// Focus after a tick to ensure DOM is ready
		await tick();
		view.focus();

		reportStatus();
	});

	onDestroy(() => {
		if (saveTimeout) clearTimeout(saveTimeout);
		view?.destroy();
		view = null;
	});

	// --- Vim ex-commands ---
	function registerVimCommands() {
		Vim.defineEx('write', 'w', () => { doSave(); });
		Vim.defineEx('quit', 'q', () => {
			container.dispatchEvent(new CustomEvent('editor-quit', { bubbles: true }));
		});
		Vim.defineEx('wq', 'wq', async () => {
			await doSave();
			container.dispatchEvent(new CustomEvent('editor-quit', { bubbles: true }));
		});
		Vim.defineEx('x', 'x', async () => {
			await doSave();
			container.dispatchEvent(new CustomEvent('editor-quit', { bubbles: true }));
		});
		Vim.defineEx('qall', 'qa', () => {
			container.dispatchEvent(new CustomEvent('editor-quit-all', { bubbles: true }));
		});
		// Short form must be a prefix of the long form
		Vim.defineEx('tabnew', 'tabn', (_cm: any, params: any) => {
			const p = params?.args?.[0] ?? params?.argString?.trim();
			if (p) container.dispatchEvent(new CustomEvent('editor-tabnew', { bubbles: true, detail: p }));
		});
		Vim.defineEx('tabnext', 'tabne', () => {
			container.dispatchEvent(new CustomEvent('editor-tabnext', { bubbles: true }));
		});
		Vim.defineEx('tabprevious', 'tabp', () => {
			container.dispatchEvent(new CustomEvent('editor-tabprev', { bubbles: true }));
		});
		Vim.defineEx('tabclose', 'tabc', () => {
			container.dispatchEvent(new CustomEvent('editor-quit', { bubbles: true }));
		});
	}

	// --- Save ---
	function scheduleSave() {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => doSave(), 2000);
	}

	async function doSave() {
		if (!view || saving) return;
		saving = true;
		reportStatus();
		try {
			const text = view.state.doc.toString();
			await fsWrite(path, text);
			onsave?.();
		} catch (e) {
			console.error('[editor] Failed to save:', e);
		} finally {
			saving = false;
			reportStatus();
		}
	}

	function reportStatus() {
		if (!view) return;
		const doc = view.state.doc;
		const charCount = doc.length;
		const wordCount = doc.toString().split(/\s+/).filter(Boolean).length;
		let mode = 'NORMAL';
		try {
			const cmObj = getCM(view);
			const vimState = (cmObj as any)?.state?.vim;
			if (vimState) {
				if (vimState.insertMode) mode = 'INSERT';
				else if (vimState.visualLine) mode = 'V-LINE';
				else if (vimState.visualBlock) mode = 'V-BLOCK';
				else if (vimState.visualMode) mode = 'VISUAL';
			}
		} catch { /* getCM might fail before full init */ }
		onstatuschange?.({ saving, charCount, wordCount, lang, mode });
	}

	// --- Exposed methods ---
	export function save(): Promise<void> { return doSave(); }
	export function focus(): void { view?.focus(); }
	export function getCharCount(): number { return view?.state.doc.length ?? 0; }
	export function getWordCount(): number {
		return (view?.state.doc.toString() ?? '').split(/\s+/).filter(Boolean).length;
	}
	export function getLang(): string { return lang; }
</script>

<div class="h-full overflow-hidden relative" bind:this={container}>
	{#if loadError}
		<div class="absolute top-0 left-0 right-0 bg-danger-600/90 text-white text-[11px] px-3 py-1 z-10">
			{loadError} — path: {path}
		</div>
	{/if}
</div>

<style>
	div :global(.cm-editor) {
		height: 100%;
	}
	div :global(.cm-scroller) {
		overflow: auto;
	}
</style>

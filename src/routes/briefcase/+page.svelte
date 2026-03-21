<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		entries, currentPath, briefcaseRoot, meta, briefcaseLoading,
		creatableFileTypes, fileTypeRegistry, resolveFileType,
		initBriefcase, stopBriefcase, navigateTo, navigateUp,
		loadEntriesRaw, readFilePreview,
		createFolder, createFile, renameEntry, deleteEntry,
		toggleStar, isStarred, addRecent,
		entryIcon, formatFileSize,
		type BriefcaseEntry, type FileTypeHandler
	} from '$lib/stores/briefcase';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

	// --- Command registry ---
	interface Command {
		name: string;
		aliases: string[];
		args: string;
		description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{
			name: 'mkdir', aliases: ['md'], args: '<name>',
			description: 'Create a new directory',
			async exec(args) {
				const name = args.trim();
				if (!name) { statusMsg = 'mkdir: missing name'; return; }
				await createFolder(name);
				toastSuccess(`Created "${name}"/`);
			}
		},
		{
			name: 'touch', aliases: ['new'], args: '<name>',
			description: 'Create an empty file',
			async exec(args) {
				const name = args.trim();
				if (!name) { statusMsg = 'touch: missing name'; return; }
				await createFile(name);
				toastSuccess(`Created "${name}"`);
			}
		},
		{
			name: 'rm', aliases: ['delete', 'del'], args: '[name]',
			description: 'Delete selected entry (or by name)',
			async exec(args) {
				const name = args.trim();
				if (name) {
					const entry = currentEntries.find(e => e.name === name);
					if (!entry) { statusMsg = `rm: "${name}" not found`; return; }
					pendingAction = { type: 'delete', entry };
					mode = 'confirm';
					confirmPrompt = `Delete "${name}"?`;
				} else if (selectedEntry) {
					pendingAction = { type: 'delete', entry: selectedEntry };
					mode = 'confirm';
					confirmPrompt = `Delete "${selectedEntry.name}"?`;
				} else {
					statusMsg = 'rm: nothing selected';
				}
			}
		},
		{
			name: 'rename', aliases: ['mv', 'ren'], args: '<new-name>',
			description: 'Rename selected entry',
			async exec(args) {
				const newName = args.trim();
				if (!selectedEntry) { statusMsg = 'rename: nothing selected'; return; }
				if (!newName) { statusMsg = 'rename: missing new name'; return; }
				await renameEntry(selectedEntry.path, newName);
				toastSuccess(`Renamed to "${newName}"`);
			}
		},
		{
			name: 'cd', aliases: [], args: '<path>',
			description: 'Change directory (.. for parent, / for root)',
			async exec(args) {
				const target = args.trim();
				if (!target) return;
				if (target === '..') { await goUp(); return; }
				if (target === '/' || target === '~') {
					await navigateTo($briefcaseRoot);
					cursorIndex = 0;
					await refreshParent();
					return;
				}
				// Relative path: look for matching dir in current entries
				const match = currentEntries.find(e => e.isDir && e.name === target);
				if (match) {
					await navigateTo(match.path);
					cursorIndex = 0;
					await refreshParent();
				} else {
					statusMsg = `cd: "${target}" not found`;
				}
			}
		},
		{
			name: 'open', aliases: ['edit', 'e'], args: '[name]',
			description: 'Open selected file in its plugin editor',
			async exec(args) {
				const name = args.trim();
				if (name) {
					const entry = currentEntries.find(e => e.name === name);
					if (!entry) { statusMsg = `open: "${name}" not found`; return; }
					const idx = currentEntries.indexOf(entry);
					if (idx >= 0) cursorIndex = idx;
					await openSelected();
				} else {
					await openSelected();
				}
			}
		},
		{
			name: 'star', aliases: ['fav'], args: '',
			description: 'Toggle star on selected entry',
			exec() { if (selectedEntry) toggleStar(selectedEntry.path); else statusMsg = 'star: nothing selected'; }
		},
		{
			name: 'create', aliases: [], args: '<type>',
			description: 'Create a new file by type (tab to see types)',
			async exec(args) {
				const typeName = args.trim().toLowerCase();
				const types = $creatableFileTypes;
				const typeNames = types.map(t => t.label.toLowerCase());
				if (!typeName) {
					statusMsg = 'create: available types: ' + typeNames.join(', ');
					return;
				}
				const ft = types.find(t =>
					t.label.toLowerCase() === typeName ||
					t.extensions.some(ext => ext.replace('.', '') === typeName)
				);
				if (!ft) {
					statusMsg = `create: unknown type "${typeName}". Try: ${typeNames.join(', ')}`;
					return;
				}
				await handleCreateFile(ft);
			}
		},
		{
			name: 'help', aliases: ['h', '?'], args: '[command]',
			description: 'Show help (or help for a specific command)',
			exec(args) {
				const cmd = args.trim();
				if (cmd) {
					const found = findCommand(cmd);
					if (found) {
						statusMsg = `:${found.name} ${found.args} - ${found.description}`;
					} else {
						statusMsg = `Unknown command: ${cmd}`;
					}
				} else {
					showHelp = true;
				}
			}
		},
		{
			name: 'q', aliases: ['quit', 'back'], args: '',
			description: 'Go back (navigate to parent or exit)',
			async exec() { await goUp(); }
		},
	];

	function findCommand(input: string): Command | undefined {
		return commands.find(c => c.name === input || c.aliases.includes(input));
	}

	// --- State ---
	let cursorIndex = $state(0);
	let parentEntries = $state<BriefcaseEntry[]>([]);
	let previewText = $state('');
	let previewLoading = $state(false);
	let previewChildEntries = $state<BriefcaseEntry[]>([]);

	// Modes: normal, search, command, confirm
	let mode = $state<'normal' | 'search' | 'command' | 'confirm'>('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let commandHistory = $state<string[]>([]);
	let historyIndex = $state(-1);
	let statusMsg = $state('');
	let showHelp = $state(false);
	let confirmPrompt = $state('');
	let pendingAction = $state<{ type: string; entry?: BriefcaseEntry } | null>(null);

	// Tab completion
	let completionCandidates = $state<string[]>([]);
	let completionIndex = $state(-1);

	// --- Derived ---
	let currentEntries = $derived($entries);
	let selectedEntry = $derived<BriefcaseEntry | null>(currentEntries[cursorIndex] ?? null);
	let isAtRoot = $derived($currentPath === $briefcaseRoot);
	let relativePath = $derived.by(() => {
		if (!$briefcaseRoot || !$currentPath) return '/';
		const rel = $currentPath.substring($briefcaseRoot.length);
		return rel || '/';
	});

	let filteredEntries = $derived.by(() => {
		if (mode !== 'search' || !searchQuery) return currentEntries;
		const q = searchQuery.toLowerCase();
		return currentEntries.filter(e => e.name.toLowerCase().includes(q));
	});

	let displayEntries = $derived(mode === 'search' ? filteredEntries : currentEntries);

	// --- Init ---
	onMount(async () => {
		await initBriefcase();
		await refreshParent();
		await refreshPreview();
	});

	onDestroy(() => {
		stopBriefcase();
	});

	// --- Refresh helpers ---
	async function refreshParent(): Promise<void> {
		if (!$currentPath || !$briefcaseRoot) return;
		if ($currentPath === $briefcaseRoot) {
			parentEntries = [];
			return;
		}
		const parentDir = $currentPath.substring(0, $currentPath.lastIndexOf('/'));
		if (parentDir.length >= $briefcaseRoot.length) {
			parentEntries = await loadEntriesRaw(parentDir);
		} else {
			parentEntries = [];
		}
	}

	async function refreshPreview(): Promise<void> {
		if (showHelp) return; // don't refresh preview when help is shown
		const entry = displayEntries[cursorIndex];
		if (!entry) {
			previewText = '';
			previewChildEntries = [];
			return;
		}
		if (entry.isDir) {
			previewLoading = true;
			previewText = '';
			previewChildEntries = await loadEntriesRaw(entry.path);
			previewLoading = false;
		} else {
			previewChildEntries = [];
			const textExts = ['.txt', '.md', '.csv', '.json', '.toml', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.ts', '.ex', '.exs', '.erl', '.hrl', '.sh', '.rs', '.py', '.go', '.rb', '.lua', '.sql', '.stage', '.ledger'];
			if (entry.extension && textExts.includes(entry.extension)) {
				previewLoading = true;
				previewText = await readFilePreview(entry.path);
				previewLoading = false;
			} else {
				previewText = '';
			}
		}
	}

	// Clamp cursor when entries change
	$effect(() => {
		const len = displayEntries.length;
		if (cursorIndex >= len) cursorIndex = Math.max(0, len - 1);
	});

	// Refresh preview when cursor moves
	$effect(() => {
		const _ = cursorIndex;
		const __ = displayEntries;
		refreshPreview();
	});

	// Clear status message after a delay
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (statusMsg) {
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => { statusMsg = ''; }, 5000);
		}
	});

	// --- Command execution ---
	async function executeCommand(raw: string): Promise<void> {
		const trimmed = raw.trim();
		if (!trimmed) return;

		// Add to history
		if (commandHistory[0] !== trimmed) {
			commandHistory = [trimmed, ...commandHistory].slice(0, 50);
		}

		// Parse command and args
		const spaceIdx = trimmed.indexOf(' ');
		const cmdName = spaceIdx >= 0 ? trimmed.substring(0, spaceIdx) : trimmed;
		const cmdArgs = spaceIdx >= 0 ? trimmed.substring(spaceIdx + 1) : '';

		const cmd = findCommand(cmdName);
		if (cmd) {
			try {
				await cmd.exec(cmdArgs);
			} catch (err) {
				statusMsg = `Error: ${err}`;
			}
		} else {
			statusMsg = `Unknown command: ${cmdName}. Type :help for commands.`;
		}
	}

	// --- Tab completion ---
	function computeCompletions(): void {
		const input = commandInput.trim();
		const spaceIdx = input.indexOf(' ');

		if (spaceIdx < 0) {
			// Completing command name
			completionCandidates = commands
				.map(c => c.name)
				.filter(n => n.startsWith(input));
		} else {
			// Completing argument (entry names)
			const argPart = input.substring(spaceIdx + 1).toLowerCase();
			completionCandidates = currentEntries
				.map(e => e.name)
				.filter(n => n.toLowerCase().startsWith(argPart));
		}
		completionIndex = -1;
	}

	function applyCompletion(): void {
		if (completionCandidates.length === 0) return;
		completionIndex = (completionIndex + 1) % completionCandidates.length;
		const candidate = completionCandidates[completionIndex];

		const spaceIdx = commandInput.indexOf(' ');
		if (spaceIdx < 0) {
			commandInput = candidate + ' ';
		} else {
			commandInput = commandInput.substring(0, spaceIdx + 1) + candidate;
		}
	}

	// --- Keyboard ---
	function onKeyDown(e: KeyboardEvent): void {
		// Escape always returns to normal
		if (e.key === 'Escape') {
			e.preventDefault();
			mode = 'normal';
			searchQuery = '';
			commandInput = '';
			showHelp = false;
			completionCandidates = [];
			confirmPrompt = '';
			pendingAction = null;
			return;
		}

		// Mode-specific handlers
		if (mode === 'search') { handleSearchKeys(e); return; }
		if (mode === 'command') {
			// Only intercept Tab/Up/Down — let all other keys reach the <input>
			if (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				handleCommandKeys(e);
			}
			return;
		}
		if (mode === 'confirm') { handleConfirmKeys(e); return; }

		if (mode !== 'normal') return;

		// Normal mode keybindings
		switch (e.key) {
			case 'j':
			case 'ArrowDown':
				e.preventDefault();
				cursorIndex = Math.min(cursorIndex + 1, displayEntries.length - 1);
				scrollCursorIntoView();
				break;
			case 'k':
			case 'ArrowUp':
				e.preventDefault();
				cursorIndex = Math.max(cursorIndex - 1, 0);
				scrollCursorIntoView();
				break;
			case 'l':
			case 'ArrowRight':
			case 'Enter':
				e.preventDefault();
				openSelected();
				break;
			case 'h':
			case 'ArrowLeft':
				e.preventDefault();
				goUp();
				break;
			case 'g':
				e.preventDefault();
				cursorIndex = 0;
				scrollCursorIntoView();
				break;
			case 'G':
				e.preventDefault();
				cursorIndex = Math.max(0, displayEntries.length - 1);
				scrollCursorIntoView();
				break;
			case '/':
				e.preventDefault();
				mode = 'search';
				searchQuery = '';
				break;
			case ':':
				e.preventDefault();
				mode = 'command';
				commandInput = '';
				historyIndex = -1;
				completionCandidates = [];
				statusMsg = '';
				break;
			case '?':
				e.preventDefault();
				showHelp = !showHelp;
				break;
			case 'd':
				e.preventDefault();
				if (selectedEntry) {
					pendingAction = { type: 'delete', entry: selectedEntry };
					mode = 'confirm';
					confirmPrompt = `Delete "${selectedEntry.name}"?`;
				}
				break;
			case 'r':
				e.preventDefault();
				if (selectedEntry) {
					mode = 'command';
					commandInput = `rename ${selectedEntry.name}`;
					historyIndex = -1;
					completionCandidates = [];
					// Place cursor focus — the input will autofocus
				}
				break;
			case ' ':
				e.preventDefault();
				if (selectedEntry) toggleStar(selectedEntry.path);
				break;
		}
	}

	function handleSearchKeys(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			mode = 'normal';
			return;
		}
		if (e.key === 'Backspace') {
			searchQuery = searchQuery.slice(0, -1);
			if (!searchQuery) { mode = 'normal'; return; }
			cursorIndex = 0;
			return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			searchQuery += e.key;
			cursorIndex = 0;
		}
	}

	function handleCommandKeys(e: KeyboardEvent): void {
		// Tab: completion
		if (e.key === 'Tab') {
			e.preventDefault();
			if (completionCandidates.length === 0) computeCompletions();
			applyCompletion();
			return;
		}
		// Up/Down: history navigation
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (commandHistory.length > 0) {
				historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
				commandInput = commandHistory[historyIndex];
			}
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (historyIndex > 0) {
				historyIndex--;
				commandInput = commandHistory[historyIndex];
			} else {
				historyIndex = -1;
				commandInput = '';
			}
			return;
		}
		// Reset completions on any other key
		completionCandidates = [];
		completionIndex = -1;
	}

	function handleConfirmKeys(e: KeyboardEvent): void {
		e.preventDefault();
		if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
			if (pendingAction?.type === 'delete' && pendingAction.entry) {
				const name = pendingAction.entry.name;
				deleteEntry(pendingAction.entry.path).then(() => {
					toastSuccess(`Deleted "${name}"`);
				});
			}
		}
		mode = 'normal';
		confirmPrompt = '';
		pendingAction = null;
	}

	async function onCommandSubmit(): Promise<void> {
		const cmd = commandInput;
		mode = 'normal';
		commandInput = '';
		completionCandidates = [];
		await executeCommand(cmd);
	}

	// --- Actions ---
	async function openSelected(): Promise<void> {
		const entry = displayEntries[cursorIndex];
		if (!entry) return;
		if (entry.isDir) {
			await navigateTo(entry.path);
			cursorIndex = 0;
			await refreshParent();
			return;
		}

		const handler = resolveFileType(entry.extension, entry.name, $fileTypeRegistry);
		if (handler?.route) {
			addRecent(entry.path);
			goto(handler.route + '?path=' + encodeURIComponent(entry.path));
		} else if (handler?.plugin) {
			addRecent(entry.path);
			const itemId = entry.name.substring(0, entry.name.lastIndexOf('.')) || entry.name;
			goto(`/plugin/${handler.plugin}?item_id=${itemId}`);
		} else if (handler?.external) {
			// Future: open with OS default via Tauri shell
		} else {
			statusMsg = 'No editor for ' + (entry.extension ?? 'this file');
		}
	}

	async function goUp(): Promise<void> {
		if (isAtRoot) return;
		const currentDirName = $currentPath.substring($currentPath.lastIndexOf('/') + 1);
		await navigateUp();
		const idx = $entries.findIndex(e => e.name === currentDirName);
		cursorIndex = idx >= 0 ? idx : 0;
		await refreshParent();
	}

	async function handleCreateFile(ft: FileTypeHandler): Promise<void> {
		const ext = ft.extensions[0] ?? '.txt';
		const name = `Untitled ${ft.label}${ext}`;
		const fullPath = await createFile(name);
		if (ft.route) {
			goto(ft.route + '?path=' + encodeURIComponent(fullPath));
		} else if (ft.plugin) {
			const itemId = name.substring(0, name.lastIndexOf('.'));
			goto(`/plugin/${ft.plugin}?item_id=${itemId}`);
		}
	}

	// --- Scroll ---
	function scrollCursorIntoView(): void {
		tick().then(() => {
			const el = document.querySelector('[data-cursor="true"]');
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	// --- Formatting ---
	function formatDate(ts: number | null): string {
		if (!ts) return '';
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function parentDirName(): string {
		if (!$currentPath || $currentPath === $briefcaseRoot) return '';
		const parent = $currentPath.substring(0, $currentPath.lastIndexOf('/'));
		return parent.substring(parent.lastIndexOf('/') + 1);
	}

	function currentDirName(): string {
		if (!$currentPath) return '';
		if ($currentPath === $briefcaseRoot) return 'briefcase';
		return $currentPath.substring($currentPath.lastIndexOf('/') + 1);
	}

	function focusOnMount(node: HTMLElement): void {
		tick().then(() => node.focus());
	}

	const helpKeybindings: [string, string][] = [
		['j / k', 'Move cursor down / up'],
		['l / Enter', 'Open directory or file'],
		['h', 'Go to parent directory'],
		['g / G', 'Jump to first / last'],
		['/', 'Incremental search'],
		[':', 'Command mode'],
		['Space', 'Toggle star'],
		['d', 'Delete (with confirm)'],
		['r', 'Rename (opens :rename)'],
		['?', 'Toggle this help'],
		['Esc', 'Cancel / back to normal'],
	];
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Three-pane body -->
	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">

		<!-- Left pane: parent directory -->
		<div class="w-1/4 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if !isAtRoot && parentEntries.length > 0}
				<div class="px-2 py-0.5 text-[10px] text-surface-500 uppercase tracking-wider truncate">
					{parentDirName()}
				</div>
				{#each parentEntries as entry (entry.path)}
					{@const isCurrent = entry.path === $currentPath}
					<button
						class="w-full text-left px-2 py-px text-[11px] truncate flex items-center gap-1.5 cursor-pointer transition-colors
							{isCurrent ? 'bg-surface-700/80 text-surface-100' : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800'}"
						onclick={() => { navigateTo(entry.path).then(() => { cursorIndex = 0; refreshParent(); }); }}
					>
						<span class="text-surface-600 w-3 text-center shrink-0">{entry.isDir ? '/' : ' '}</span>
						<span class="truncate">{entry.name}</span>
					</button>
				{/each}
			{:else if isAtRoot}
				<div class="flex items-center justify-center h-full text-surface-600 text-[10px]">
					root
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[10px]">
					...
				</div>
			{/if}
		</div>

		<!-- Center pane: current directory (main focus) -->
		<div class="flex-1 overflow-y-auto py-1 min-w-0">
			<div class="px-2 py-0.5 text-[10px] text-hecate-400 uppercase tracking-wider truncate flex items-center gap-1">
				<span>{currentDirName()}</span>
				<span class="text-surface-600">({displayEntries.length})</span>
			</div>

			{#if $briefcaseLoading && displayEntries.length === 0}
				<div class="px-2 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else if displayEntries.length === 0}
				<div class="px-2 py-4 text-[11px] text-surface-600">
					{mode === 'search' ? 'No matches' : 'Empty directory -- :help for commands'}
				</div>
			{:else}
				{#each displayEntries as entry, i (entry.path)}
					{@const isCursor = i === cursorIndex}
					{@const starred = isStarred(entry.path, $meta)}
					<button
						data-cursor={isCursor ? 'true' : 'false'}
						class="w-full text-left px-2 py-px text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors
							{isCursor
								? 'bg-hecate-600/30 text-surface-50 border-l-2 border-hecate-400'
								: 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => { cursorIndex = i; }}
						ondblclick={() => openSelected()}
					>
						<span class="w-3 text-center shrink-0 {entry.isDir ? 'text-hecate-400' : 'text-surface-500'}">
							{entry.isDir ? '/' : '.'}
						</span>
						<span class="truncate flex-1 {entry.isDir ? 'text-hecate-300' : ''}">{entry.name}</span>
						{#if starred}
							<span class="text-amber-400 text-[9px] shrink-0">*</span>
						{/if}
						{#if !entry.isDir && entry.size > 0}
							<span class="text-[9px] text-surface-600 shrink-0 w-12 text-right">{formatFileSize(entry.size)}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>

		<!-- Right pane: preview / help -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if showHelp}
				<!-- Help content rendered in preview pane -->
				<div class="px-3 py-2">
					<div class="text-[10px] text-hecate-400 uppercase tracking-wider mb-2">Keybindings</div>
					<div class="space-y-px text-[10px]">
						{#each helpKeybindings as [key, desc]}
							<div class="flex gap-2">
								<span class="text-hecate-300 w-16 shrink-0 text-right">{key}</span>
								<span class="text-surface-400">{desc}</span>
							</div>
						{/each}
					</div>

					<div class="text-[10px] text-hecate-400 uppercase tracking-wider mt-4 mb-2">Commands</div>
					<div class="space-y-px text-[10px]">
						{#each commands as cmd}
							<div class="flex gap-2">
								<span class="text-hecate-300 w-16 shrink-0 text-right">:{cmd.name}</span>
								<span class="text-surface-500">{cmd.args}</span>
								<span class="text-surface-400 truncate">{cmd.description}</span>
							</div>
							{#if cmd.aliases.length > 0}
								<div class="flex gap-2">
									<span class="w-16 shrink-0"></span>
									<span class="text-surface-600 text-[9px]">aliases: {cmd.aliases.map(a => ':' + a).join(', ')}</span>
								</div>
							{/if}
						{/each}
					</div>

					<div class="text-[10px] text-surface-600 mt-4">
						Tab completes commands and filenames.
						Up/Down navigates command history.
					</div>
				</div>
			{:else if !selectedEntry}
				<div class="flex items-center justify-center h-full text-surface-600 text-[10px]">
					No selection
				</div>
			{:else if previewLoading}
				<div class="px-2 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else if selectedEntry.isDir && previewChildEntries.length > 0}
				<div class="px-2 py-0.5 text-[10px] text-surface-500 uppercase tracking-wider truncate">
					{selectedEntry.name}/
				</div>
				{#each previewChildEntries as child (child.path)}
					<div class="px-2 py-px text-[11px] text-surface-500 truncate flex items-center gap-1.5">
						<span class="text-surface-600 w-3 text-center shrink-0">{child.isDir ? '/' : ' '}</span>
						<span class="truncate">{child.name}</span>
					</div>
				{/each}
			{:else if selectedEntry.isDir}
				<div class="flex items-center justify-center h-full text-surface-600 text-[10px]">
					Empty directory
				</div>
			{:else if previewText}
				<div class="px-2 py-0.5 text-[10px] text-surface-500 uppercase tracking-wider truncate">
					{selectedEntry.name}
				</div>
				<pre class="px-2 text-[10px] text-surface-400 whitespace-pre-wrap break-all leading-relaxed">{previewText}</pre>
			{:else}
				<div class="px-2 py-2">
					<div class="text-[10px] text-surface-500 uppercase tracking-wider mb-2">{selectedEntry.name}</div>
					<div class="space-y-1 text-[10px] text-surface-500">
						<div>Type: {selectedEntry.extension ?? 'unknown'}</div>
						<div>Size: {formatFileSize(selectedEntry.size) || '0 B'}</div>
						{#if selectedEntry.modifiedAt}
							<div>Modified: {formatDate(selectedEntry.modifiedAt)}</div>
						{/if}
						{#if isStarred(selectedEntry.path, $meta)}
							<div class="text-amber-400">Starred</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Status bar / command line -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-hecate-400">:</span>
			<input
				type="text" bind:value={commandInput}
				use:focusOnMount
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); }
					else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; completionCandidates = []; }
				}}
				oninput={() => { completionCandidates = []; completionIndex = -1; }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100"
				placeholder="Type a command... (Tab to complete)"
			/>
			{#if completionCandidates.length > 1}
				<span class="text-surface-600 truncate">{completionCandidates.join('  ')}</span>
			{/if}
		{:else if mode === 'search'}
			<span class="text-hecate-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{filteredEntries.length} matches</span>
		{:else if mode === 'confirm'}
			<span class="text-danger-400">{confirmPrompt}</span>
			<span class="text-surface-500">(y/N)</span>
		{:else}
			<!-- Normal mode status -->
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{relativePath}</span>
				<span class="text-surface-700">|</span>
				{#if selectedEntry}
					<span class="text-surface-400 truncate">{selectedEntry.name}</span>
					{#if !selectedEntry.isDir && selectedEntry.size > 0}
						<span class="text-surface-600">{formatFileSize(selectedEntry.size)}</span>
					{/if}
					{#if selectedEntry.modifiedAt}
						<span class="text-surface-600">{formatDate(selectedEntry.modifiedAt)}</span>
					{/if}
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{displayEntries.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => showHelp = !showHelp}>?</span>
			{/if}
		{/if}
	</div>
</div>

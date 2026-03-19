<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		entries, currentPath, briefcaseRoot, meta, briefcaseLoading,
		creatableFileTypes, fileTypeRegistry,
		initBriefcase, navigateTo, navigateUp, loadEntries,
		createFolder, createFile, renameEntry, deleteEntry,
		toggleStar, isStarred, addRecent,
		entryIcon, formatFileSize,
		type BriefcaseEntry, type RegisteredFileType
	} from '$lib/stores/briefcase';
	import { resolveEmoji } from '$lib/emoji';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

	// --- State ---
	let showNewMenu = $state(false);
	let showNewFolder = $state(false);
	let newFolderName = $state('');
	let renamingPath = $state<string | null>(null);
	let renameValue = $state('');
	let contextMenu = $state<{ x: number; y: number; entry: BriefcaseEntry } | null>(null);

	// --- Derived ---
	let isAtRoot = $derived($currentPath === $briefcaseRoot);
	let breadcrumbs = $derived.by(() => {
		if (!$briefcaseRoot || !$currentPath) return [];
		const rel = $currentPath.substring($briefcaseRoot.length);
		if (!rel) return [];
		return rel.split('/').filter(Boolean);
	});

	// --- Init ---
	onMount(() => {
		initBriefcase();
	});

	// --- Actions ---
	function openEntry(entry: BriefcaseEntry) {
		if (entry.isDir) {
			navigateTo(entry.path);
		} else {
			// Find plugin for this extension
			const ft = $fileTypeRegistry.find((t) =>
				t.import_extensions?.some((ext: string) => entry.name.endsWith(ext)) ||
				entry.name.endsWith(`.${t.type}`)
			);
			if (ft) {
				addRecent(entry.path);
				// Use filename without extension as item_id
				const itemId = entry.name.substring(0, entry.name.lastIndexOf('.')) || entry.name;
				goto(`/plugin/${ft.plugin}?item_id=${itemId}`);
			}
		}
	}

	async function handleCreateFile(ft: RegisteredFileType) {
		showNewMenu = false;
		const name = `Untitled ${ft.label}.${ft.type}`;
		const path = await createFile(name);
		const itemId = name.substring(0, name.lastIndexOf('.'));
		goto(`/plugin/${ft.plugin}?item_id=${itemId}`);
	}

	async function commitNewFolder() {
		const name = newFolderName.trim();
		if (!name) { showNewFolder = false; return; }
		await createFolder(name);
		showNewFolder = false;
		newFolderName = '';
		toastSuccess(`Folder "${name}" created`);
	}

	function startRename(entry: BriefcaseEntry) {
		renamingPath = entry.path;
		renameValue = entry.name;
		contextMenu = null;
	}

	async function commitRename() {
		if (!renamingPath || !renameValue.trim()) { renamingPath = null; return; }
		await renameEntry(renamingPath, renameValue.trim());
		renamingPath = null;
	}

	async function handleDelete(entry: BriefcaseEntry) {
		await deleteEntry(entry.path);
		toastSuccess(`"${entry.name}" deleted`);
		contextMenu = null;
	}

	function onContextMenu(e: MouseEvent, entry: BriefcaseEntry) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, entry };
	}

	function onWindowClick() {
		if (contextMenu) contextMenu = null;
		if (showNewMenu) showNewMenu = false;
	}

	function formatDate(ts: number | null): string {
		if (!ts) return '';
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header -->
	<div class="border-b border-surface-600 bg-surface-800/50 px-4 py-3 shrink-0">
		<div class="flex items-center gap-3">
			<span class="text-lg">{'\uD83D\uDCBC'}</span>
			<h1 class="text-sm font-semibold text-surface-100">Briefcase</h1>
			<div class="flex-1"></div>

			<!-- New button -->
			<div class="relative">
				<button
					onclick={(e) => { e.stopPropagation(); showNewMenu = !showNewMenu; }}
					class="px-3 py-1.5 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 transition-colors cursor-pointer"
				>+ New {'\u25BE'}</button>
				{#if showNewMenu}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute top-full right-0 mt-1 w-48 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 z-50"
						onclick={(e) => e.stopPropagation()}>
						{#each $creatableFileTypes as ft (ft.type)}
							<button onclick={() => handleCreateFile(ft)}
								class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer flex items-center gap-2">
								<span class="text-sm">{resolveEmoji(ft.icon)}</span>
								<span>{ft.label}</span>
							</button>
						{/each}
						{#if $creatableFileTypes.length > 0}
							<div class="border-t border-surface-600 my-1"></div>
						{/if}
						<button onclick={() => { showNewMenu = false; showNewFolder = true; newFolderName = ''; }}
							class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer flex items-center gap-2">
							<span class="text-sm">{'\uD83D\uDCC1'}</span>
							<span>Folder</span>
						</button>
					</div>
				{/if}
			</div>

			<!-- Up button -->
			{#if !isAtRoot}
				<button onclick={navigateUp}
					class="px-3 py-1.5 rounded-lg text-xs bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600 cursor-pointer">
					{'\u2191'} Up
				</button>
			{/if}
		</div>

		<!-- Breadcrumbs -->
		{#if breadcrumbs.length > 0}
			<div class="flex items-center gap-1 mt-2 text-xs text-surface-500">
				<button onclick={() => navigateTo($briefcaseRoot)} class="hover:text-surface-300 cursor-pointer">{'\uD83D\uDCBC'}</button>
				{#each breadcrumbs as crumb, i}
					<span>{'\u203A'}</span>
					<button onclick={() => navigateTo($briefcaseRoot + '/' + breadcrumbs.slice(0, i + 1).join('/'))}
						class="hover:text-surface-300 cursor-pointer">{crumb}</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto">
		<!-- New folder inline -->
		{#if showNewFolder}
			<div class="px-4 py-2 border-b border-surface-700/50">
				<!-- svelte-ignore a11y_autofocus -->
				<input type="text" bind:value={newFolderName}
					onkeydown={(e) => { if (e.key === 'Enter') commitNewFolder(); if (e.key === 'Escape') showNewFolder = false; }}
					onblur={commitNewFolder} autofocus placeholder="Folder name..."
					class="w-48 px-3 py-1.5 text-xs rounded-lg bg-surface-700 border border-hecate-500/50 text-surface-100 placeholder:text-surface-500 outline-none" />
			</div>
		{/if}

		{#if $briefcaseLoading && $entries.length === 0}
			<div class="flex items-center justify-center py-20">
				<div class="text-center text-surface-400">
					<div class="text-2xl mb-2 animate-pulse">{'\uD83D\uDCBC'}</div>
					<div class="text-xs">Loading...</div>
				</div>
			</div>
		{:else if $entries.length === 0}
			<div class="flex flex-col items-center justify-center py-20 gap-3">
				<span class="text-3xl">{'\uD83D\uDCC2'}</span>
				<p class="text-sm text-surface-400">Empty folder</p>
				<p class="text-xs text-surface-500">Create documents or folders to get started</p>
			</div>
		{:else}
			<div class="divide-y divide-surface-700/50">
				{#each $entries as entry (entry.path)}
					<button
						class="flex items-center gap-3 w-full px-4 py-2.5 text-left cursor-pointer hover:bg-surface-700/50 transition-colors"
						onclick={() => openEntry(entry)}
						oncontextmenu={(e) => onContextMenu(e, entry)}
					>
						<span class="text-sm shrink-0">{entryIcon(entry)}</span>

						{#if renamingPath === entry.path}
							<!-- svelte-ignore a11y_autofocus -->
							<input type="text" bind:value={renameValue}
								onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingPath = null; }}
								onblur={() => commitRename()} onclick={(e) => e.stopPropagation()} autofocus
								class="flex-1 text-xs bg-surface-700 text-surface-100 px-2 py-0.5 rounded outline-none border border-hecate-500/50" />
						{:else}
							<span class="text-xs text-surface-200 flex-1 truncate">{entry.name}</span>
						{/if}

						{#if !entry.isDir && entry.extension}
							<span class="text-[9px] text-surface-500 shrink-0">{entry.extension}</span>
						{:else if entry.isDir}
							<span class="text-[9px] text-surface-500 shrink-0">Folder</span>
						{/if}

						<span role="button" tabindex="-1"
							onclick={(e) => { e.stopPropagation(); toggleStar(entry.path); }}
							onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleStar(entry.path); } }}
							class="text-[10px] shrink-0 cursor-pointer hover:scale-125 transition-transform
								{isStarred(entry.path, $meta) ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}">
							{isStarred(entry.path, $meta) ? '\u2605' : '\u2606'}
						</span>

						{#if entry.size > 0}
							<span class="text-[9px] text-surface-500 w-14 text-right shrink-0">{formatFileSize(entry.size)}</span>
						{:else}
							<span class="w-14 shrink-0"></span>
						{/if}

						<span class="text-[9px] text-surface-500 w-28 text-right shrink-0">{formatDate(entry.modifiedAt)}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Context menu -->
{#if contextMenu}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<menu class="fixed z-50 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 min-w-[140px] list-none m-0 p-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}>
		{#if contextMenu.entry.isDir}
			<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { openEntry(contextMenu!.entry); contextMenu = null; }}>Open</button>
		{:else}
			<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { openEntry(contextMenu!.entry); contextMenu = null; }}>Edit</button>
		{/if}
		<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => startRename(contextMenu!.entry)}>Rename</button>
		<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => { toggleStar(contextMenu!.entry.path); contextMenu = null; }}>
			{isStarred(contextMenu.entry.path, $meta) ? 'Unstar' : 'Star'}
		</button>
		<div class="border-t border-surface-600 my-1"></div>
		<button class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => handleDelete(contextMenu!.entry)}>Delete</button>
	</menu>
{/if}

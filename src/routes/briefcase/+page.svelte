<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		items, briefcaseLoading, briefcaseError, selectedFolderId,
		folderTree, folderMap,
		fetchFolders, fetchItems,
		createItem, createFolder,
		renameItem, moveItem, starItem, unstarItem, archiveItem,
		itemIcon, formatFileSize,
		creatableFileTypes, type RegisteredFileType,
		type BriefcaseItem, type FolderNode
	} from '$lib/stores/briefcase';
	import { resolveEmoji } from '$lib/emoji';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

	// --- State ---
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');
	let expandedFolders = $state(new Set<string>());
	let contextMenu = $state<{ x: number; y: number; item: BriefcaseItem } | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let showNewFolder = $state(false);
	let newFolderName = $state('');
	let showNewMenu = $state(false);

	// --- Derived ---
	let currentFolderId = $derived($selectedFolderId);

	/** Non-folder items in current view */
	let displayedItems = $derived.by(() => {
		let list = $items.filter((i) => i.kind !== 'folder');
		if (currentFolderId === 'starred') {
			list = list.filter((i) => i.starred);
		} else if (currentFolderId !== 'all') {
			list = list.filter((i) => i.parent_id === currentFolderId);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter((i) => i.name.toLowerCase().includes(q));
		}
		return list.sort((a, b) => b.updated_at - a.updated_at);
	});

	/** Subfolders in current view */
	let displayedFolders = $derived.by(() => {
		if (currentFolderId === 'all' || currentFolderId === 'starred') return [];
		return $items.filter((i) => i.kind === 'folder' && i.parent_id === currentFolderId);
	});

	let breadcrumbs = $derived.by(() => {
		if (currentFolderId === 'all' || currentFolderId === 'starred') return [];
		const crumbs: BriefcaseItem[] = [];
		let id: string | null = currentFolderId;
		const map = $folderMap;
		while (id) {
			const folder = map.get(id);
			if (!folder) break;
			crumbs.unshift(folder);
			id = folder.parent_id;
		}
		return crumbs;
	});

	// --- Load ---
	onMount(async () => {
		await fetchFolders();
		await loadItems();
	});

	async function loadItems() {
		const params: Record<string, unknown> = {};
		if (currentFolderId === 'starred') {
			params.starred = true;
		} else if (currentFolderId !== 'all') {
			params.parent_id = currentFolderId;
		}
		if (searchQuery.trim()) params.search = searchQuery;
		await fetchItems(params as any);
	}

	function selectFolder(id: string | 'all' | 'starred') {
		selectedFolderId.set(id);
		searchQuery = '';
		loadItems();
	}

	// --- Folder tree ---
	function toggleExpand(folderId: string) {
		const next = new Set(expandedFolders);
		if (next.has(folderId)) next.delete(folderId);
		else next.add(folderId);
		expandedFolders = next;
	}

	// --- Create folder ---
	function startNewFolder(parentId: string | null) {
		newFolderName = '';
		showNewFolder = true;
		showNewMenu = false;
	}

	async function commitNewFolder() {
		const name = newFolderName.trim();
		if (!name) { showNewFolder = false; return; }
		const parentId = currentFolderId === 'all' || currentFolderId === 'starred' ? undefined : currentFolderId;
		const id = await createFolder(name, parentId);
		showNewFolder = false;
		if (id) {
			toastSuccess(`Folder "${name}" created`);
			await loadItems();
		}
	}

	// --- Create blob item from plugin ---
	async function createNewBlobItem(ft: RegisteredFileType) {
		showNewMenu = false;
		const parentId = currentFolderId === 'all' || currentFolderId === 'starred' ? undefined : currentFolderId;
		const itemId = await createItem({
			name: `Untitled ${ft.label}`,
			kind: 'blob',
			plugin: ft.plugin,
			file_type: ft.type,
			icon: ft.icon,
			parent_id: parentId,
		});
		if (itemId) {
			goto(`/plugin/${ft.plugin}?item_id=${itemId}`);
		}
	}

	// --- Rename ---
	function startRename(item: BriefcaseItem) {
		renamingId = item.item_id;
		renameValue = item.name;
		contextMenu = null;
	}

	async function commitRename() {
		const name = renameValue.trim();
		if (!name || !renamingId) { renamingId = null; return; }
		await renameItem(renamingId, name);
		renamingId = null;
		await loadItems();
		await fetchFolders();
	}

	// --- Context menu ---
	function onContextMenu(e: MouseEvent, item: BriefcaseItem) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, item };
	}

	function closeContextMenu() { contextMenu = null; }

	// --- Item actions ---
	function openItem(item: BriefcaseItem) {
		if (item.kind === 'folder') {
			selectFolder(item.item_id);
		} else if (item.plugin) {
			goto(`/plugin/${item.plugin}?item_id=${item.item_id}`);
		} else if (item.kind === 'symlink' && item.path) {
			// TODO: open with appropriate handler
			toastError('Symlink viewing not yet implemented');
		}
	}

	async function toggleStar(item: BriefcaseItem) {
		if (item.starred) await unstarItem(item.item_id);
		else await starItem(item.item_id);
		await loadItems();
	}

	async function handleArchive(item: BriefcaseItem) {
		await archiveItem(item.item_id);
		if (item.kind === 'folder' && currentFolderId === item.item_id) selectFolder('all');
		toastSuccess(`"${item.name}" archived`);
		contextMenu = null;
		await loadItems();
		await fetchFolders();
	}

	// --- Import ---
	async function handleImport() {
		try {
			const dialogPkg = '@tauri-apps/plugin-dialog';
			const fsPkg = '@tauri-apps/plugin-fs';
			const dialogMod: any = await import(/* @vite-ignore */ dialogPkg);
			const fsMod: any = await import(/* @vite-ignore */ fsPkg);
			const selected = await dialogMod.open({ multiple: true, title: 'Add files to Briefcase' });
			if (!selected) return;
			const paths: string[] = Array.isArray(selected) ? selected : [selected];
			const parentId = currentFolderId === 'all' || currentFolderId === 'starred' ? undefined : currentFolderId;
			for (const filePath of paths) {
				const name = filePath.split('/').pop() ?? 'file';
				await createItem({
					name,
					kind: 'symlink',
					path: filePath,
					parent_id: parentId,
				});
			}
			await loadItems();
			toastSuccess(`${paths.length} file(s) added`);
		} catch {
			// Tauri not available or user cancelled
		}
	}

	function onWindowClick() {
		if (contextMenu) closeContextMenu();
		if (showNewMenu) showNewMenu = false;
	}

	function formatDate(ts: number): string {
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

			<!-- New button with dropdown -->
			<div class="flex items-center gap-2">
				<div class="relative">
					<button
						onclick={(e) => { e.stopPropagation(); showNewMenu = !showNewMenu; }}
						class="px-3 py-1.5 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 transition-colors cursor-pointer"
					>
						+ New {'\u25BE'}
					</button>
					{#if showNewMenu}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="absolute top-full left-0 mt-1 w-48 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 z-50"
							onclick={(e) => e.stopPropagation()}>
							{#each $creatableFileTypes as ft (ft.type)}
								<button
									onclick={() => createNewBlobItem(ft)}
									class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer flex items-center gap-2"
								>
									<span class="text-sm">{resolveEmoji(ft.icon)}</span>
									<span>{ft.label}</span>
								</button>
							{/each}
							{#if $creatableFileTypes.length > 0}
								<div class="border-t border-surface-600 my-1"></div>
							{/if}
							<button
								onclick={() => startNewFolder(null)}
								class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer flex items-center gap-2"
							>
								<span class="text-sm">{'\uD83D\uDCC1'}</span>
								<span>Folder</span>
							</button>
						</div>
					{/if}
				</div>
				<button
					onclick={handleImport}
					class="px-3 py-1.5 rounded-lg text-xs bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600 transition-colors cursor-pointer"
				>
					Import
				</button>
			</div>

			<!-- Search -->
			<div class="relative">
				<input
					type="text"
					bind:value={searchQuery}
					oninput={() => loadItems()}
					placeholder="Search..."
					class="w-40 px-3 py-1.5 pl-7 text-xs rounded-lg bg-surface-700 border border-surface-600
						text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-hecate-500/50"
				/>
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 text-[10px]">{'\uD83D\uDD0D'}</span>
			</div>

			<!-- View toggle -->
			<div class="flex rounded-lg border border-surface-600 overflow-hidden">
				<button
					onclick={() => (viewMode = 'grid')}
					class="px-2 py-1.5 text-[10px] cursor-pointer transition-colors
						{viewMode === 'grid' ? 'bg-surface-600 text-surface-100' : 'bg-surface-700 text-surface-500 hover:text-surface-300'}"
				>{'\u25A6'}</button>
				<button
					onclick={() => (viewMode = 'list')}
					class="px-2 py-1.5 text-[10px] cursor-pointer transition-colors
						{viewMode === 'list' ? 'bg-surface-600 text-surface-100' : 'bg-surface-700 text-surface-500 hover:text-surface-300'}"
				>{'\u2630'}</button>
			</div>
		</div>
	</div>

	<!-- Two-panel layout -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Folder tree (left panel) -->
		<div class="w-52 shrink-0 border-r border-surface-600 overflow-y-auto bg-surface-800/30">
			<div class="py-2">
				<button
					onclick={() => selectFolder('all')}
					class="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors
						{currentFolderId === 'all' ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
				>
					<span class="text-sm">{'\uD83D\uDCBC'}</span>
					<span>All Items</span>
				</button>
				<button
					onclick={() => selectFolder('starred')}
					class="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors
						{currentFolderId === 'starred' ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
				>
					<span class="text-sm">{'\u2B50'}</span>
					<span>Starred</span>
				</button>

				<div class="border-t border-surface-700 my-2"></div>

				{#each $folderTree as node (node.item_id)}
					{@render folderNode(node, 0)}
				{/each}

				{#if $folderTree.length === 0}
					<div class="px-3 py-4 text-[10px] text-surface-500 text-center">No folders yet</div>
				{/if}
			</div>
		</div>

		<!-- Content (right panel) -->
		<div class="flex-1 overflow-y-auto">
			<!-- Breadcrumbs -->
			{#if breadcrumbs.length > 0}
				<div class="flex items-center gap-1 px-4 py-2 text-xs text-surface-500 border-b border-surface-700/50">
					<button onclick={() => selectFolder('all')} class="hover:text-surface-300 cursor-pointer">{'\uD83D\uDCBC'}</button>
					{#each breadcrumbs as crumb}
						<span>{'\u203A'}</span>
						<button onclick={() => selectFolder(crumb.item_id)} class="hover:text-surface-300 cursor-pointer truncate max-w-[120px]">{crumb.name}</button>
					{/each}
				</div>
			{/if}

			<!-- New folder inline -->
			{#if showNewFolder}
				<div class="px-4 py-2 border-b border-surface-700/50">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={newFolderName}
						onkeydown={(e) => { if (e.key === 'Enter') commitNewFolder(); if (e.key === 'Escape') showNewFolder = false; }}
						onblur={commitNewFolder}
						autofocus
						placeholder="Folder name..."
						class="w-48 px-3 py-1.5 text-xs rounded-lg bg-surface-700 border border-hecate-500/50
							text-surface-100 placeholder:text-surface-500 outline-none"
					/>
				</div>
			{/if}

			{#if $briefcaseLoading && displayedItems.length === 0 && displayedFolders.length === 0}
				<div class="flex items-center justify-center py-20">
					<div class="text-center text-surface-400">
						<div class="text-2xl mb-2 animate-pulse">{'\uD83D\uDCBC'}</div>
						<div class="text-xs">Loading...</div>
					</div>
				</div>
			{:else if displayedItems.length === 0 && displayedFolders.length === 0}
				<div class="flex flex-col items-center justify-center py-20 gap-3">
					<span class="text-3xl">{'\uD83D\uDCC2'}</span>
					<p class="text-sm text-surface-400">No items here yet</p>
					<p class="text-xs text-surface-500">Create documents or add files to get started</p>
				</div>
			{:else}
				<!-- Grid / List view -->
				{#if viewMode === 'grid'}
					<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-4">
						{#each displayedFolders as item (item.item_id)}
							{@render gridCard(item)}
						{/each}
						{#each displayedItems as item (item.item_id)}
							{@render gridCard(item)}
						{/each}
					</div>
				{:else}
					<div class="divide-y divide-surface-700/50">
						{#each displayedFolders as item (item.item_id)}
							{@render listRow(item)}
						{/each}
						{#each displayedItems as item (item.item_id)}
							{@render listRow(item)}
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<!-- Context menu -->
{#if contextMenu}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<menu
		class="fixed z-50 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 min-w-[140px] list-none m-0 p-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
	>
		{#if contextMenu.item.kind === 'folder'}
			<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { selectFolder(contextMenu!.item.item_id); contextMenu = null; }}>Open</button>
		{:else}
			<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { openItem(contextMenu!.item); contextMenu = null; }}>Open</button>
		{/if}
		<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => startRename(contextMenu!.item)}>Rename</button>
		<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => { toggleStar(contextMenu!.item); contextMenu = null; }}>{contextMenu.item.starred ? 'Unstar' : 'Star'}</button>
		{#if contextMenu.item.kind === 'folder'}
			<button class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { startNewFolder(contextMenu!.item.item_id); contextMenu = null; }}>New Subfolder</button>
		{/if}
		<div class="border-t border-surface-600 my-1"></div>
		<button class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 rounded cursor-pointer"
			onclick={() => handleArchive(contextMenu!.item)}>Archive</button>
	</menu>
{/if}

{#snippet gridCard(item: BriefcaseItem)}
	<button
		class="group flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
			border border-surface-600/30 bg-surface-800/50
			hover:border-accent-500/30 hover:bg-surface-700/60 transition-all"
		onclick={() => openItem(item)}
		oncontextmenu={(e) => onContextMenu(e, item)}
	>
		<div class="relative">
			<span class="text-2xl group-hover:scale-110 transition-transform inline-block">
				{resolveEmoji(item.icon) || itemIcon(item)}
			</span>
			{#if item.starred}
				<span class="absolute -top-1 -right-2 text-[10px]">{'\u2B50'}</span>
			{/if}
		</div>
		{#if renamingId === item.item_id}
			<!-- svelte-ignore a11y_autofocus -->
			<input type="text" bind:value={renameValue}
				onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
				onblur={() => commitRename()} onclick={(e) => e.stopPropagation()} autofocus
				class="w-full text-xs text-center bg-surface-700 text-surface-100 px-1 py-0.5 rounded outline-none border border-hecate-500/50" />
		{:else}
			<span class="text-xs text-surface-200 text-center leading-tight line-clamp-2 group-hover:text-accent-400">{item.name}</span>
		{/if}
		<div class="flex items-center gap-1.5 text-[9px] text-surface-500">
			{#if item.kind === 'folder'}
				<span>Folder</span>
			{:else if item.file_type}
				<span class="capitalize">{item.file_type}</span>
			{/if}
			{#if item.size > 0}
				<span>{'\u00B7'}</span>
				<span>{formatFileSize(item.size)}</span>
			{/if}
			<span>{'\u00B7'}</span>
			<span>{formatDate(item.updated_at)}</span>
		</div>
	</button>
{/snippet}

{#snippet listRow(item: BriefcaseItem)}
	<button
		class="flex items-center gap-3 w-full px-4 py-2.5 text-left cursor-pointer hover:bg-surface-700/50 transition-colors"
		onclick={() => openItem(item)}
		oncontextmenu={(e) => onContextMenu(e, item)}
	>
		<span class="text-sm shrink-0">{resolveEmoji(item.icon) || itemIcon(item)}</span>
		{#if renamingId === item.item_id}
			<!-- svelte-ignore a11y_autofocus -->
			<input type="text" bind:value={renameValue}
				onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
				onblur={() => commitRename()} onclick={(e) => e.stopPropagation()} autofocus
				class="flex-1 text-xs bg-surface-700 text-surface-100 px-2 py-0.5 rounded outline-none border border-hecate-500/50" />
		{:else}
			<span class="text-xs text-surface-200 flex-1 truncate">{item.name}</span>
		{/if}
		{#if item.kind !== 'folder' && item.file_type}
			<span class="text-[9px] text-surface-500 capitalize shrink-0">{item.file_type}</span>
		{:else if item.kind === 'folder'}
			<span class="text-[9px] text-surface-500 shrink-0">Folder</span>
		{/if}
		<span
			role="button" tabindex="-1"
			onclick={(e) => { e.stopPropagation(); toggleStar(item); }}
			onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleStar(item); } }}
			class="text-[10px] shrink-0 cursor-pointer hover:scale-125 transition-transform
				{item.starred ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}"
		>{item.starred ? '\u2605' : '\u2606'}</span>
		{#if item.size > 0}
			<span class="text-[9px] text-surface-500 w-14 text-right shrink-0">{formatFileSize(item.size)}</span>
		{:else}
			<span class="w-14 shrink-0"></span>
		{/if}
		<span class="text-[9px] text-surface-500 w-28 text-right shrink-0">{formatDate(item.updated_at)}</span>
	</button>
{/snippet}

{#snippet folderNode(node: FolderNode, depth: number)}
	<div>
		<button
			class="flex items-center gap-1.5 w-full py-1.5 text-xs cursor-pointer transition-colors
				{currentFolderId === node.item_id ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
			style="padding-left: {12 + depth * 16}px; padding-right: 8px;"
			onclick={() => selectFolder(node.item_id)}
			oncontextmenu={(e) => onContextMenu(e, node)}
		>
			{#if node.children.length > 0}
				<span class="text-[8px] text-surface-500 cursor-pointer transition-transform inline-block
					{expandedFolders.has(node.item_id) ? 'rotate-90' : ''}"
					role="button" tabindex="-1"
					onclick={(e) => { e.stopPropagation(); toggleExpand(node.item_id); }}
				>{'\u25B6'}</span>
			{:else}
				<span class="w-2"></span>
			{/if}
			<span class="text-sm leading-none">{resolveEmoji(node.icon) || '\uD83D\uDCC1'}</span>
			{#if renamingId === node.item_id}
				<!-- svelte-ignore a11y_autofocus -->
				<input type="text" bind:value={renameValue}
					onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
					onblur={() => commitRename()} onclick={(e) => e.stopPropagation()} autofocus
					class="flex-1 bg-surface-700 text-surface-100 text-xs px-1 py-0.5 rounded outline-none border border-hecate-500/50" />
			{:else}
				<span class="truncate">{node.name}</span>
			{/if}
		</button>
		{#if expandedFolders.has(node.item_id) && node.children.length > 0}
			{#each node.children as child (child.item_id)}
				{@render folderNode(child, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

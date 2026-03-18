<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get as apiGet } from '$lib/api';
	import {
		folders, files, briefcaseLoading, briefcaseError, selectedFolderId,
		folderTree, folderMap,
		fetchFolders, fetchFiles,
		createFolder, renameFolder, archiveFolder,
		registerFile, renameFile, moveFile, starFile, unstarFile, archiveFile, importFile,
		fileIcon, formatFileSize,
		creatableFileTypes, type RegisteredFileType,
		type Folder, type FileMeta, type FolderNode
	} from '$lib/stores/briefcase';
	import { resolveEmoji } from '$lib/emoji';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

	// --- State ---
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');
	let expandedFolders = $state(new Set<string>());
	let contextMenu = $state<{ x: number; y: number; type: 'folder' | 'file'; item: Folder | FileMeta } | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let newFolderParent = $state<string | null>(null);
	let newFolderName = $state('');
	let showNewFolder = $state(false);

	// --- Derived ---
	let currentFolderId = $derived($selectedFolderId);

	let displayedFiles = $derived.by(() => {
		let list = $files;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter((f) => f.name.toLowerCase().includes(q));
		}
		return list.sort((a, b) => b.updated_at - a.updated_at);
	});

	let breadcrumbs = $derived.by(() => {
		if (currentFolderId === 'all' || currentFolderId === 'starred') return [];
		const crumbs: Folder[] = [];
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
		await loadFiles();
	});

	async function loadFiles() {
		const params: Record<string, unknown> = {};
		if (currentFolderId === 'starred') {
			params.starred = true;
		} else if (currentFolderId !== 'all') {
			params.folder_id = currentFolderId;
		}
		if (searchQuery.trim()) params.search = searchQuery;
		await fetchFiles(params as any);
	}

	function selectFolder(id: string | 'all' | 'starred') {
		selectedFolderId.set(id);
		searchQuery = '';
		loadFiles();
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
		newFolderParent = parentId;
		newFolderName = '';
		showNewFolder = true;
	}

	async function commitNewFolder() {
		const name = newFolderName.trim();
		if (!name) { showNewFolder = false; return; }
		const id = await createFolder(name, newFolderParent ?? undefined);
		showNewFolder = false;
		if (id) toastSuccess(`Folder "${name}" created`);
	}

	// --- Rename ---
	function startRename(type: 'folder' | 'file', id: string, currentName: string) {
		renamingId = id;
		renameValue = currentName;
		contextMenu = null;
	}

	async function commitRename(type: 'folder' | 'file') {
		const name = renameValue.trim();
		if (!name || !renamingId) { renamingId = null; return; }
		if (type === 'folder') {
			await renameFolder(renamingId, name);
		} else {
			await renameFile(renamingId, name);
			await loadFiles();
		}
		renamingId = null;
	}

	// --- Context menu ---
	function onContextMenu(e: MouseEvent, type: 'folder' | 'file', item: Folder | FileMeta) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, type, item };
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	// --- File actions ---
	function openFile(file: FileMeta) {
		if (file.plugin) {
			goto(`/plugin/${file.plugin}?file_id=${file.file_id}`);
		} else if (file.blob_id) {
			// Raw file — could open preview or download
			window.open(`/api/briefcase/files/${file.file_id}/blob`, '_blank');
		}
	}

	async function toggleStar(file: FileMeta) {
		if (file.starred) await unstarFile(file.file_id);
		else await starFile(file.file_id);
		await loadFiles();
	}

	async function handleArchiveFile(file: FileMeta) {
		await archiveFile(file.file_id);
		await loadFiles();
		toastSuccess(`"${file.name}" archived`);
		contextMenu = null;
	}

	async function handleArchiveFolder(folder: Folder) {
		await archiveFolder(folder.folder_id);
		if (currentFolderId === folder.folder_id) selectFolder('all');
		toastSuccess(`Folder "${folder.name}" archived`);
		contextMenu = null;
	}

	// --- Import ---
	async function handleImport() {
		try {
			// Dynamic imports — Tauri plugins may not be available in dev mode
			// Use string variable to bypass TypeScript module resolution
			const dialogPkg = '@tauri-apps/plugin-dialog';
			const fsPkg = '@tauri-apps/plugin-fs';
			const dialogMod: any = await import(/* @vite-ignore */ dialogPkg);
			const fsMod: any = await import(/* @vite-ignore */ fsPkg);
			const selected = await dialogMod.open({ multiple: true, title: 'Import files to Briefcase' });
			if (!selected) return;
			const paths: string[] = Array.isArray(selected) ? selected : [selected];
			for (const path of paths) {
				const bytes: Uint8Array = await fsMod.readFile(path);
				const name = path.split('/').pop() ?? 'imported-file';
				const base64 = btoa(String.fromCharCode(...bytes));
				const folderId = currentFolderId === 'all' || currentFolderId === 'starred' ? null : currentFolderId;
				await importFile(name, folderId, base64);
			}
			await loadFiles();
			toastSuccess(`${paths.length} file(s) imported`);
		} catch {
			// Tauri not available (dev mode) or user cancelled
		}
	}

	// --- New file from plugin ---
	let showNewMenu = $state(false);

	async function createNewFile(ft: RegisteredFileType) {
		showNewMenu = false;
		const folderId = currentFolderId === 'all' || currentFolderId === 'starred' ? undefined : currentFolderId;
		const fileId = await registerFile({
			name: `Untitled ${ft.label}`,
			file_type: ft.type,
			plugin: ft.plugin,
			folder_id: folderId,
			icon: ft.icon,
		});
		if (fileId) {
			// Open in the plugin's editor
			goto(`/plugin/${ft.plugin}?file_id=${fileId}`);
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
						onclick={() => (showNewMenu = !showNewMenu)}
						class="px-3 py-1.5 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 transition-colors cursor-pointer"
					>
						+ New {'\u25BE'}
					</button>
					{#if showNewMenu}
						<div class="absolute top-full left-0 mt-1 w-48 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 z-50">
							{#each $creatableFileTypes as ft (ft.type)}
								<button
									onclick={() => createNewFile(ft)}
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
								onclick={() => { showNewMenu = false; startNewFolder(currentFolderId === 'all' || currentFolderId === 'starred' ? null : currentFolderId); }}
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
					oninput={() => loadFiles()}
					placeholder="Search files..."
					class="w-48 px-3 py-1.5 pl-7 text-xs rounded-lg bg-surface-700 border border-surface-600
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
					title="Grid view"
				>{'\u25A6'}</button>
				<button
					onclick={() => (viewMode = 'list')}
					class="px-2 py-1.5 text-[10px] cursor-pointer transition-colors
						{viewMode === 'list' ? 'bg-surface-600 text-surface-100' : 'bg-surface-700 text-surface-500 hover:text-surface-300'}"
					title="List view"
				>{'\u2630'}</button>
			</div>
		</div>
	</div>

	<!-- Two-panel layout -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Folder tree (left panel) -->
		<div class="w-52 shrink-0 border-r border-surface-600 overflow-y-auto bg-surface-800/30">
			<div class="py-2">
				<!-- Virtual entries -->
				<button
					onclick={() => selectFolder('all')}
					class="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors
						{currentFolderId === 'all' ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
				>
					<span class="text-sm">{'\uD83D\uDCBC'}</span>
					<span>All Files</span>
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

				<!-- Folder tree -->
				{#each $folderTree as node (node.folder_id)}
					{@render folderNode(node, 0)}
				{/each}

				{#if $folderTree.length === 0}
					<div class="px-3 py-4 text-[10px] text-surface-500 text-center">
						No folders yet
					</div>
				{/if}
			</div>
		</div>

		<!-- File list (right panel) -->
		<div class="flex-1 overflow-y-auto">
			<!-- Breadcrumbs -->
			{#if breadcrumbs.length > 0}
				<div class="flex items-center gap-1 px-4 py-2 text-xs text-surface-500 border-b border-surface-700/50">
					<button onclick={() => selectFolder('all')} class="hover:text-surface-300 cursor-pointer">{'\uD83D\uDCBC'}</button>
					{#each breadcrumbs as crumb, i}
						<span>{'\u203A'}</span>
						<button
							onclick={() => selectFolder(crumb.folder_id)}
							class="hover:text-surface-300 cursor-pointer truncate max-w-[120px]"
						>{crumb.name}</button>
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
						onkeydown={(e) => {
							if (e.key === 'Enter') commitNewFolder();
							if (e.key === 'Escape') { showNewFolder = false; }
						}}
						onblur={commitNewFolder}
						autofocus
						placeholder="Folder name..."
						class="w-48 px-3 py-1.5 text-xs rounded-lg bg-surface-700 border border-hecate-500/50
							text-surface-100 placeholder:text-surface-500 outline-none"
					/>
				</div>
			{/if}

			{#if $briefcaseLoading && displayedFiles.length === 0}
				<div class="flex items-center justify-center py-20">
					<div class="text-center text-surface-400">
						<div class="text-2xl mb-2 animate-pulse">{'\uD83D\uDCBC'}</div>
						<div class="text-xs">Loading...</div>
					</div>
				</div>
			{:else if displayedFiles.length === 0}
				<div class="flex flex-col items-center justify-center py-20 gap-3">
					<span class="text-3xl">{'\uD83D\uDCC2'}</span>
					<p class="text-sm text-surface-400">No files here yet</p>
					<p class="text-xs text-surface-500">Import files or create documents to get started</p>
					<div class="flex gap-2 mt-2">
						<button
							onclick={handleImport}
							class="px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
						>
							Import File
						</button>
						<button
							onclick={() => startNewFolder(currentFolderId === 'all' || currentFolderId === 'starred' ? null : currentFolderId)}
							class="px-4 py-2 rounded-lg text-xs bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600 cursor-pointer"
						>
							New Folder
						</button>
					</div>
				</div>
			{:else if viewMode === 'grid'}
				<!-- Grid view -->
				<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-4">
					{#each displayedFiles as file (file.file_id)}
						<button
							class="group flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
								border border-surface-600/30 bg-surface-800/50
								hover:border-accent-500/30 hover:bg-surface-700/60 transition-all"
							onclick={() => openFile(file)}
							oncontextmenu={(e) => onContextMenu(e, 'file', file)}
						>
							<div class="relative">
								<span class="text-2xl group-hover:scale-110 transition-transform inline-block">
									{file.icon || fileIcon(file.file_type)}
								</span>
								{#if file.starred}
									<span class="absolute -top-1 -right-2 text-[10px]">{'\u2B50'}</span>
								{/if}
							</div>

							{#if renamingId === file.file_id}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									bind:value={renameValue}
									onkeydown={(e) => {
										e.stopPropagation();
										if (e.key === 'Enter') commitRename('file');
										if (e.key === 'Escape') { renamingId = null; }
									}}
									onblur={() => commitRename('file')}
									onclick={(e) => e.stopPropagation()}
									autofocus
									class="w-full text-xs text-center bg-surface-700 text-surface-100 px-1 py-0.5 rounded outline-none border border-hecate-500/50"
								/>
							{:else}
								<span class="text-xs text-surface-200 text-center leading-tight line-clamp-2 group-hover:text-accent-400">
									{file.name}
								</span>
							{/if}

							<div class="flex items-center gap-1.5 text-[9px] text-surface-500">
								{#if file.plugin}
									<span class="capitalize">{file.file_type}</span>
								{:else if file.size > 0}
									<span>{formatFileSize(file.size)}</span>
								{/if}
								<span>{'\u00B7'}</span>
								<span>{formatDate(file.updated_at)}</span>
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<!-- List view -->
				<div class="divide-y divide-surface-700/50">
					{#each displayedFiles as file (file.file_id)}
						<button
							class="flex items-center gap-3 w-full px-4 py-2.5 text-left cursor-pointer
								hover:bg-surface-700/50 transition-colors"
							onclick={() => openFile(file)}
							oncontextmenu={(e) => onContextMenu(e, 'file', file)}
						>
							<span class="text-sm shrink-0">{file.icon || fileIcon(file.file_type)}</span>

							{#if renamingId === file.file_id}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									bind:value={renameValue}
									onkeydown={(e) => {
										e.stopPropagation();
										if (e.key === 'Enter') commitRename('file');
										if (e.key === 'Escape') { renamingId = null; }
									}}
									onblur={() => commitRename('file')}
									onclick={(e) => e.stopPropagation()}
									autofocus
									class="flex-1 text-xs bg-surface-700 text-surface-100 px-2 py-0.5 rounded outline-none border border-hecate-500/50"
								/>
							{:else}
								<span class="text-xs text-surface-200 flex-1 truncate">{file.name}</span>
							{/if}

							{#if file.plugin}
								<span class="text-[9px] text-surface-500 capitalize shrink-0">{file.file_type}</span>
							{/if}

							<span
								role="button"
								tabindex="-1"
								onclick={(e) => { e.stopPropagation(); toggleStar(file); }}
								onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleStar(file); } }}
								class="text-[10px] shrink-0 cursor-pointer hover:scale-125 transition-transform
									{file.starred ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}"
							>
								{file.starred ? '\u2605' : '\u2606'}
							</span>

							{#if file.size > 0}
								<span class="text-[9px] text-surface-500 w-14 text-right shrink-0">{formatFileSize(file.size)}</span>
							{:else}
								<span class="w-14 shrink-0"></span>
							{/if}

							<span class="text-[9px] text-surface-500 w-28 text-right shrink-0">{formatDate(file.updated_at)}</span>
						</button>
					{/each}
				</div>
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
		{#if contextMenu.type === 'file'}
			{@const file = contextMenu.item as FileMeta}
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { openFile(file); contextMenu = null; }}
			>
				Open
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => startRename('file', file.file_id, file.name)}
			>
				Rename
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { toggleStar(file); contextMenu = null; }}
			>
				{file.starred ? 'Unstar' : 'Star'}
			</button>
			<div class="border-t border-surface-600 my-1"></div>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => handleArchiveFile(file)}
			>
				Archive
			</button>
		{:else}
			{@const folder = contextMenu.item as Folder}
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => startRename('folder', folder.folder_id, folder.name)}
			>
				Rename
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => { startNewFolder(folder.folder_id); contextMenu = null; }}
			>
				New Subfolder
			</button>
			<div class="border-t border-surface-600 my-1"></div>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => handleArchiveFolder(folder)}
			>
				Delete Folder
			</button>
		{/if}
	</menu>
{/if}

{#snippet folderNode(node: FolderNode, depth: number)}
	<div>
		<button
			class="flex items-center gap-1.5 w-full py-1.5 text-xs cursor-pointer transition-colors
				{currentFolderId === node.folder_id ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
			style="padding-left: {12 + depth * 16}px; padding-right: 8px;"
			onclick={() => selectFolder(node.folder_id)}
			oncontextmenu={(e) => onContextMenu(e, 'folder', node)}
		>
			{#if node.children.length > 0}
				<span
					class="text-[8px] text-surface-500 cursor-pointer transition-transform inline-block
						{expandedFolders.has(node.folder_id) ? 'rotate-90' : ''}"
					role="button"
					tabindex="-1"
					onclick={(e) => { e.stopPropagation(); toggleExpand(node.folder_id); }}
				>{'\u25B6'}</span>
			{:else}
				<span class="w-2"></span>
			{/if}
			<span class="text-sm leading-none">{node.icon || '\uD83D\uDCC1'}</span>

			{#if renamingId === node.folder_id}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={renameValue}
					onkeydown={(e) => {
						e.stopPropagation();
						if (e.key === 'Enter') commitRename('folder');
						if (e.key === 'Escape') { renamingId = null; }
					}}
					onblur={() => commitRename('folder')}
					onclick={(e) => e.stopPropagation()}
					autofocus
					class="flex-1 bg-surface-700 text-surface-100 text-xs px-1 py-0.5 rounded outline-none border border-hecate-500/50"
				/>
			{:else}
				<span class="truncate">{node.name}</span>
			{/if}
		</button>

		{#if expandedFolders.has(node.folder_id) && node.children.length > 0}
			{#each node.children as child (child.folder_id)}
				{@render folderNode(child, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

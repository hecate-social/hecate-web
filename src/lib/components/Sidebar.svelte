<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { studioTabs, type StudioTab } from '$lib/studios';
	import { plugins } from '$lib/stores/plugins.js';
	import {
		sidebarGroups,
		sidebarCollapsed,
		activeAppId,
		ungroupedApps,
		createGroup,
		renameGroup,
		deleteGroup,
		toggleGroupCollapsed,
		moveApp,
		ungroupApp,
		updateGroupIcon,
		syncActiveAppFromRoute,
		type SidebarGroup
	} from '$lib/stores/sidebar.js';
	import { hasPluginUpdate, pluginUpdateVersion, showPluginUpdateModal } from '$lib/stores/pluginUpdater.js';
	import EmojiPicker from './EmojiPicker.svelte';

	// Sync activeAppId from route changes
	$effect(() => {
		const pathname = page.url?.pathname ?? '/';
		syncActiveAppFromRoute(pathname, $studioTabs);
	});

	// --- Drag state ---
	let dragAppId = $state<string | null>(null);
	let dragOverGroupId = $state<string | null>(null);
	let dragOverUngrouped = $state(false);

	// --- Context menu ---
	let contextMenu = $state<{ x: number; y: number; type: 'group' | 'app'; id: string } | null>(null);

	// --- Inline rename ---
	let renamingGroupId = $state<string | null>(null);
	let renameValue = $state('');

	// --- New group ---
	let showNewGroup = $state(false);
	let newGroupName = $state('');

	// --- Emoji picker ---
	let emojiPickerGroupId = $state<string | null>(null);
	let emojiPickerPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

	// --- Helpers ---

	function tabById(id: string): StudioTab | undefined {
		return $studioTabs.find((t) => t.id === id);
	}

	function isPluginOnline(id: string): boolean {
		return $plugins.has(id);
	}

	function isActive(appId: string): boolean {
		return $activeAppId === appId;
	}

	function navigateToApp(tab: StudioTab) {
		activeAppId.set(tab.id);
		goto(tab.path);
	}

	// --- Drag handlers ---

	function onDragStart(e: DragEvent, appId: string) {
		dragAppId = appId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', appId);
		}
	}

	function onDragOverGroup(e: DragEvent, groupId: string) {
		e.preventDefault();
		dragOverGroupId = groupId;
	}

	function onDragOverUngrouped(e: DragEvent) {
		e.preventDefault();
		dragOverUngrouped = true;
	}

	function onDragLeave() {
		dragOverGroupId = null;
		dragOverUngrouped = false;
	}

	function onDropOnGroup(e: DragEvent, groupId: string) {
		e.preventDefault();
		if (dragAppId) moveApp(dragAppId, groupId);
		resetDrag();
	}

	function onDropOnUngrouped(e: DragEvent) {
		e.preventDefault();
		if (dragAppId) ungroupApp(dragAppId);
		resetDrag();
	}

	function onDragEnd() {
		resetDrag();
	}

	function resetDrag() {
		dragAppId = null;
		dragOverGroupId = null;
		dragOverUngrouped = false;
	}

	// --- Context menu ---

	function onContextMenu(e: MouseEvent, type: 'group' | 'app', id: string) {
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, type, id };
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	function handleContextAction(action: string) {
		if (!contextMenu) return;
		const { type, id } = contextMenu;

		if (type === 'group') {
			if (action === 'rename') {
				const group = $sidebarGroups.find((g) => g.id === id);
				if (group) {
					renamingGroupId = id;
					renameValue = group.name;
				}
			} else if (action === 'delete') {
				deleteGroup(id);
			} else if (action === 'change-icon') {
				openEmojiPicker(id, contextMenu.x, contextMenu.y);
			}
		} else if (type === 'app') {
			if (action === 'ungroup') {
				ungroupApp(id);
			}
		}

		closeContextMenu();
	}

	// --- Emoji picker ---

	function openEmojiPicker(groupId: string, x: number, y: number) {
		emojiPickerGroupId = groupId;
		emojiPickerPos = { x, y };
	}

	function onIconClick(e: MouseEvent, groupId: string) {
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		openEmojiPicker(groupId, rect.left, rect.bottom + 4);
	}

	function handleEmojiSelect(emoji: string) {
		if (emojiPickerGroupId) {
			updateGroupIcon(emojiPickerGroupId, emoji);
		}
		closeEmojiPicker();
	}

	function closeEmojiPicker() {
		emojiPickerGroupId = null;
	}

	// --- Inline rename ---

	function commitRename() {
		if (renamingGroupId && renameValue.trim()) {
			renameGroup(renamingGroupId, renameValue.trim());
		}
		renamingGroupId = null;
		renameValue = '';
	}

	function cancelRename() {
		renamingGroupId = null;
		renameValue = '';
	}

	// --- New group ---

	function commitNewGroup() {
		const name = newGroupName.trim();
		if (name) createGroup(name);
		showNewGroup = false;
		newGroupName = '';
	}

	function cancelNewGroup() {
		showNewGroup = false;
		newGroupName = '';
	}

	// Close context menu and emoji picker on outside click
	function onWindowClick() {
		if (contextMenu) closeContextMenu();
		if (emojiPickerGroupId) closeEmojiPicker();
	}
</script>

<svelte:window onclick={onWindowClick} />

<aside
	class="flex flex-col bg-surface-800 border-r border-surface-600 shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-200
		{$sidebarCollapsed ? 'w-12' : 'w-52'}"
>
	<!-- Groups -->
	{#each $sidebarGroups as group (group.id)}
		{@const apps = group.appIds.map(tabById).filter(Boolean) as StudioTab[]}
		<div
			class="border-b border-surface-700/50
				{dragOverGroupId === group.id ? 'bg-hecate-900/20' : ''}"
			ondragover={(e) => onDragOverGroup(e, group.id)}
			ondragleave={onDragLeave}
			ondrop={(e) => onDropOnGroup(e, group.id)}
			role="list"
		>
			<!-- Group header -->
			<button
				class="flex items-center gap-1 w-full h-7 text-[10px] uppercase tracking-wider text-surface-400 hover:text-surface-200 cursor-pointer select-none
					{$sidebarCollapsed ? 'justify-center px-0' : 'px-2'}"
				onclick={() => toggleGroupCollapsed(group.id)}
				oncontextmenu={(e) => onContextMenu(e, 'group', group.id)}
			>
				{#if $sidebarCollapsed}
					<span
						class="text-xs cursor-pointer"
						onclick={(e) => onIconClick(e, group.id)}
					>{group.icon || '\uD83D\uDCC1'}</span>
				{:else}
					<span class="text-[8px] transition-transform {group.collapsed ? '' : 'rotate-90'}">
						{'\u25B6'}
					</span>
					<span
						class="text-xs cursor-pointer hover:scale-110 transition-transform"
						onclick={(e) => onIconClick(e, group.id)}
						title="Change icon"
					>{group.icon || '\uD83D\uDCC1'}</span>
					{#if renamingGroupId === group.id}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="text"
							bind:value={renameValue}
							onkeydown={(e) => {
								if (e.key === 'Enter') commitRename();
								if (e.key === 'Escape') cancelRename();
							}}
							onblur={commitRename}
							autofocus
							class="bg-surface-700 text-surface-100 text-[10px] uppercase tracking-wider px-1 rounded w-full outline-none border border-hecate-500/50"
							onclick={(e) => e.stopPropagation()}
						/>
					{:else}
						<span class="truncate">{group.name}</span>
					{/if}
				{/if}
			</button>

			<!-- Group apps -->
			{#if !group.collapsed}
				{#each apps as tab (tab.id)}
					{@const online = tab.isPlugin ? isPluginOnline(tab.id) : true}
					<button
						draggable="true"
						ondragstart={(e) => onDragStart(e, tab.id)}
						ondragend={onDragEnd}
						class="flex items-center gap-2 w-full h-8 cursor-pointer transition-colors
							{$sidebarCollapsed ? 'justify-center px-0' : 'px-3'}
							{isActive(tab.id)
								? 'bg-surface-700 text-surface-50 border-l-2 border-hecate-500'
								: 'text-surface-300 hover:text-surface-100 hover:bg-surface-700/50 border-l-2 border-transparent'}"
						onclick={() => navigateToApp(tab)}
						oncontextmenu={(e) => onContextMenu(e, 'app', tab.id)}
					>
						<span class="text-sm shrink-0">{tab.icon}</span>
						{#if !$sidebarCollapsed}
							<span class="text-xs truncate flex-1 text-left">{tab.name}</span>
							{#if tab.isPlugin}
								<span class="text-[8px] {online ? 'text-health-ok' : 'text-surface-500'}">{'\u25CF'}</span>
							{/if}
							{#if tab.isPlugin && $hasPluginUpdate(tab.id)}
								<button
									class="px-1 py-0.5 rounded text-[8px] font-semibold bg-hecate-600 hover:bg-hecate-500 text-white cursor-pointer"
									onclick={(e) => { e.stopPropagation(); showPluginUpdateModal.set(tab.id); }}
								>
									v{$pluginUpdateVersion(tab.id)}
								</button>
							{/if}
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/each}

	<!-- Ungrouped section -->
	{#if $ungroupedApps.length > 0}
		{@const ungrouped = $ungroupedApps}
		<div
			class="border-b border-surface-700/50
				{dragOverUngrouped ? 'bg-hecate-900/20' : ''}"
			ondragover={onDragOverUngrouped}
			ondragleave={onDragLeave}
			ondrop={onDropOnUngrouped}
			role="list"
		>
			{#if !$sidebarCollapsed}
				<div class="flex items-center gap-1 px-2 h-7 text-[10px] uppercase tracking-wider text-surface-500">
					<span>Ungrouped</span>
				</div>
			{/if}

			{#each ungrouped as tab (tab.id)}
				{@const online = tab.isPlugin ? isPluginOnline(tab.id) : true}
				<button
					draggable="true"
					ondragstart={(e) => onDragStart(e, tab.id)}
					ondragend={onDragEnd}
					class="flex items-center gap-2 w-full h-8 cursor-pointer transition-colors
						{$sidebarCollapsed ? 'justify-center px-0' : 'px-3'}
						{isActive(tab.id)
							? 'bg-surface-700 text-surface-50 border-l-2 border-hecate-500'
							: 'text-surface-300 hover:text-surface-100 hover:bg-surface-700/50 border-l-2 border-transparent'}"
					onclick={() => navigateToApp(tab)}
					oncontextmenu={(e) => onContextMenu(e, 'app', tab.id)}
				>
					<span class="text-sm shrink-0">{tab.icon}</span>
					{#if !$sidebarCollapsed}
						<span class="text-xs truncate flex-1 text-left">{tab.name}</span>
						{#if tab.isPlugin}
							<span class="text-[8px] {online ? 'text-health-ok' : 'text-surface-500'}">{'\u25CF'}</span>
						{/if}
						{#if tab.isPlugin && $hasPluginUpdate(tab.id)}
							<button
								class="px-1 py-0.5 rounded text-[8px] font-semibold bg-hecate-600 hover:bg-hecate-500 text-white cursor-pointer"
								onclick={(e) => { e.stopPropagation(); showPluginUpdateModal.set(tab.id); }}
							>
								v{$pluginUpdateVersion(tab.id)}
							</button>
						{/if}
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Spacer -->
	<div class="flex-1"></div>

	<!-- New Group button -->
	{#if !$sidebarCollapsed}
		<div class="p-2 border-t border-surface-700/50">
			{#if showNewGroup}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={newGroupName}
					onkeydown={(e) => {
						if (e.key === 'Enter') commitNewGroup();
						if (e.key === 'Escape') cancelNewGroup();
					}}
					onblur={commitNewGroup}
					autofocus
					placeholder="Group name..."
					class="w-full bg-surface-700 text-surface-100 text-[10px] px-2 py-1 rounded outline-none border border-hecate-500/50 placeholder:text-surface-500"
				/>
			{:else}
				<button
					onclick={() => (showNewGroup = true)}
					class="w-full text-[10px] text-surface-500 hover:text-surface-300 py-1 rounded hover:bg-surface-700/50 transition-colors cursor-pointer"
				>
					+ New Group
				</button>
			{/if}
		</div>
	{/if}
</aside>

<!-- Context menu -->
{#if contextMenu}
	<menu
		class="fixed z-50 bg-surface-700 border border-surface-500 rounded shadow-lg py-1 min-w-[120px] list-none m-0 p-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
	>
		{#if contextMenu.type === 'group'}
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer"
				onclick={() => handleContextAction('rename')}
			>
				Rename
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer"
				onclick={() => handleContextAction('change-icon')}
			>
				Change Icon
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 cursor-pointer"
				onclick={() => handleContextAction('delete')}
			>
				Delete Group
			</button>
		{:else if contextMenu.type === 'app'}
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 cursor-pointer"
				onclick={() => handleContextAction('ungroup')}
			>
				Move to Ungrouped
			</button>
		{/if}
	</menu>
{/if}

<!-- Emoji picker -->
{#if emojiPickerGroupId}
	<div
		class="fixed z-[60]"
		style="left: {emojiPickerPos.x}px; top: {emojiPickerPos.y}px;"
	>
		<EmojiPicker
			onSelect={handleEmojiSelect}
			onClose={closeEmojiPicker}
		/>
	</div>
{/if}

<script lang="ts">
	import { open } from '@tauri-apps/plugin-shell';
	import { health, connectionStatus, isStarting } from '$lib/stores/daemon.js';
	import { pluginCards, type PluginCardData } from '$lib/plugins-registry';
	import { plugins } from '$lib/stores/plugins.js';
	import {
		sidebarGroups,
		ungroupedApps,
		createGroup,
		renameGroup,
		deleteGroup,
		toggleGroupCollapsed,
		moveApp,
		ungroupApp,
		updateGroupIcon
	} from '$lib/stores/sidebar.js';
	import { pluginUpdateVersion } from '$lib/stores/pluginUpdater.js';
	import PluginCard from '$lib/components/PluginCard.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import { slide } from 'svelte/transition';

	const DONATE_URL = 'https://buymeacoffee.com/rlefever';

	let cardsMap = $derived(new Map($pluginCards.map((c) => [c.id, c])));

	let ungroupedCards = $derived(
		$ungroupedApps.map((tab) => cardFromId(tab.id))
	);

	let hasContent = $derived(
		$sidebarGroups.length > 0 || ungroupedCards.length > 0
	);

	function cardFromId(id: string): PluginCardData {
		return (
			cardsMap.get(id) ?? {
				id,
				name: id.charAt(0).toUpperCase() + id.slice(1),
				icon: '\uD83D\uDD0C',
				path: `/plugin/${id}`,
				description: 'Plugin not currently available',
				ready: false,
				isPlugin: true
			}
		);
	}

	function findAppGroup(appId: string): string | null {
		const group = $sidebarGroups.find((g) => g.appIds.includes(appId));
		return group?.id ?? null;
	}

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
		}

		closeContextMenu();
	}

	function moveAppToGroup(appId: string, groupId: string) {
		moveApp(appId, groupId);
		closeContextMenu();
	}

	function moveAppToUngrouped(appId: string) {
		ungroupApp(appId);
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

	// Close overlays on outside click
	function onWindowClick() {
		if (contextMenu) closeContextMenu();
		if (emojiPickerGroupId) closeEmojiPicker();
	}
</script>

<svelte:window onclick={onWindowClick} />

<!-- Ambient glow background -->
<div
	class="absolute inset-0 pointer-events-none"
	style="background: radial-gradient(ellipse at center top, rgba(139, 71, 255, 0.08) 0%, rgba(245, 158, 11, 0.04) 30%, rgba(15, 15, 20, 1) 70%);"
></div>

<div class="relative flex flex-col items-center h-full overflow-y-auto py-6 px-6 gap-6">
	<!-- Brand -->
	<div class="flex flex-col items-center gap-2">
		<h1
			class="text-3xl font-bold tracking-wide"
			style="background: linear-gradient(135deg, #fbbf24, #f59e0b, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
		>
			Hecate
		</h1>

		<p class="text-surface-300 text-sm text-center max-w-md">
			Your node, your models, your data.
		</p>
	</div>

	<!-- Status ribbon -->
	<div
		class="flex items-center gap-3 px-4 py-2 rounded-full bg-surface-800/60 border border-surface-600/50 text-xs"
	>
		{#if $connectionStatus === 'connected'}
			<span class="text-health-ok">{'\u{25CF}'}</span>
			<span class="text-surface-200">Connected</span>
			{#if $health}
				<span class="text-surface-500">|</span>
				<span class="text-surface-300">v{$health.version}</span>
			{/if}
		{:else if $isStarting}
			<span class="text-health-warn animate-pulse">{'\u{25CF}'}</span>
			<span class="text-surface-300">Daemon starting...</span>
		{:else if $connectionStatus === 'connecting'}
			<span class="text-health-loading animate-pulse">{'\u{25CF}'}</span>
			<span class="text-surface-300">Connecting to daemon...</span>
		{:else}
			<span class="text-health-err">{'\u{25CF}'}</span>
			<span class="text-surface-400">Daemon not available</span>
		{/if}
	</div>

	<!-- Plugin cards (interactive groups) -->
	{#if hasContent}
		<div class="flex flex-col gap-3 max-w-3xl w-full">
			{#each $sidebarGroups as group (group.id)}
				{@const cards = group.appIds.map((id) => cardFromId(id))}
				<section
					class="rounded-xl border transition-all duration-200
						{dragOverGroupId === group.id
							? 'border-hecate-500/50 ring-2 ring-hecate-500/30 bg-surface-800/90'
							: 'border-surface-600/30 bg-surface-800/50'}"
					ondragover={(e) => onDragOverGroup(e, group.id)}
					ondragleave={onDragLeave}
					ondrop={(e) => onDropOnGroup(e, group.id)}
				>
					<!-- Group header -->
					<button
						class="flex items-center gap-2 w-full px-4 py-2.5 cursor-pointer select-none group/hdr
							text-surface-300 hover:text-surface-100 transition-colors"
						onclick={() => toggleGroupCollapsed(group.id)}
						oncontextmenu={(e) => onContextMenu(e, 'group', group.id)}
					>
						<span
							class="text-[10px] transition-transform duration-200 text-surface-500
								{group.collapsed ? '' : 'rotate-90'}"
						>
							{'\u25B6'}
						</span>
						<span
							class="text-base cursor-pointer hover:scale-110 transition-transform leading-none"
							role="button"
							tabindex="-1"
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
								class="bg-surface-700 text-surface-100 text-sm px-2 py-0.5 rounded w-48 outline-none border border-hecate-500/50"
								onclick={(e) => e.stopPropagation()}
							/>
						{:else}
							<span class="text-sm font-medium truncate">{group.name}</span>
						{/if}
						<span class="text-xs text-surface-500 ml-auto">{cards.length}</span>
					</button>

					<!-- Group content -->
					{#if !group.collapsed}
						<div class="px-4 pb-4" transition:slide={{ duration: 200 }}>
							{#if cards.length > 0}
								<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
									{#each cards as card (card.id)}
										<div
											draggable="true"
											ondragstart={(e) => onDragStart(e, card.id)}
											ondragend={onDragEnd}
											oncontextmenu={(e) => onContextMenu(e, 'app', card.id)}
										>
											<PluginCard
												{card}
												online={!card.isPlugin || $plugins.has(card.id)}
												version={$plugins.get(card.id)?.manifest.version ?? null}
												updateVersion={card.isPlugin ? $pluginUpdateVersion(card.id) : null}
											/>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-xs text-surface-500 text-center py-6 border border-dashed border-surface-600/50 rounded-lg">
									Drag apps here
								</p>
							{/if}
						</div>
					{/if}
				</section>
			{/each}

			<!-- Ungrouped section -->
			{#if ungroupedCards.length > 0}
				<section
					class="rounded-xl border transition-all duration-200
						{dragOverUngrouped
							? 'border-hecate-500/50 ring-2 ring-hecate-500/30 bg-surface-800/90'
							: 'border-surface-600/30 bg-surface-800/50'}"
					ondragover={onDragOverUngrouped}
					ondragleave={onDragLeave}
					ondrop={onDropOnUngrouped}
				>
					<div class="flex items-center gap-2 px-4 py-2.5 text-surface-400">
						<span class="text-base leading-none">{'\uD83D\uDCCB'}</span>
						<span class="text-sm font-medium">Ungrouped</span>
						<span class="text-xs text-surface-500 ml-auto">{ungroupedCards.length}</span>
					</div>
					<div class="px-4 pb-4">
						<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
							{#each ungroupedCards as card (card.id)}
								<div
									draggable="true"
									ondragstart={(e) => onDragStart(e, card.id)}
									ondragend={onDragEnd}
									oncontextmenu={(e) => onContextMenu(e, 'app', card.id)}
								>
									<PluginCard
										{card}
										online={!card.isPlugin || $plugins.has(card.id)}
										version={$plugins.get(card.id)?.manifest.version ?? null}
										updateVersion={card.isPlugin ? $pluginUpdateVersion(card.id) : null}
									/>
								</div>
							{/each}
						</div>
					</div>
				</section>
			{/if}

			<!-- New Group button -->
			<div class="flex justify-center">
				{#if showNewGroup}
					<div class="flex items-center gap-2">
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
							class="bg-surface-700 text-surface-100 text-sm px-3 py-1.5 rounded-lg outline-none
								border border-hecate-500/50 placeholder:text-surface-500 w-48"
						/>
					</div>
				{:else}
					<button
						onclick={() => (showNewGroup = true)}
						class="text-xs text-surface-500 hover:text-surface-300 px-4 py-1.5 rounded-lg
							hover:bg-surface-800/50 border border-surface-600/30 hover:border-surface-500/50
							transition-all duration-200 cursor-pointer"
					>
						+ New Group
					</button>
				{/if}
			</div>
		</div>
	{:else if $connectionStatus === 'connected'}
		<div class="flex flex-col items-center gap-3 text-center max-w-md">
			<span class="text-4xl">{'\u{2699}'}</span>
			<p class="text-sm text-surface-400">
				Use the sidebar to navigate to Settings, LLM, or the Appstore.
			</p>
		</div>
	{/if}

	<!-- Donate -->
	<button
		onclick={() => open(DONATE_URL)}
		class="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer
			text-xs text-surface-400 hover:text-accent-400
			bg-surface-800/40 border border-surface-700/50 hover:border-accent-500/30
			transition-all duration-200"
	>
		<span>{'\u{2615}'}</span>
		<span>Buy me a coffee</span>
	</button>

	<!-- Footer tagline -->
	<p class="text-[10px] text-surface-500 text-center pb-4">
		Open source. Self-hosted. Yours.
	</p>
</div>

<!-- Context menu -->
{#if contextMenu}
	<menu
		class="fixed z-50 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 min-w-[160px] list-none m-0 p-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
		onclick={(e) => e.stopPropagation()}
	>
		{#if contextMenu.type === 'group'}
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => handleContextAction('rename')}
			>
				Rename
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => handleContextAction('change-icon')}
			>
				Change Icon
			</button>
			<button
				class="w-full text-left px-3 py-1.5 text-xs text-danger-400 hover:bg-surface-600 rounded cursor-pointer"
				onclick={() => handleContextAction('delete')}
			>
				Delete Group
			</button>
		{:else if contextMenu.type === 'app'}
			{@const appId = contextMenu.id}
			{@const currentGroupId = findAppGroup(appId)}
			{@const otherGroups = $sidebarGroups.filter((g) => g.id !== currentGroupId)}
			{#if otherGroups.length > 0}
				<div class="px-3 py-1 text-[10px] uppercase tracking-wider text-surface-500">Move to</div>
				{#each otherGroups as g (g.id)}
					<button
						class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
						onclick={() => moveAppToGroup(appId, g.id)}
					>
						{g.icon} {g.name}
					</button>
				{/each}
			{/if}
			{#if currentGroupId}
				<button
					class="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-600 rounded cursor-pointer"
					onclick={() => moveAppToUngrouped(appId)}
				>
					Move to Ungrouped
				</button>
			{/if}
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

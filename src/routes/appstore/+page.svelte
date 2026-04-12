<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { get as apiGet, post, ApiError } from '$lib/api';
	import { goto } from '$app/navigation';
	import { health } from '$lib/stores/daemon';
	import { settings } from '$lib/stores/settings';
	import { initSidebar, addPluginToSidebar, removePluginFromSidebar } from '$lib/stores/sidebar';
	import { pullStatus, startPullPolling, stopPullPolling } from '$lib/stores/pull-progress';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import type { OfferingItem, OfferingDetail } from '$lib/types/appstore';
	import { getActionState, isPluginInstalled, formatPrice, parseTags, extractPluginName } from '$lib/types/appstore';
	import { resolveEmoji } from '$lib/emoji';

	// =====================================================================
	// DATA
	// =====================================================================
	let catalog: OfferingItem[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);

	// =====================================================================
	// UI STATE
	// =====================================================================
	type View = 'browse' | 'installed' | 'detail';
	let currentView: View = $state('browse');
	let cursorIndex = $state(0);
	let searchQuery = $state('');
	let selectedPlugin: OfferingDetail | null = $state(null);

	// Modes: normal, search, command, confirm
	type Mode = 'normal' | 'search' | 'command' | 'confirm';
	let mode: Mode = $state('normal');
	let commandInput = $state('');
	let statusMsg = $state('');
	let confirmPrompt = $state('');
	let confirmAction: (() => Promise<void> | void) | null = $state(null);
	let actionLoading: string | null = $state(null);

	// Install progress
	let installTarget: OfferingItem | null = $state(null);
	type InstallStep = 'confirm' | 'buying' | 'installing' | 'downloading' | 'done' | 'error';
	let installStep: InstallStep = $state('confirm');
	let installModalError: string | null = $state(null);

	// =====================================================================
	// DERIVED
	// =====================================================================
	let filteredCatalog = $derived.by(() => {
		let items = catalog;
		if (currentView === 'installed') {
			items = items.filter(p => p.license_id !== null && p.license_id !== undefined);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			items = items.filter(p =>
				p.name.toLowerCase().includes(q) ||
				p.org.toLowerCase().includes(q) ||
				(p.description && p.description.toLowerCase().includes(q)) ||
				parseTags(p.tags).some(t => t.toLowerCase().includes(q))
			);
		}
		return items;
	});

	// Group by group_name
	let groupedCatalog = $derived.by(() => {
		const groups: { name: string; icon: string | null; items: OfferingItem[] }[] = [];
		const map = new Map<string, OfferingItem[]>();
		const iconMap = new Map<string, string | null>();
		for (const item of filteredCatalog) {
			const g = item.group_name ?? 'OTHER';
			if (!map.has(g)) { map.set(g, []); iconMap.set(g, item.group_icon); }
			map.get(g)!.push(item);
		}
		for (const [name, items] of map) {
			groups.push({ name, icon: iconMap.get(name) ?? null, items });
		}
		return groups;
	});

	// Flat list for cursor navigation (items only, groups are headers)
	let flatItems = $derived(filteredCatalog);
	let selectedItem = $derived<OfferingItem | null>(flatItems[cursorIndex] ?? null);
	let installedCount = $derived(catalog.filter(p => isPluginInstalled(p)).length);

	// =====================================================================
	// FETCH
	// =====================================================================
	async function fetchCatalog() {
		try {
			const res = await apiGet<{ items: OfferingItem[] }>('/api/appstore/offerings');
			catalog = res.items;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function fetchAll() {
		isLoading = true;
		error = null;
		await fetchCatalog();
		isLoading = false;
	}

	let hasFetched = false;
	$effect(() => {
		if ($settings?.identity?.hecate_user_id && !hasFetched) {
			hasFetched = true;
			fetchAll();
		}
	});

	// =====================================================================
	// ACTIONS
	// =====================================================================
	async function openDetail(offeringId: string) {
		try {
			const res = await apiGet<{ plugin: OfferingDetail }>(`/api/appstore/offerings/${encodeURIComponent(offeringId)}`);
			selectedPlugin = res.plugin;
			currentView = 'detail';
		} catch {
			toastError('Failed to load plugin details');
		}
	}

	async function installPlugin(item: OfferingItem) {
		installTarget = item;
		installStep = 'buying';
		actionLoading = item.plugin_id;
		statusMsg = `Installing ${item.name}...`;
		try {
			await post('/api/appstore/install', {
				plugin_id: item.plugin_id,
				offering_data: {
					offering_id: item.offering_id, plugin_name: item.name,
					description: item.description, icon: item.icon,
					group_name: item.group_name, group_icon: item.group_icon,
					oci_image: item.oci_image, package_url: item.package_url,
					selling_formula: item.selling_formula, author_id: item.author_id,
					author_signature: item.author_signature, license_type: item.license_type,
					fee_cents: item.fee_cents, fee_currency: item.fee_currency,
					duration_days: item.duration_days, node_limit: item.node_limit,
					org: item.org, version: item.version, manifest_tag: item.manifest_tag,
					tags: item.tags, homepage: item.homepage,
					min_daemon_version: item.min_daemon_version,
					publisher_identity: item.publisher_identity,
					manifest_url: item.manifest_url, manifest_checksum: item.manifest_checksum,
					oci_image_verified: item.oci_image_verified, oci_image_digest: item.oci_image_digest,
					plugin_type: item.plugin_type, callback_module: item.callback_module
				}
			});
			toastSuccess(`Installing ${item.name}...`);
			installStep = 'downloading';
			addPluginToSidebar(item.oci_image ? extractPluginName(item.oci_image) : item.name, item.icon ?? undefined, item.group_name ?? 'APPS', item.group_icon ?? undefined);
			startPullPolling(item.plugin_id);
			await fetchCatalog();
			statusMsg = `${item.name} install started`;
		} catch (e) {
			statusMsg = `Install failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			actionLoading = null;
		}
	}

	async function upgradePlugin(item: OfferingItem) {
		actionLoading = item.plugin_id;
		statusMsg = `Upgrading ${item.name}...`;
		try {
			await post('/api/appstore/plugins/upgrade', {
				plugin_id: item.plugin_id, oci_image: item.oci_image,
				package_url: item.package_url, plugin_type: item.plugin_type,
				installed_version: item.version, icon: item.icon,
				group_name: item.group_name, group_icon: item.group_icon,
				display_name: item.name, description: item.description
			});
			toastSuccess(`Upgrading ${item.name} to v${item.version}...`);
			await fetchCatalog();
			statusMsg = `${item.name} upgrade started`;
		} catch (e) {
			statusMsg = `Upgrade failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			actionLoading = null;
		}
	}

	async function removePlugin(item: OfferingItem) {
		actionLoading = item.plugin_id;
		statusMsg = `Removing ${item.name}...`;
		try {
			await post('/api/appstore/plugins/remove', { license_id: item.license_id, plugin_id: item.plugin_id });
			removePluginFromSidebar(item.oci_image ? extractPluginName(item.oci_image) : item.name);
			toastSuccess(`${item.name} removed`);
			await fetchCatalog();
			statusMsg = `${item.name} removed`;
		} catch (e) {
			statusMsg = `Remove failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			actionLoading = null;
		}
	}

	async function revokeLicense(item: OfferingItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/licenses/revoke', { license_id: item.license_id });
			toastSuccess(`License for ${item.name} revoked`);
			await fetchCatalog();
			statusMsg = `License revoked`;
		} catch (e) {
			statusMsg = `Revoke failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			actionLoading = null;
		}
	}

	function handleAction(item: OfferingItem) {
		const state = getActionState(item);
		switch (state) {
			case 'get':
			case 'install':
				requestConfirm(`Install ${item.name} (${formatPrice(item)})?`, () => installPlugin(item));
				break;
			case 'update':
				requestConfirm(`Upgrade ${item.name} to v${item.version}?`, () => upgradePlugin(item));
				break;
			case 'installed':
				requestConfirm(`Remove ${item.name}?`, () => removePlugin(item));
				break;
		}
	}

	function requestConfirm(prompt: string, action: () => Promise<void> | void) {
		confirmPrompt = prompt;
		confirmAction = action;
		mode = 'confirm';
	}

	// =====================================================================
	// COMMANDS
	// =====================================================================
	interface Command {
		name: string; aliases: string[]; args: string; description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{ name: 'browse', aliases: ['b'], args: '', description: 'Browse all plugins',
			exec() { currentView = 'browse'; cursorIndex = 0; searchQuery = ''; } },
		{ name: 'installed', aliases: ['i', 'my'], args: '', description: 'Show installed plugins',
			exec() { currentView = 'installed'; cursorIndex = 0; searchQuery = ''; } },
		{ name: 'install', aliases: ['get'], args: '[name]', description: 'Install selected or named plugin',
			exec(args) {
				const item = args.trim() ? flatItems.find(p => p.name.toLowerCase() === args.trim().toLowerCase()) : selectedItem;
				if (item) handleAction(item);
				else statusMsg = 'Plugin not found';
			} },
		{ name: 'remove', aliases: ['uninstall', 'rm'], args: '[name]', description: 'Remove selected or named plugin',
			exec(args) {
				const item = args.trim() ? flatItems.find(p => p.name.toLowerCase() === args.trim().toLowerCase()) : selectedItem;
				if (item) requestConfirm(`Remove ${item.name}?`, () => removePlugin(item));
				else statusMsg = 'Plugin not found';
			} },
		{ name: 'upgrade', aliases: ['update', 'up'], args: '[name]', description: 'Upgrade selected or named plugin',
			exec(args) {
				const item = args.trim() ? flatItems.find(p => p.name.toLowerCase() === args.trim().toLowerCase()) : selectedItem;
				if (item) upgradePlugin(item);
				else statusMsg = 'Plugin not found';
			} },
		{ name: 'revoke', aliases: [], args: '[name]', description: 'Revoke license for plugin',
			exec(args) {
				const item = args.trim() ? flatItems.find(p => p.name.toLowerCase() === args.trim().toLowerCase()) : selectedItem;
				if (item) requestConfirm(`Revoke license for ${item.name}?`, () => revokeLicense(item));
				else statusMsg = 'Plugin not found';
			} },
		{ name: 'refresh', aliases: ['r'], args: '', description: 'Refresh catalog',
			async exec() { statusMsg = 'Refreshing...'; await fetchAll(); statusMsg = `${catalog.length} plugins loaded`; } },
		{ name: 'publish', aliases: ['pub'], args: '<url>', description: 'Publish plugin from git URL',
			async exec(args) {
				const url = args.trim();
				if (!url) { statusMsg = 'publish: missing URL (e.g. :publish https://github.com/org/repo)'; return; }
				statusMsg = `Publishing from ${url}...`;
				try {
					await post('/api/appstore/publish-from-url', { url });
					toastSuccess('Plugin published to catalog');
					await fetchCatalog();
					statusMsg = 'Published successfully';
				} catch (e) {
					statusMsg = `Publish failed: ${e instanceof Error ? e.message : e}`;
				}
			} },
		{ name: 'sell', aliases: ['listings'], args: '', description: 'Go to publisher page',
			exec() { goto('/appstore/sell'); } },
		{ name: 'q', aliases: ['quit', 'back'], args: '', description: 'Go back',
			exec() {
				if (currentView === 'detail') { currentView = 'browse'; }
				else { goto('/'); }
			} },
		{ name: 'help', aliases: ['h', '?'], args: '', description: 'Show commands',
			exec() { statusMsg = commands.map(c => ':' + c.name).join('  '); } },
	];

	function findCommand(input: string): Command | undefined {
		return commands.find(c => c.name === input || c.aliases.includes(input));
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'confirm') { mode = 'normal'; confirmAction = null; confirmPrompt = ''; }
			else if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			else if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else if (currentView === 'detail') { currentView = 'browse'; }
			return;
		}

		if (mode === 'search') { handleSearchKeys(e); return; }
		if (mode === 'command') { return; } // let input handle it
		if (mode === 'confirm') { handleConfirmKeys(e); return; }
		if (mode !== 'normal') return;

		switch (e.key) {
			case 'j': case 'ArrowDown':
				e.preventDefault();
				cursorIndex = Math.min(cursorIndex + 1, flatItems.length - 1);
				scrollCursorIntoView();
				break;
			case 'k': case 'ArrowUp':
				e.preventDefault();
				cursorIndex = Math.max(cursorIndex - 1, 0);
				scrollCursorIntoView();
				break;
			case 'g':
				e.preventDefault();
				cursorIndex = 0;
				scrollCursorIntoView();
				break;
			case 'G':
				e.preventDefault();
				cursorIndex = Math.max(0, flatItems.length - 1);
				scrollCursorIntoView();
				break;
			case 'l': case 'Enter': case 'ArrowRight':
				e.preventDefault();
				if (selectedItem) openDetail(selectedItem.offering_id);
				break;
			case 'h': case 'ArrowLeft':
				e.preventDefault();
				if (currentView === 'detail') currentView = 'browse';
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
				statusMsg = '';
				break;
			case 'i':
				e.preventDefault();
				if (selectedItem) handleAction(selectedItem);
				break;
			case 'x':
				e.preventDefault();
				if (selectedItem && isPluginInstalled(selectedItem)) {
					requestConfirm(`Remove ${selectedItem.name}?`, () => removePlugin(selectedItem!));
				}
				break;
			case 'u':
				e.preventDefault();
				if (selectedItem && getActionState(selectedItem) === 'update') {
					requestConfirm(`Upgrade ${selectedItem.name}?`, () => upgradePlugin(selectedItem!));
				}
				break;
			case 'Tab':
				e.preventDefault();
				currentView = currentView === 'browse' ? 'installed' : 'browse';
				cursorIndex = 0;
				break;
			case '?':
				e.preventDefault();
				statusMsg = 'j/k:nav  l/Enter:detail  i:install  x:remove  u:upgrade  /:search  ::cmd  Tab:view  ?:help';
				break;
		}
	}

	function handleSearchKeys(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; cursorIndex = 0; return; }
		if (e.key === 'Backspace') {
			searchQuery = searchQuery.slice(0, -1);
			if (!searchQuery) mode = 'normal';
			cursorIndex = 0;
			return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			searchQuery += e.key;
			cursorIndex = 0;
		}
	}

	function handleConfirmKeys(e: KeyboardEvent) {
		e.preventDefault();
		if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
			const action = confirmAction;
			mode = 'normal';
			confirmAction = null;
			confirmPrompt = '';
			if (action) action();
		} else {
			mode = 'normal';
			confirmAction = null;
			confirmPrompt = '';
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim();
		mode = 'normal';
		commandInput = '';
		if (!raw) return;

		const spaceIdx = raw.indexOf(' ');
		const cmdName = spaceIdx >= 0 ? raw.substring(0, spaceIdx) : raw;
		const cmdArgs = spaceIdx >= 0 ? raw.substring(spaceIdx + 1) : '';

		const cmd = findCommand(cmdName);
		if (cmd) {
			try { await cmd.exec(cmdArgs); }
			catch (err) { statusMsg = `Error: ${err}`; }
		} else {
			statusMsg = `Unknown: ${cmdName}  (:help)`;
		}
	}

	function scrollCursorIntoView() {
		tick().then(() => {
			const el = document.querySelector('[data-cursor="true"]');
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	// Status timer
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (statusMsg) {
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => { statusMsg = ''; }, 6000);
		}
	});

	// Clamp cursor
	$effect(() => {
		if (cursorIndex >= flatItems.length) cursorIndex = Math.max(0, flatItems.length - 1);
	});

	// =====================================================================
	// HELPERS
	// =====================================================================
	function actionLabel(item: OfferingItem): string {
		const state = getActionState(item);
		switch (state) {
			case 'get': return formatPrice(item);
			case 'install': return 'install';
			case 'installed': return 'installed';
			case 'update': return `update→${item.version}`;
			case 'revoked': return 'revoked';
			default: return '';
		}
	}

	function actionColor(item: OfferingItem): string {
		const state = getActionState(item);
		switch (state) {
			case 'installed': return 'text-success-400';
			case 'update': return 'text-amber-400';
			case 'revoked': return 'text-danger-400';
			default: return 'text-macula-400';
		}
	}

	function statusIndicator(item: OfferingItem): string {
		const actions = item.available_actions ?? [];
		if (actions.includes('stop')) return '\u25CF'; // ● running
		if (actions.includes('start')) return '\u25CB'; // ○ stopped
		if (actions.includes('remove')) return '\u25C6'; // ◆ installed
		return ' ';
	}

	function statusColor(item: OfferingItem): string {
		const actions = item.available_actions ?? [];
		if (actions.includes('stop')) return 'text-success-400';
		if (actions.includes('start')) return 'text-amber-400';
		if (actions.includes('remove')) return 'text-macula-400';
		return 'text-surface-600';
	}

	function focusOnMount(node: HTMLElement) {
		tick().then(() => node.focus());
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">
			{currentView === 'detail' ? 'Detail' : currentView === 'installed' ? 'Installed' : 'Appstore'}
		</span>
		<span class="text-surface-600">({flatItems.length})</span>
		<div class="flex-1"></div>
		{#if currentView !== 'detail'}
			<button
				class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
					{currentView === 'browse' ? 'text-macula-400 bg-macula-600/20' : 'text-surface-500 hover:text-surface-300'}"
				onclick={() => { currentView = 'browse'; cursorIndex = 0; }}
			>browse</button>
			<button
				class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
					{currentView === 'installed' ? 'text-macula-400 bg-macula-600/20' : 'text-surface-500 hover:text-surface-300'}"
				onclick={() => { currentView = 'installed'; cursorIndex = 0; }}
			>installed ({installedCount})</button>
		{/if}
	</div>

	<!-- Main content -->
	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
		<!-- List pane -->
		<div class="flex-1 overflow-y-auto py-1 min-w-0" class:hidden={currentView === 'detail'}>
			{#if isLoading}
				<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading catalog...</div>
			{:else if error}
				<div class="px-3 py-4 text-[11px] text-danger-400">{error}</div>
			{:else if flatItems.length === 0}
				<div class="px-3 py-4 text-[11px] text-surface-600">
					{searchQuery ? 'No matches' : 'No plugins available'}
				</div>
			{:else}
				{#each groupedCatalog as group}
					<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-1 first:mt-0">
						{#if group.icon}{resolveEmoji(group.icon)} {/if}{group.name}
					</div>
					{#each group.items as item (item.plugin_id)}
						{@const idx = flatItems.indexOf(item)}
						{@const isCursor = idx === cursorIndex}
						{@const loading = actionLoading === item.plugin_id}
						<button
							data-cursor={isCursor ? 'true' : 'false'}
							class="w-full text-left px-2 py-px text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors
								{isCursor
									? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400'
									: 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
							onclick={() => { cursorIndex = idx; }}
							ondblclick={() => openDetail(item.offering_id)}
						>
							<!-- Status dot -->
							<span class="w-2 text-center shrink-0 text-[8px] {statusColor(item)}">{statusIndicator(item)}</span>
							<!-- Icon -->
							<span class="w-4 text-center shrink-0">{resolveEmoji(item.icon ?? 'package')}</span>
							<!-- Name -->
							<span class="truncate flex-1">{item.name}</span>
							<!-- Version -->
							<span class="text-[9px] text-surface-600 shrink-0 w-12 text-right">{item.version}</span>
							<!-- Action state -->
							<span class="text-[9px] shrink-0 w-20 text-right {actionColor(item)}">
								{#if loading}
									<span class="animate-pulse">...</span>
								{:else}
									{actionLabel(item)}
								{/if}
							</span>
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Detail pane (replaces list when active, or shown as right pane on wider screens) -->
		{#if currentView === 'detail' && selectedPlugin}
			<div class="flex-1 overflow-y-auto py-2 px-3">
				<div class="space-y-3">
					<!-- Header -->
					<div class="flex items-center gap-2">
						<span class="text-2xl">{resolveEmoji(selectedPlugin.icon ?? 'package')}</span>
						<div>
							<div class="text-sm font-semibold text-surface-100">{selectedPlugin.name}</div>
							<div class="text-[10px] text-surface-500">{selectedPlugin.org} · v{selectedPlugin.version}</div>
						</div>
					</div>

					{#if selectedPlugin.description}
						<div class="text-[11px] text-surface-400">{selectedPlugin.description}</div>
					{/if}

					<!-- Info grid -->
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
						<div class="text-surface-500">Price</div>
						<div class="text-surface-300">{formatPrice(selectedPlugin)}</div>

						<div class="text-surface-500">Type</div>
						<div class="text-surface-300">{selectedPlugin.plugin_type ?? 'unknown'}</div>

						<div class="text-surface-500">Status</div>
						<div class="{actionColor(selectedPlugin)}">{actionLabel(selectedPlugin)}</div>

						{#if selectedPlugin.homepage}
							<div class="text-surface-500">Homepage</div>
							<div class="text-macula-400 truncate">{selectedPlugin.homepage}</div>
						{/if}

						{#if selectedPlugin.publisher_identity}
							<div class="text-surface-500">Publisher</div>
							<div class="text-surface-300">{selectedPlugin.publisher_identity}</div>
						{/if}

						{#if selectedPlugin.min_daemon_version}
							<div class="text-surface-500">Min daemon</div>
							<div class="text-surface-300">v{selectedPlugin.min_daemon_version}</div>
						{/if}

						{#if selectedPlugin.installed_version}
							<div class="text-surface-500">Installed</div>
							<div class="text-surface-300">v{selectedPlugin.installed_version}</div>
						{/if}

						{#if parseTags(selectedPlugin.tags).length > 0}
							<div class="text-surface-500">Tags</div>
							<div class="text-surface-400">{parseTags(selectedPlugin.tags).join(', ')}</div>
						{/if}
					</div>

					<!-- Trust indicators -->
					{#if selectedPlugin.manifest_checksum || selectedPlugin.oci_image_digest}
						<div class="text-[9px] text-surface-600 space-y-0.5 mt-2">
							{#if selectedPlugin.manifest_checksum}
								<div>manifest: {selectedPlugin.manifest_checksum.substring(0, 24)}...</div>
							{/if}
							{#if selectedPlugin.oci_image_digest}
								<div>digest: {selectedPlugin.oci_image_digest.substring(0, 24)}...</div>
							{/if}
						</div>
					{/if}

					<!-- Actions hint -->
					<div class="text-[10px] text-surface-600 mt-4">
						i: {getActionState(selectedPlugin) === 'installed' ? 'remove' : 'install'}
						{#if getActionState(selectedPlugin) === 'update'} · u: upgrade{/if}
						 · h/Esc: back
					</div>
				</div>
			</div>
		{:else if currentView !== 'detail' && selectedItem}
			<!-- Preview pane (right side) -->
			<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
				<div class="px-3 py-2 space-y-2">
					<div class="flex items-center gap-2">
						<span class="text-lg">{resolveEmoji(selectedItem.icon ?? 'package')}</span>
						<span class="text-[11px] text-surface-200 font-medium">{selectedItem.name}</span>
					</div>
					{#if selectedItem.description}
						<div class="text-[10px] text-surface-500">{selectedItem.description}</div>
					{/if}
					<div class="text-[10px] text-surface-600 space-y-0.5">
						<div>{selectedItem.org} · v{selectedItem.version}</div>
						<div>{formatPrice(selectedItem)} · {selectedItem.plugin_type ?? 'unknown'}</div>
						{#if selectedItem.installed_version}
							<div class="text-success-400">Installed v{selectedItem.installed_version}</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if currentView !== 'detail'}
			<div class="w-1/3 shrink-0 flex items-center justify-center text-surface-600 text-[10px]">
				No selection
			</div>
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input
				type="text" bind:value={commandInput}
				use:focusOnMount
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); }
					else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; }
				}}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100"
				placeholder="Command... (Tab to complete)"
			/>
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{flatItems.length} matches</span>
		{:else if mode === 'confirm'}
			<span class="text-amber-400">{confirmPrompt}</span>
			<span class="text-surface-500">(y/N)</span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{currentView}</span>
				<span class="text-surface-700">|</span>
				{#if selectedItem}
					<span class="text-surface-400 truncate">{selectedItem.name}</span>
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{flatItems.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  l:detail  i:install  x:remove  u:upgrade  /:search  ::cmd  Tab:view'}>?</span>
			{/if}
		{/if}
	</div>
</div>

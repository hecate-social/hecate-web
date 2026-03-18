<script lang="ts">
	import { get as apiGet, post, ApiError } from '$lib/api';
	import { goto } from '$app/navigation';
	import { health } from '$lib/stores/daemon';
	import { settings } from '$lib/stores/settings';
	import { initSidebar, addPluginToSidebar, removePluginFromSidebar } from '$lib/stores/sidebar';
	import { pullStatus, startPullPolling, stopPullPolling } from '$lib/stores/pull-progress';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import type { OfferingItem, OfferingDetail } from '$lib/types/appstore';
	import { getActionState, isPluginInstalled, statusBadgeClass, formatPrice, parseTags, extractPluginName } from '$lib/types/appstore';
	import { resolveEmoji } from '$lib/emoji';
	import { pushOverlay, popOverlay } from '$lib/stores/keyboard';
	import FocusTrap from '$lib/components/FocusTrap.svelte';

	// --- Data ---
	let catalog: OfferingItem[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);

	// --- UI state ---
	type Tab = 'browse' | 'my-plugins';
	let activeTab: Tab = $state('browse');
	let searchQuery = $state('');
	let selectedPlugin: OfferingDetail | null = $state(null);
	let detailLoading = $state(false);
	let actionLoading: string | null = $state(null);

	// --- Publish from URL state ---
	let showUrlPublish = $state(false);
	type GitHost = 'github.com' | 'gitlab.com' | 'codeberg.org' | 'custom';
	let publishHost: GitHost = $state('github.com');
	let publishCustomHost = $state('');
	let publishOrg = $state('');
	let publishRepo = $state('');
	let urlPublishLoading = $state(false);
	let urlPublishError: string | null = $state(null);
	let urlPublishSuccess: string | null = $state(null);

	const publishUrl = $derived.by(() => {
		const host = publishHost === 'custom' ? publishCustomHost.trim() : publishHost;
		const org = publishOrg.trim();
		const repo = publishRepo.trim();
		if (!host || !org || !repo) return '';
		return `https://${host}/${org}/${repo}`;
	});

	// --- Install confirmation modal state ---
	type InstallStep = 'confirm' | 'buying' | 'installing' | 'downloading' | 'done' | 'error';
	let installTarget: OfferingItem | null = $state(null);
	let installStep: InstallStep = $state('confirm');
	let installModalError: string | null = $state(null);

	// --- Danger action confirmation state (uninstall / revoke) ---
	type DangerAction = 'uninstall' | 'revoke';
	let dangerTarget: OfferingItem | null = $state(null);
	let dangerAction: DangerAction = $state('uninstall');

	// --- Filtered catalog ---
	let filteredCatalog = $derived.by(() => {
		let items = catalog;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			items = items.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.org.toLowerCase().includes(q) ||
					(p.description && p.description.toLowerCase().includes(q)) ||
					parseTags(p.tags).some((t) => t.toLowerCase().includes(q))
			);
		}
		return items;
	});

	// --- Licensed plugins ---
	let licensedPlugins = $derived(
		catalog.filter((p) => p.license_id !== null && p.license_id !== undefined)
	);

	// --- Installed count ---
	let installedCount = $derived(
		catalog.filter((p) => isPluginInstalled(p)).length
	);

	// --- Fetch ---
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

	async function openDetail(offeringId: string) {
		detailLoading = true;
		try {
			const res = await apiGet<{ plugin: OfferingDetail }>(`/api/appstore/offerings/${encodeURIComponent(offeringId)}`);
			selectedPlugin = res.plugin;
		} catch (e) {
			toastError('Failed to load plugin details');
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		selectedPlugin = null;
	}

	// --- Actions ---
	async function removePlugin(item: OfferingItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/plugins/remove', {
				license_id: item.license_id,
				plugin_id: item.plugin_id
			});
			removePluginFromSidebar(item.oci_image ? extractPluginName(item.oci_image) : item.name);
			toastSuccess(`${item.name} removed`);
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.offering_id);
			}
		} catch (e) {
			toastError(`Failed to remove plugin: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			actionLoading = null;
		}
	}

	async function revokeLicense(item: OfferingItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/licenses/revoke', {
				license_id: item.license_id
			});
			toastSuccess(`License for ${item.name} revoked`);
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.offering_id);
			}
		} catch (e) {
			toastError(`Failed to revoke license: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			actionLoading = null;
		}
	}

	function requestDanger(item: OfferingItem, action: DangerAction) {
		dangerTarget = item;
		dangerAction = action;
	}

	function cancelDanger() {
		dangerTarget = null;
	}

	async function confirmDanger() {
		if (!dangerTarget) return;
		const item = dangerTarget;
		const action = dangerAction;
		dangerTarget = null;

		if (action === 'uninstall') {
			await removePlugin(item);
		} else {
			await revokeLicense(item);
		}
	}

	async function publishFromUrl() {
		if (!publishUrl) return;
		urlPublishLoading = true;
		urlPublishError = null;
		urlPublishSuccess = null;
		try {
			await post('/api/appstore/publish-from-url', {
				url: publishUrl
			});
			urlPublishSuccess = 'Published successfully';
			toastSuccess('Plugin published to catalog');
			publishOrg = '';
			publishRepo = '';
			await fetchCatalog();
			setTimeout(() => {
				showUrlPublish = false;
				urlPublishSuccess = null;
			}, 1500);
		} catch (e) {
			urlPublishError = e instanceof Error ? e.message : String(e);
		} finally {
			urlPublishLoading = false;
		}
	}

	function requestInstall(item: OfferingItem) {
		installTarget = item;
		installStep = 'confirm';
		installModalError = null;
	}

	function cancelInstall() {
		stopPullPolling();
		installTarget = null;
		installStep = 'confirm';
		installModalError = null;
	}

	async function confirmInstall() {
		if (!installTarget) return;
		const item = installTarget;

		try {
			installStep = 'buying';
			// Combined endpoint: initiate_license + accept_offering_terms
			// PMs handle grant + install asynchronously after this returns
			await post('/api/appstore/install', {
				plugin_id: item.plugin_id,
				offering_data: {
					offering_id: item.offering_id,
					plugin_name: item.name,
					description: item.description,
					icon: item.icon,
					group_name: item.group_name,
					group_icon: item.group_icon,
					oci_image: item.oci_image,
					package_url: item.package_url,
					selling_formula: item.selling_formula,
					author_id: item.author_id,
					author_signature: item.author_signature,
					license_type: item.license_type,
					fee_cents: item.fee_cents,
					fee_currency: item.fee_currency,
					duration_days: item.duration_days,
					node_limit: item.node_limit,
					org: item.org,
					version: item.version,
					manifest_tag: item.manifest_tag,
					tags: item.tags,
					homepage: item.homepage,
					min_daemon_version: item.min_daemon_version,
					publisher_identity: item.publisher_identity,
					manifest_url: item.manifest_url,
					manifest_checksum: item.manifest_checksum,
					oci_image_verified: item.oci_image_verified,
					oci_image_digest: item.oci_image_digest,
					plugin_type: item.plugin_type,
					callback_module: item.callback_module
				}
			});
			// PMs fire asynchronously: grant_license -> install_plugin -> OCI pull
			// Wait briefly for PM chain to propagate, then poll for download progress
			toastSuccess(`Installing ${item.name}...`);
			installStep = 'installing';
			await new Promise((r) => setTimeout(r, 1500));
			addPluginToSidebar(item.oci_image ? extractPluginName(item.oci_image) : item.name, item.icon ?? undefined, item.group_name ?? 'APPS', item.group_icon ?? undefined);
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.offering_id);
			}
			installStep = 'downloading';
			startPullPolling(item.plugin_id);
		} catch (e) {
			installModalError = e instanceof Error ? e.message : String(e);
			installStep = 'error';
		}
	}

	async function startPlugin(pluginId: string) {
		const target = installTarget;
		const pluginName = target?.oci_image
			? extractPluginName(target.oci_image)
			: target?.name;

		// For in-VM or already-running plugins, just navigate — no start command needed
		if (target?.plugin_type === 'in_vm') {
			cancelInstall();
			if (pluginName) goto(`/plugin/${pluginName}`);
			return;
		}

		try {
			await post('/api/plugins/start', { plugin_id: pluginId });
		} catch (e) {
			if (e instanceof ApiError && e.code === 'plugin_already_running') {
				// Already running — navigate to plugin
			} else {
				installModalError = e instanceof Error ? e.message : String(e);
				installStep = 'error';
				return;
			}
		}
		cancelInstall();
		if (pluginName) goto(`/plugin/${pluginName}`);
	}

	async function cancelPull() {
		if (!installTarget) return;
		try {
			await post(`/api/appstore/plugins/${encodeURIComponent(installTarget.plugin_id)}/cancel-pull`, {});
		} catch (e) {
			toastError(`Failed to cancel download: ${e instanceof Error ? e.message : 'Unknown error'}`);
		}
		stopPullPolling();
		installStep = 'confirm';
		installTarget = null;
	}

	// --- Overlay stack registration ---
	$effect(() => {
		if (dangerTarget) {
			pushOverlay('appstore-danger', cancelDanger);
		} else {
			popOverlay('appstore-danger');
		}
	});

	$effect(() => {
		if (installTarget) {
			pushOverlay('appstore-install', cancelInstall);
		} else {
			popOverlay('appstore-install');
		}
	});

	function handleAction(item: OfferingItem) {
		const state = getActionState(item);
		switch (state) {
			case 'get':
			case 'install':
				requestInstall(item);
				break;
			case 'update':
				confirmUpgrade(item);
				break;
			case 'installed':
				requestDanger(item, 'uninstall');
				break;
		}
	}

	async function confirmUpgrade(item: OfferingItem) {
		try {
			installTarget = item;
			installStep = 'buying';
			await post('/api/appstore/plugins/upgrade', {
				plugin_id: item.plugin_id,
				oci_image: item.oci_image,
				package_url: item.package_url,
				plugin_type: item.plugin_type,
				installed_version: item.version,
				icon: item.icon,
				group_name: item.group_name,
				group_icon: item.group_icon,
				display_name: item.name,
				description: item.description
			});
			toastSuccess(`Upgrading ${item.name} to v${item.version}...`);
			installStep = 'installing';
			await new Promise((r) => setTimeout(r, 1500));
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.offering_id);
			}
			if (item.plugin_type === 'in_vm') {
				installStep = 'downloading';
				pullStatus.set({ status: 'complete', percent: 100 });
			} else {
				cancelInstall();
			}
		} catch (e) {
			installModalError = e instanceof Error ? e.message : String(e);
			installStep = 'error';
		}
	}

	let hasFetched = false;
	$effect(() => {
		if ($settings?.identity?.hecate_user_id && !hasFetched) {
			hasFetched = true;
			fetchAll();
		}
	});
</script>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header -->
	<div class="border-b border-surface-600 bg-surface-800/50 px-4 py-3 shrink-0">
		<div class="flex items-center gap-3">
			<span class="text-xl">{'\u{1F3EA}'}</span>
			<h1 class="text-sm font-semibold text-surface-100">Appstore</h1>

			{#if $health}
				<div class="flex items-center gap-1.5 text-[10px]">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-success-400"></span>
					<span class="text-surface-500">v{$health.version}</span>
				</div>
			{/if}

			<div class="flex-1"></div>

			<button
				onclick={() => goto('/appstore/sell')}
				class="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-700
					border border-surface-600 text-surface-200
					hover:bg-surface-600 hover:border-surface-500 transition-colors">
				My Listings
			</button>

			<button
				onclick={() => { showUrlPublish = !showUrlPublish; urlPublishError = null; urlPublishSuccess = null; }}
				class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
					{showUrlPublish
					? 'bg-accent-600 text-surface-50'
					: 'bg-surface-700 border border-surface-600 text-surface-200 hover:bg-surface-600 hover:border-surface-500'}">
				Publish from URL
			</button>

			<!-- Search -->
			<input
				bind:value={searchQuery}
				placeholder="Search apps..."
				class="w-56 bg-surface-700 border border-surface-600 rounded-lg
					px-3 py-1.5 text-xs text-surface-100 placeholder-surface-500
					focus:outline-none focus:border-accent-500"
			/>
		</div>

		<!-- Tabs -->
		<div class="flex gap-1 mt-3">
			<button
				onclick={() => (activeTab = 'browse')}
				class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
					{activeTab === 'browse'
					? 'bg-accent-600 text-surface-50'
					: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700'}"
			>
				Browse
			</button>
			<button
				onclick={() => (activeTab = 'my-plugins')}
				class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
					{activeTab === 'my-plugins'
					? 'bg-accent-600 text-surface-50'
					: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700'}"
			>
				My Apps
				{#if installedCount > 0}
					<span class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-success-500/20 text-success-400">
						{installedCount}
					</span>
				{/if}
			</button>
		</div>

		<!-- Publish from URL form -->
		{#if showUrlPublish}
			<form
				onsubmit={(e) => { e.preventDefault(); publishFromUrl(); }}
				class="mt-3 flex flex-col gap-3 p-3 bg-surface-800 border border-surface-700 rounded-lg"
			>
				<!-- Host selector -->
				<div class="flex items-center gap-1.5">
					<span class="text-xs text-surface-400 w-10 shrink-0">Host</span>
					{#each [
						{ id: 'github.com', label: 'GitHub' },
						{ id: 'gitlab.com', label: 'GitLab' },
						{ id: 'codeberg.org', label: 'Codeberg' },
						{ id: 'custom', label: 'Other' }
					] as host}
						<button
							type="button"
							onclick={() => { publishHost = host.id as GitHost; }}
							class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors
								{publishHost === host.id
								? 'bg-accent-600 text-surface-50'
								: 'bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600'}"
						>
							{host.label}
						</button>
					{/each}
					{#if publishHost === 'custom'}
						<input
							bind:value={publishCustomHost}
							placeholder="gitea.example.com"
							disabled={urlPublishLoading}
							class="w-44 bg-surface-700 border border-surface-600 rounded-md
								px-2.5 py-1 text-xs text-surface-100 placeholder-surface-500
								focus:outline-none focus:border-accent-500 disabled:opacity-50"
						/>
					{/if}
				</div>

				<!-- Org + Repo row -->
				<div class="flex items-center gap-1.5">
					<span class="text-xs text-surface-400 w-10 shrink-0">Repo</span>
					<input
						bind:value={publishOrg}
						placeholder="organization"
						disabled={urlPublishLoading}
						class="w-40 bg-surface-700 border border-surface-600 rounded-md
							px-2.5 py-1 text-xs text-surface-100 placeholder-surface-500
							focus:outline-none focus:border-accent-500 disabled:opacity-50"
					/>
					<span class="text-surface-500 text-xs">/</span>
					<input
						bind:value={publishRepo}
						placeholder="plugin-name"
						disabled={urlPublishLoading}
						class="flex-1 bg-surface-700 border border-surface-600 rounded-md
							px-2.5 py-1 text-xs text-surface-100 placeholder-surface-500
							focus:outline-none focus:border-accent-500 disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={urlPublishLoading || !publishUrl}
						class="px-4 py-1 rounded-md text-xs font-medium transition-colors
							{urlPublishLoading
							? 'bg-surface-600 text-surface-400 cursor-wait'
							: 'bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer'}
							disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{urlPublishLoading ? 'Publishing...' : 'Publish'}
					</button>
				</div>

				<!-- Computed URL preview -->
				{#if publishUrl}
					<div class="text-[10px] text-surface-500 font-mono px-1 truncate">{publishUrl}</div>
				{/if}

				{#if urlPublishError}
					<div class="text-xs text-danger-400 px-1">{urlPublishError}</div>
				{/if}
				{#if urlPublishSuccess}
					<div class="text-xs text-success-400 px-1">{urlPublishSuccess}</div>
				{/if}
			</form>
		{/if}
	</div>

	<!-- Content -->
	<div class="flex flex-1 overflow-hidden relative">
		<!-- Main grid area -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if isLoading}
				<div class="flex items-center justify-center h-full">
					<div class="text-center text-surface-400">
						<div class="text-2xl mb-2 animate-pulse">{'\u{1F3EA}'}</div>
						<div class="text-sm">Loading appstore...</div>
					</div>
				</div>
			{:else if error}
				<div class="flex items-center justify-center h-full">
					<div class="text-center">
						<div class="text-2xl mb-2">{'\u{26A0}'}</div>
						<div class="text-sm text-danger-400">{error}</div>
						<button
							onclick={fetchAll}
							class="mt-4 px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
						>
							Retry
						</button>
					</div>
				</div>
			{:else if activeTab === 'browse'}
				<!-- Browse tab -->
				{#if filteredCatalog.length === 0}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						{#if searchQuery.trim()}
							<div class="text-2xl mb-3 text-surface-500">{'\u{1F50D}'}</div>
							<p class="text-sm text-surface-400">No apps matching "{searchQuery}"</p>
						{:else}
							<div class="text-2xl mb-3 text-surface-500">{'\u{1F4E6}'}</div>
							<p class="text-sm text-surface-400">No apps available yet</p>
						{/if}
					</div>
				{:else}
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{#each filteredCatalog as item (item.plugin_id)}
							{@const action = getActionState(item)}
							{@const loading = actionLoading === item.plugin_id}
							{@const price = formatPrice(item)}
							<div
								class="group rounded-xl border border-surface-600 bg-surface-800/80
									hover:border-accent-500/50 hover:bg-surface-800 transition-all"
							>
								<!-- Card header (clickable for details) -->
								<button
									onclick={() => openDetail(item.offering_id)}
									class="w-full text-left p-4 pb-2 cursor-pointer"
								>
									<div class="flex items-start gap-3">
										<span class="text-2xl shrink-0">{resolveEmoji(item.icon, '\u{1F4E6}')}</span>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<span class="font-medium text-sm text-surface-100 truncate">
													{item.name}
												</span>
												<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-surface-600 shrink-0">
													v{item.version}
												</span>
												<span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0
													{price === 'Free'
													? 'bg-success-500/15 text-success-400'
													: 'bg-accent-500/15 text-accent-400'}">
													{price}
												</span>
											</div>
											<div class="text-[11px] text-surface-500 mt-0.5">{item.org}</div>
											{#if item.description}
												<div class="text-xs text-surface-400 mt-2 line-clamp-2">
													{item.description}
												</div>
											{/if}
										</div>
									</div>
								</button>

								<!-- Card footer with tags + action -->
								<div class="px-4 pb-3 pt-1 flex items-center justify-between gap-2">
									<div class="flex gap-1 flex-wrap min-w-0">
										{#each parseTags(item.tags).slice(0, 3) as tag}
											<span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-500">
												{tag}
											</span>
										{/each}
									</div>

									<button
										onclick={(e) => { e.stopPropagation(); handleAction(item); }}
										disabled={loading || action === 'revoked'}
										class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
											{loading
											? 'bg-surface-600 text-surface-400 cursor-wait'
											: action === 'get'
												? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
												: action === 'install'
													? 'bg-success-500 text-surface-50 hover:bg-success-400'
													: action === 'installed'
														? 'bg-surface-700 text-surface-300 hover:bg-danger-500/20 hover:text-danger-400 border border-surface-600'
														: action === 'update'
															? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
															: 'bg-surface-700 text-surface-500 cursor-not-allowed'}"
									>
										{#if loading}
											...
										{:else if action === 'get'}
											{price === 'Free' ? 'Get' : `Buy (${price})`}
										{:else if action === 'install'}
											Install
										{:else if action === 'installed'}
											Uninstall
										{:else if action === 'update'}
											Update
										{:else}
											Revoked
										{/if}
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{:else if activeTab === 'my-plugins'}
				<!-- My Apps tab -->
				{#if licensedPlugins.length === 0}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						<div class="text-2xl mb-3 text-surface-500">{'\u{1F4E6}'}</div>
						<h3 class="text-sm font-medium text-surface-200 mb-1">No apps yet</h3>
						<p class="text-xs text-surface-400">
							Browse the catalog and get apps to see them here
						</p>
						<button
							onclick={() => (activeTab = 'browse')}
							class="mt-4 px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
						>
							Browse Catalog
						</button>
					</div>
				{:else}
					<div class="space-y-2">
						{#each licensedPlugins as item (item.plugin_id)}
							{@const action = getActionState(item)}
							{@const loading = actionLoading === item.plugin_id}
							<div
								class="flex items-center gap-4 p-3 rounded-xl border border-surface-600
									bg-surface-800/80 hover:border-surface-500 transition-all"
							>
								<span class="text-xl shrink-0">{resolveEmoji(item.icon, '\u{1F4E6}')}</span>
								<div class="flex-1 min-w-0">
									<button
										onclick={() => openDetail(item.offering_id)}
										class="text-left cursor-pointer"
									>
										<div class="flex items-center gap-2">
											<span class="font-medium text-sm text-surface-100">{item.name}</span>
											<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-surface-600">
												v{item.installed_version ?? item.version}
											</span>
											{#if item.status_label}
												<span class="text-[10px] px-1.5 py-0.5 rounded-full
													{statusBadgeClass(item.available_actions ?? [])}">
													{item.status_label}
												</span>
											{/if}
										</div>
										{#if item.description}
											<div class="text-xs text-surface-400 mt-0.5 truncate">{item.description}</div>
										{/if}
									</button>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									<button
										onclick={() => handleAction(item)}
										disabled={loading || action === 'revoked'}
										class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
											{loading
											? 'bg-surface-600 text-surface-400 cursor-wait'
											: action === 'install'
												? 'bg-success-500 text-surface-50 hover:bg-success-400'
												: action === 'installed'
													? 'bg-surface-700 text-danger-400 hover:bg-danger-500/20 border border-surface-600'
													: action === 'update'
														? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
														: 'bg-surface-700 text-surface-500 cursor-not-allowed'}"
									>
										{#if loading}
											...
										{:else if action === 'install'}
											Install
										{:else if action === 'installed'}
											Uninstall
										{:else if action === 'update'}
											Update
										{:else}
											Revoked
										{/if}
									</button>
									{#if item.license_id && action !== 'revoked'}
										<button
											onclick={() => requestDanger(item, 'revoke')}
											disabled={loading}
											class="px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer
												text-surface-500 hover:text-danger-400 hover:bg-danger-500/10"
											title="Revoke license"
										>
											Revoke
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Detail panel (slide-over) -->
		{#if selectedPlugin || detailLoading}
			<!-- Backdrop -->
			<button
				onclick={closeDetail}
				class="absolute inset-0 bg-surface-950/50 z-10"
				aria-label="Close detail"
			></button>

			<!-- Panel -->
			<div class="absolute top-0 right-0 bottom-0 w-[400px] max-w-[90vw] z-20
				bg-surface-800 border-l border-surface-600 overflow-y-auto shadow-2xl">
				{#if detailLoading}
					<div class="flex items-center justify-center h-full">
						<div class="text-surface-400 animate-pulse">Loading...</div>
					</div>
				{:else if selectedPlugin}
					{@const detail = selectedPlugin}
					{@const detailAsItem = {
						...detail,
						license_id: detail.license?.license_id ?? null,
						installed: detail.installed ?? null,
						installed_version: detail.license?.installed_version ?? null,
						status_label: detail.status_label ?? null
					} satisfies OfferingItem}
					{@const detailAction = detail.license?.revoked_at != null
						? 'revoked'
						: getActionState(detailAsItem)}
					{@const detailActionLoading = actionLoading === detail.plugin_id}
					{@const detailPrice = formatPrice(detail)}

					<!-- Close button -->
					<button
						onclick={closeDetail}
						class="absolute top-3 right-3 w-8 h-8 rounded-lg bg-surface-700 text-surface-400
							hover:bg-surface-600 hover:text-surface-200 flex items-center justify-center text-sm z-10 cursor-pointer"
					>
						{'\u{2715}'}
					</button>

					<div class="p-6 space-y-6">
						<!-- Header -->
						<div class="flex items-start gap-4 pr-10">
							<span class="text-4xl">{resolveEmoji(detail.icon, '\u{1F4E6}')}</span>
							<div>
								<h2 class="text-lg font-bold text-surface-100">{detail.name}</h2>
								<div class="text-xs text-surface-500">{detail.org}</div>
								<div class="text-xs text-surface-400 mt-1">v{detail.version}</div>
							</div>
						</div>

						{#if detail.description}
							<p class="text-sm text-surface-300 leading-relaxed">{detail.description}</p>
						{/if}

						<!-- Pricing -->
						<div class="space-y-3">
							<h3 class="text-[11px] text-surface-500 uppercase tracking-wider">Pricing</h3>
							<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
								<span class="text-surface-500">License</span>
								<span class="text-surface-300">
									{#if !detail.license_type || detail.license_type === 'free'}
										Free
									{:else if detail.license_type === 'subscription'}
										Subscription
									{:else}
										One-time
									{/if}
								</span>

								<span class="text-surface-500">Price</span>
								<span class="font-medium {detailPrice === 'Free' ? 'text-success-400' : 'text-accent-400'}">
									{detailPrice}
								</span>

								{#if detail.license_type === 'subscription' && detail.duration_days}
									<span class="text-surface-500">Duration</span>
									<span class="text-surface-300">
										{detail.duration_days === 365 ? '1 year' : detail.duration_days === 30 ? '1 month' : `${detail.duration_days} days`}
									</span>
								{/if}

								{#if detail.node_limit && detail.node_limit > 0}
									<span class="text-surface-500">Node limit</span>
									<span class="text-surface-300">{detail.node_limit} node{detail.node_limit > 1 ? 's' : ''}</span>
								{/if}

								{#if detail.selling_formula && detail.selling_formula !== 'free'}
									<span class="text-surface-500">Formula</span>
									<span class="text-surface-300">{detail.selling_formula}</span>
								{/if}
							</div>
						</div>

						<!-- Action button -->
						<button
							onclick={() => handleAction(detailAsItem)}
							disabled={detailActionLoading || detailAction === 'revoked'}
							class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer
								{detailActionLoading
								? 'bg-surface-600 text-surface-400 cursor-wait'
								: detailAction === 'get'
									? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
									: detailAction === 'install'
										? 'bg-success-500 text-surface-50 hover:bg-success-400'
										: detailAction === 'installed'
											? 'bg-surface-700 text-surface-300 hover:bg-danger-500/20 hover:text-danger-400 border border-surface-600'
											: detailAction === 'update'
												? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
												: 'bg-surface-700 text-surface-500 cursor-not-allowed'}"
						>
							{#if detailActionLoading}
								Processing...
							{:else if detailAction === 'get'}
								{detailPrice === 'Free' ? 'Get (Free)' : `Buy (${detailPrice})`}
							{:else if detailAction === 'install'}
								Install
							{:else if detailAction === 'installed'}
								Uninstall
							{:else if detailAction === 'update'}
								Update to v{detail.version}
							{:else}
								License Revoked
							{/if}
						</button>

						<!-- Revoke license (separate from uninstall) -->
						{#if detail.license && !detail.license.revoked_at}
							<button
								onclick={() => requestDanger(detailAsItem, 'revoke')}
								class="w-full py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
									text-surface-500 hover:text-danger-400 hover:bg-danger-500/10"
							>
								Revoke License
							</button>
						{/if}

						<!-- Tags -->
						{#if parseTags(detail.tags).length > 0}
							<div>
								<h3 class="text-[11px] text-surface-500 uppercase tracking-wider mb-2">Tags</h3>
								<div class="flex gap-1.5 flex-wrap">
									{#each parseTags(detail.tags) as tag}
										<span class="text-xs px-2 py-1 rounded-lg bg-surface-700 text-surface-300 border border-surface-600">
											{tag}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Info grid -->
						<div class="space-y-3">
							<h3 class="text-[11px] text-surface-500 uppercase tracking-wider">Details</h3>
							<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
								<span class="text-surface-500">{detail.plugin_type === 'in_vm' && detail.package_url ? 'Package' : 'OCI Image'}</span>
								{#if detail.plugin_type === 'in_vm' && detail.package_url}
									<span class="text-surface-300 font-mono break-all">{detail.package_url}</span>
								{:else if detail.oci_image}
									<span class="text-surface-300 font-mono break-all">{detail.oci_image}</span>
								{/if}

								{#if detail.publisher_identity}
									<span class="text-surface-500">Publisher</span>
									<span class="text-surface-300 font-mono break-all">{detail.publisher_identity}</span>
								{/if}

								{#if detail.homepage}
									<span class="text-surface-500">Homepage</span>
									<span class="text-accent-400 break-all">{detail.homepage}</span>
								{/if}

								{#if detail.min_daemon_version}
									<span class="text-surface-500">Min Daemon</span>
									<span class="text-surface-300">v{detail.min_daemon_version}</span>
								{/if}
							</div>
						</div>

						<!-- Trust & Verification -->
						{#if detail.publisher_identity || detail.manifest_checksum || detail.oci_image_verified}
							<div class="space-y-3">
								<h3 class="text-[11px] text-surface-500 uppercase tracking-wider">Trust & Verification</h3>
								<div class="space-y-2">
									<div class="flex items-center gap-2 text-xs">
										<span class="{detail.publisher_identity ? 'text-success-400' : 'text-warning-400'}">
											{detail.publisher_identity ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
										</span>
										<span class="text-surface-400">Publisher</span>
										<span class="text-surface-300 truncate">
											{detail.publisher_identity ?? 'Unknown'}
										</span>
									</div>
									<div class="flex items-center gap-2 text-xs">
										<span class="{detail.author_signature ? 'text-success-400' : 'text-warning-400'}">
											{detail.author_signature ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
										</span>
										<span class="text-surface-400">Manifest signed</span>
										<span class="text-surface-300">
											{detail.author_signature ? 'Yes' : 'No'}
										</span>
									</div>
									<div class="flex items-center gap-2 text-xs">
										<span class="{detail.oci_image_verified === 1 ? 'text-success-400' : 'text-warning-400'}">
											{detail.oci_image_verified === 1 ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
										</span>
										<span class="text-surface-400">Container verified</span>
										<span class="text-surface-300">
											{detail.oci_image_verified === 1 ? 'Yes' : 'No'}
										</span>
									</div>
									{#if detail.manifest_checksum}
										<div class="mt-2 p-2 rounded-lg bg-surface-900/50 border border-surface-700">
											<div class="text-[10px] text-surface-500 mb-1">Manifest SHA-256</div>
											<div class="text-[10px] text-surface-400 font-mono break-all">{detail.manifest_checksum}</div>
										</div>
									{/if}
									{#if detail.oci_image_digest}
										<div class="p-2 rounded-lg bg-surface-900/50 border border-surface-700">
											<div class="text-[10px] text-surface-500 mb-1">Image Digest</div>
											<div class="text-[10px] text-surface-400 font-mono break-all">{detail.oci_image_digest}</div>
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- License info -->
						{#if detail.license}
							<div class="space-y-3">
								<h3 class="text-[11px] text-surface-500 uppercase tracking-wider">License</h3>
								<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
									<span class="text-surface-500">Status</span>
									<span class="{detail.license.revoked_at ? 'text-danger-400' : 'text-success-400'}">
										{detail.license.status_label ?? 'Active'}
									</span>

									{#if detail.license.granted_at}
										<span class="text-surface-500">Granted</span>
										<span class="text-surface-300">{new Date(detail.license.granted_at).toLocaleDateString()}</span>
									{/if}

									{#if detail.license.accepted_at}
										<span class="text-surface-500">Accepted</span>
										<span class="text-surface-300">{new Date(detail.license.accepted_at).toLocaleDateString()}</span>
									{/if}

									{#if detail.license.installed_version}
										<span class="text-surface-500">Installed</span>
										<span class="text-surface-300">v{detail.license.installed_version}</span>
									{/if}

									{#if detail.license.expired_at}
										<span class="text-surface-500">Expired</span>
										<span class="text-surface-300">{new Date(detail.license.expired_at).toLocaleDateString()}</span>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Danger confirmation modal (uninstall / revoke) -->
	{#if dangerTarget}
		{@const target = dangerTarget}
		<button
			onclick={cancelDanger}
			class="fixed inset-0 bg-surface-950/70 z-30"
			aria-label="Close confirmation"
		></button>

		<div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40
			w-[400px] max-w-[90vw] bg-surface-800 rounded-2xl border border-surface-600
			shadow-2xl overflow-hidden">
			<FocusTrap>
			<div class="p-6 space-y-5">
				<div class="flex items-start gap-4">
					<span class="text-3xl">{dangerAction === 'uninstall' ? '\u{1F5D1}' : '\u{26D4}'}</span>
					<div>
						<h2 class="text-base font-bold text-surface-100">
							{dangerAction === 'uninstall' ? 'Uninstall' : 'Revoke License'}
						</h2>
						<div class="text-xs text-surface-500">{target.name} &middot; {target.org}</div>
					</div>
				</div>

				<p class="text-xs text-surface-400 leading-relaxed">
					{#if dangerAction === 'uninstall'}
						This will stop and remove this app. Your license remains active and you can reinstall later.
					{:else}
						This will permanently revoke your license for this app. If the app is installed, it will be uninstalled first. You will need to buy a new license to use it again.
					{/if}
				</p>

				<div class="flex gap-3">
					<button
						onclick={cancelDanger}
						class="flex-1 py-2.5 rounded-lg text-sm font-medium
							bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600
							transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						onclick={confirmDanger}
						class="flex-1 py-2.5 rounded-lg text-sm font-medium
							bg-danger-500 text-surface-50 hover:bg-danger-400
							transition-colors cursor-pointer"
					>
						{dangerAction === 'uninstall' ? 'Uninstall' : 'Revoke License'}
					</button>
				</div>
			</div>
			</FocusTrap>
		</div>
	{/if}

	<!-- Install confirmation modal -->
	{#if installTarget}
		{@const target = installTarget}
		<!-- Backdrop -->
		<button
			onclick={cancelInstall}
			disabled={installStep === 'buying' || installStep === 'installing'}
			class="fixed inset-0 bg-surface-950/70 z-30"
			aria-label="Close install modal"
		></button>

		<div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40
			w-[420px] max-w-[90vw] bg-surface-800 rounded-2xl border border-surface-600
			shadow-2xl overflow-hidden">
			<FocusTrap>

			{#if installStep === 'confirm'}
				<!-- Trust ceremony -->
				<div class="p-6 space-y-5">
					<div class="flex items-start gap-4">
						<span class="text-3xl">{resolveEmoji(target.icon, '\u{1F4E6}')}</span>
						<div>
							<h2 class="text-base font-bold text-surface-100">{target.name}</h2>
							<div class="text-xs text-surface-500">{target.org} &middot; v{target.version}</div>
						</div>
					</div>

					<!-- Trust indicators -->
					<div class="space-y-2 p-3 rounded-xl bg-surface-900/50 border border-surface-700">
						<div class="text-[11px] text-surface-500 uppercase tracking-wider mb-2">Trust verification</div>
						<div class="flex items-center gap-2 text-xs">
							<span class="{target.publisher_identity ? 'text-success-400' : 'text-warning-400'}">
								{target.publisher_identity ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
							</span>
							<span class="text-surface-300">
								Publisher: {target.publisher_identity ?? 'Unknown'}
							</span>
						</div>
						<div class="flex items-center gap-2 text-xs">
							<span class="{target.author_signature ? 'text-success-400' : 'text-warning-400'}">
								{target.author_signature ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
							</span>
							<span class="text-surface-300">
								Manifest {target.author_signature ? 'signed' : 'not signed'}
							</span>
						</div>
						{#if target.plugin_type === 'in_vm'}
							<div class="flex items-center gap-2 text-xs">
								<span class="text-info-400">{'\u{2139}\u{FE0F}'}</span>
								<span class="text-surface-300">In-VM plugin (no container needed)</span>
							</div>
						{:else}
							<div class="flex items-center gap-2 text-xs">
								<span class="{target.oci_image_verified === 1 ? 'text-success-400' : 'text-warning-400'}">
									{target.oci_image_verified === 1 ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
								</span>
								<span class="text-surface-300">
									Container image {target.oci_image_verified === 1 ? 'verified' : 'not verified'}
								</span>
							</div>
						{/if}
					</div>

					{#if target.plugin_type === 'in_vm'}
						<p class="text-xs text-surface-400 leading-relaxed">
							This app will run inside the daemon (in-VM plugin). Only install apps from publishers you trust.
						</p>
					{:else}
						<p class="text-xs text-surface-400 leading-relaxed">
							This app will run as a container on your system. Only install apps from publishers you trust.
						</p>
					{/if}

					<div class="flex gap-3">
						<button
							onclick={cancelInstall}
							class="flex-1 py-2.5 rounded-lg text-sm font-medium
								bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600
								transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							onclick={confirmInstall}
							class="flex-1 py-2.5 rounded-lg text-sm font-medium
								bg-accent-600 text-surface-50 hover:bg-accent-500
								transition-colors cursor-pointer"
						>
							{getActionState(target) === 'get'
								? (formatPrice(target) === 'Free' ? 'Get & Install' : `Buy & Install (${formatPrice(target)})`)
								: getActionState(target) === 'update'
									? `Update to v${target.version}`
									: 'Install'}
						</button>
					</div>
				</div>

			{:else if installStep === 'buying'}
				<div class="p-8 text-center space-y-4">
					<div class="text-3xl animate-pulse">{'\u{1F4B3}'}</div>
					<div class="text-sm text-surface-200 font-medium">Acquiring license...</div>
					<div class="text-xs text-surface-500">Setting up {target.name}</div>
				</div>

			{:else if installStep === 'installing'}
				<div class="p-8 text-center space-y-4">
					<div class="text-3xl animate-pulse">{'\u{1F4E6}'}</div>
					<div class="text-sm text-surface-200 font-medium">Installing...</div>
					<div class="text-xs text-surface-500">Setting up {target.name} v{target.version}</div>
				</div>

			{:else if installStep === 'downloading'}
				<div class="p-6 space-y-5">
					<div class="flex items-start gap-4">
						<span class="text-3xl">{resolveEmoji(target.icon, '\u{1F4E6}')}</span>
						<div>
							<h2 class="text-base font-bold text-surface-100">{target.name}</h2>
							<div class="text-xs text-surface-500">
								{target.plugin_type === 'in_vm' ? 'Loading plugin' : 'Downloading container image'}
							</div>
						</div>
					</div>

					<div class="space-y-2">
						<div class="w-full bg-surface-700 rounded-full h-2.5 overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-300
									{$pullStatus.status === 'error' ? 'bg-danger-500' : 'bg-accent-500'}"
								style="width: {$pullStatus.status === 'ready' || $pullStatus.status === 'complete' ? 100 : Math.max($pullStatus.percent ?? 0, 2)}%"
							></div>
						</div>
						<div class="flex justify-between text-[10px]">
							<span class="text-surface-400">
								{#if $pullStatus.status === 'ready' || $pullStatus.status === 'complete'}
									Ready
								{:else if $pullStatus.status === 'error'}
									Failed
								{:else if $pullStatus.status === 'extracting'}
									{target.plugin_type === 'in_vm' ? 'Extracting package...' : 'Extracting layers...'}
								{:else}
									{target.plugin_type === 'in_vm' ? 'Downloading package...' : 'Downloading image...'}
								{/if}
							</span>
							{#if $pullStatus.percent != null && $pullStatus.status !== 'ready' && $pullStatus.status !== 'complete'}
								<span class="text-surface-500">{$pullStatus.percent}%</span>
							{/if}
						</div>
						{#if $pullStatus.line}
							<div class="text-[10px] text-surface-500 font-mono truncate">{$pullStatus.line}</div>
						{/if}
					</div>

					{#if $pullStatus.status === 'ready' || $pullStatus.status === 'complete'}
						<div class="flex gap-3">
							<button
								onclick={() => cancelInstall()}
								class="flex-1 py-2.5 rounded-lg text-sm font-medium
									bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600
									transition-colors cursor-pointer"
							>
								Close
							</button>
							<button
								onclick={() => startPlugin(target.plugin_id)}
								class="flex-1 py-2.5 rounded-lg text-sm font-medium
									bg-success-500 text-surface-50 hover:bg-success-400
									transition-colors cursor-pointer"
							>
								Start
							</button>
						</div>
					{:else if $pullStatus.status === 'error'}
						<div class="text-xs text-danger-400 bg-surface-900/50 p-3 rounded-lg border border-surface-700">
							{$pullStatus.reason ?? 'Pull failed'}
						</div>
						<button
							onclick={() => cancelInstall()}
							class="w-full py-2.5 rounded-lg text-sm font-medium
								bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600
								transition-colors cursor-pointer"
						>
							Close
						</button>
					{:else}
						<button
							onclick={cancelPull}
							class="w-full py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
								text-surface-500 hover:text-danger-400 hover:bg-danger-500/10"
						>
							Cancel Download
						</button>
					{/if}
				</div>

			{:else if installStep === 'done'}
				<div class="p-8 text-center space-y-4">
					<div class="text-3xl">{'\u{2705}'}</div>
					<div class="text-sm text-success-400 font-medium">Installed!</div>
					<div class="text-xs text-surface-500">{target.name} is ready to use</div>
				</div>

			{:else if installStep === 'error'}
				<div class="p-6 space-y-4">
					<div class="text-center space-y-3">
						<div class="text-3xl">{'\u{274C}'}</div>
						<div class="text-sm text-danger-400 font-medium">Installation failed</div>
						{#if installModalError}
							<div class="text-xs text-surface-400 bg-surface-900/50 p-3 rounded-lg border border-surface-700">
								{installModalError}
							</div>
						{/if}
					</div>
					<button
						onclick={cancelInstall}
						class="w-full py-2.5 rounded-lg text-sm font-medium
							bg-surface-700 text-surface-300 hover:bg-surface-600 border border-surface-600
							transition-colors cursor-pointer"
					>
						Close
					</button>
				</div>
			{/if}
			</FocusTrap>
		</div>
	{/if}
</div>

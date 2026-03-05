<script lang="ts">
	import { get as apiGet, post } from '$lib/api';
	import { goto } from '$app/navigation';
	import { health } from '$lib/stores/daemon';
	import { settings } from '$lib/stores/settings';
	import type { CatalogItem, PluginDetail } from '$lib/types/appstore';
	import { getActionState, formatPrice, parseTags } from '$lib/types/appstore';

	// --- Data ---
	let catalog: CatalogItem[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);

	// --- UI state ---
	type Tab = 'browse' | 'my-plugins';
	let activeTab: Tab = $state('browse');
	let searchQuery = $state('');
	let selectedPlugin: PluginDetail | null = $state(null);
	let detailLoading = $state(false);
	let actionLoading: string | null = $state(null);

	// --- Publish from URL state ---
	let showUrlPublish = $state(false);
	let publishUrl = $state('');
	let urlPublishLoading = $state(false);
	let urlPublishError: string | null = $state(null);
	let urlPublishSuccess: string | null = $state(null);

	// --- Install confirmation modal state ---
	type InstallStep = 'confirm' | 'buying' | 'installing' | 'done' | 'error';
	let installTarget: CatalogItem | null = $state(null);
	let installStep: InstallStep = $state('confirm');
	let installModalError: string | null = $state(null);

	// --- Danger action confirmation state (uninstall / revoke) ---
	type DangerAction = 'uninstall' | 'revoke';
	let dangerTarget: CatalogItem | null = $state(null);
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
		catalog.filter((p) => p.installed === 1).length
	);

	// --- Fetch ---
	async function fetchCatalog() {
		try {
			const res = await apiGet<{ items: CatalogItem[] }>('/api/appstore/catalog');
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

	async function openDetail(pluginId: string) {
		detailLoading = true;
		try {
			const res = await apiGet<{ plugin: PluginDetail }>(`/api/appstore/catalog/${encodeURIComponent(pluginId)}`);
			selectedPlugin = res.plugin;
		} catch (e) {
			console.error('[appstore] Failed to load plugin detail:', e);
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		selectedPlugin = null;
	}

	// --- Actions ---
	async function buyLicense(item: CatalogItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/licenses/buy', {
				user_id: 'rl',
				plugin_id: item.plugin_id,
				plugin_name: item.name,
				oci_image: item.oci_image
			});
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.plugin_id);
			}
		} catch (e) {
			console.error('[appstore] Buy license failed:', e);
		} finally {
			actionLoading = null;
		}
	}

	async function installPlugin(item: CatalogItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/plugins/install', {
				license_id: item.license_id,
				plugin_id: item.plugin_id,
				plugin_name: item.name,
				version: item.version,
				oci_image: item.oci_image
			});
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.plugin_id);
			}
		} catch (e) {
			console.error('[appstore] Install failed:', e);
		} finally {
			actionLoading = null;
		}
	}

	async function removePlugin(item: CatalogItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/plugins/remove', {
				license_id: item.license_id,
				plugin_id: item.plugin_id
			});
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.plugin_id);
			}
		} catch (e) {
			console.error('[appstore] Remove failed:', e);
		} finally {
			actionLoading = null;
		}
	}

	async function revokeLicense(item: CatalogItem) {
		actionLoading = item.plugin_id;
		try {
			await post('/api/appstore/licenses/revoke', {
				license_id: item.license_id
			});
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.plugin_id);
			}
		} catch (e) {
			console.error('[appstore] Revoke license failed:', e);
		} finally {
			actionLoading = null;
		}
	}

	function requestDanger(item: CatalogItem, action: DangerAction) {
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
		if (!publishUrl.trim()) return;
		urlPublishLoading = true;
		urlPublishError = null;
		urlPublishSuccess = null;
		try {
			await post('/api/appstore/publish-from-url', {
				url: publishUrl.trim()
			});
			urlPublishSuccess = 'Published successfully';
			publishUrl = '';
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

	function requestInstall(item: CatalogItem) {
		installTarget = item;
		installStep = 'confirm';
		installModalError = null;
	}

	function cancelInstall() {
		installTarget = null;
		installStep = 'confirm';
		installModalError = null;
	}

	async function confirmInstall() {
		if (!installTarget) return;
		const item = installTarget;
		const action = getActionState(item);

		try {
			if (action === 'get') {
				installStep = 'buying';
				await post('/api/appstore/licenses/buy', {
					user_id: 'rl',
					plugin_id: item.plugin_id,
					plugin_name: item.name,
					oci_image: item.oci_image
				});
				await fetchCatalog();
				const updated = catalog.find((p) => p.plugin_id === item.plugin_id);
				if (updated && updated.license_id) {
					installStep = 'installing';
					await post('/api/appstore/plugins/install', {
						license_id: updated.license_id,
						plugin_id: updated.plugin_id,
						plugin_name: updated.name,
						version: updated.version,
						oci_image: updated.oci_image
					});
				}
			} else {
				installStep = 'installing';
				await post('/api/appstore/plugins/install', {
					license_id: item.license_id,
					plugin_id: item.plugin_id,
					plugin_name: item.name,
					version: item.version,
					oci_image: item.oci_image
				});
			}
			installStep = 'done';
			await fetchCatalog();
			if (selectedPlugin && selectedPlugin.plugin_id === item.plugin_id) {
				await openDetail(item.plugin_id);
			}
			setTimeout(() => cancelInstall(), 1500);
		} catch (e) {
			installModalError = e instanceof Error ? e.message : String(e);
			installStep = 'error';
		}
	}

	function handleAction(item: CatalogItem) {
		const state = getActionState(item);
		switch (state) {
			case 'get':
			case 'install':
			case 'update':
				requestInstall(item);
				break;
			case 'installed':
				requestDanger(item, 'uninstall');
				break;
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
				placeholder="Search plugins..."
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
				My Plugins
				{#if installedCount > 0}
					<span class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-success-500/20 text-success-400">
						{installedCount}
					</span>
				{/if}
			</button>
		</div>

		<!-- Publish from URL form -->
		{#if showUrlPublish}
			<div class="mt-3 flex flex-col gap-2">
				<form
					onsubmit={(e) => { e.preventDefault(); publishFromUrl(); }}
					class="flex gap-2"
				>
					<input
						bind:value={publishUrl}
						placeholder="https://github.com/org/repo"
						disabled={urlPublishLoading}
						class="flex-1 bg-surface-700 border border-surface-600 rounded-lg
							px-3 py-1.5 text-xs text-surface-100 placeholder-surface-500
							focus:outline-none focus:border-accent-500
							disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={urlPublishLoading || !publishUrl.trim()}
						class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors
							{urlPublishLoading
							? 'bg-surface-600 text-surface-400 cursor-wait'
							: 'bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer'}
							disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{urlPublishLoading ? 'Publishing...' : 'Publish'}
					</button>
				</form>
				{#if urlPublishError}
					<div class="text-xs text-danger-400 px-1">{urlPublishError}</div>
				{/if}
				{#if urlPublishSuccess}
					<div class="text-xs text-success-400 px-1">{urlPublishSuccess}</div>
				{/if}
			</div>
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
							<p class="text-sm text-surface-400">No plugins matching "{searchQuery}"</p>
						{:else}
							<div class="text-2xl mb-3 text-surface-500">{'\u{1F4E6}'}</div>
							<p class="text-sm text-surface-400">No plugins available yet</p>
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
									onclick={() => openDetail(item.plugin_id)}
									class="w-full text-left p-4 pb-2 cursor-pointer"
								>
									<div class="flex items-start gap-3">
										<span class="text-2xl shrink-0">{item.icon ?? '\u{1F4E6}'}</span>
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
				<!-- My Plugins tab -->
				{#if licensedPlugins.length === 0}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						<div class="text-2xl mb-3 text-surface-500">{'\u{1F4E6}'}</div>
						<h3 class="text-sm font-medium text-surface-200 mb-1">No plugins yet</h3>
						<p class="text-xs text-surface-400">
							Browse the catalog and get plugins to see them here
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
								<span class="text-xl shrink-0">{item.icon ?? '\u{1F4E6}'}</span>
								<div class="flex-1 min-w-0">
									<button
										onclick={() => openDetail(item.plugin_id)}
										class="text-left cursor-pointer"
									>
										<div class="flex items-center gap-2">
											<span class="font-medium text-sm text-surface-100">{item.name}</span>
											<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-400 border border-surface-600">
												v{item.installed_version ?? item.version}
											</span>
											{#if item.installed === 1}
												<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-success-500/20 text-success-400">
													Running
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
					{@const detailAction = detail.license
						? (detail.license.installed === 1
							? (detail.version !== detail.license.installed_version ? 'update' : 'installed')
							: (detail.license.revoked === 1 ? 'revoked' : 'install'))
						: 'get'}
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
							<span class="text-4xl">{detail.icon ?? '\u{1F4E6}'}</span>
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
							onclick={() => {
								const asItem: CatalogItem = {
									...detail,
									license_id: detail.license?.license_id ?? null,
									installed: detail.license?.installed ?? null,
									installed_version: detail.license?.installed_version ?? null
								};
								handleAction(asItem);
							}}
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
						{#if detail.license && !detail.license.revoked}
							<button
								onclick={() => {
									const asItem = {
										...detail,
										license_id: detail.license?.license_id ?? null,
										installed: detail.license?.installed ?? null,
										installed_version: detail.license?.installed_version ?? null
									};
									requestDanger(asItem, 'revoke');
								}}
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
								<span class="text-surface-500">OCI Image</span>
								<span class="text-surface-300 font-mono break-all">{detail.oci_image}</span>

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
										<span class="{detail.seller_signature ? 'text-success-400' : 'text-warning-400'}">
											{detail.seller_signature ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
										</span>
										<span class="text-surface-400">Manifest signed</span>
										<span class="text-surface-300">
											{detail.seller_signature ? 'Yes' : 'No'}
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
									<span class="{detail.license.revoked ? 'text-danger-400' : 'text-success-400'}">
										{detail.license.revoked ? 'Revoked' : 'Active'}
									</span>

									<span class="text-surface-500">Granted</span>
									<span class="text-surface-300">{new Date(detail.license.granted_at).toLocaleDateString()}</span>

									{#if detail.license.installed === 1}
										<span class="text-surface-500">Installed</span>
										<span class="text-surface-300">
											v{detail.license.installed_version}
											{#if detail.license.installed_at}
												 ({new Date(detail.license.installed_at).toLocaleDateString()})
											{/if}
										</span>
									{/if}

									{#if detail.license.upgraded_at}
										<span class="text-surface-500">Last Upgrade</span>
										<span class="text-surface-300">{new Date(detail.license.upgraded_at).toLocaleDateString()}</span>
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
						This will stop and remove the container for this plugin. Your license remains active and you can reinstall later.
					{:else}
						This will permanently revoke your license for this plugin. If the plugin is installed, it will be uninstalled first. You will need to buy a new license to use it again.
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

			{#if installStep === 'confirm'}
				<!-- Trust ceremony -->
				<div class="p-6 space-y-5">
					<div class="flex items-start gap-4">
						<span class="text-3xl">{target.icon ?? '\u{1F4E6}'}</span>
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
							<span class="{target.seller_signature ? 'text-success-400' : 'text-warning-400'}">
								{target.seller_signature ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
							</span>
							<span class="text-surface-300">
								Manifest {target.seller_signature ? 'signed' : 'not signed'}
							</span>
						</div>
						<div class="flex items-center gap-2 text-xs">
							<span class="{target.oci_image_verified === 1 ? 'text-success-400' : 'text-warning-400'}">
								{target.oci_image_verified === 1 ? '\u{2705}' : '\u{26A0}\u{FE0F}'}
							</span>
							<span class="text-surface-300">
								Container image {target.oci_image_verified === 1 ? 'verified' : 'not verified'}
							</span>
						</div>
					</div>

					<p class="text-xs text-surface-400 leading-relaxed">
						This app will run as a container on your system. Only install apps from publishers you trust.
					</p>

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
					<div class="text-sm text-surface-200 font-medium">Provisioning container...</div>
					<div class="text-xs text-surface-500">Installing {target.name} v{target.version}</div>
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
		</div>
	{/if}
</div>

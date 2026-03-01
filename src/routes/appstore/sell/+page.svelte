<script lang="ts">
	import { get as apiGet, post, patch } from '$lib/api';
	import { goto } from '$app/navigation';
	import { health } from '$lib/stores/daemon';
	import { settings } from '$lib/stores/settings';
	import type { SellerListing } from '$lib/types/appstore';
	import { getListingStatus, formatPrice, parseTags } from '$lib/types/appstore';

	// --- Data ---
	let listings: SellerListing[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);

	// --- UI state ---
	type View = 'list' | 'create' | 'edit';
	let view: View = $state('list');
	let actionLoading: string | null = $state(null);
	let confirmAction: { id: string; type: 'announce' | 'publish' } | null = $state(null);

	// --- Form state ---
	let editingListing: SellerListing | null = $state(null);
	let form = $state({
		plugin_id: '',
		plugin_name: '',
		description: '',
		icon: '',
		oci_image: '',
		github_repo: '',
		org: '',
		version: '',
		manifest_tag: '',
		homepage: '',
		min_daemon_version: '',
		selling_formula: 'free',
		license_type: 'free',
		fee_cents: 0,
		fee_currency: 'EUR',
		duration_days: 30,
		node_limit: 1,
		tags: '',
		publisher_identity: ''
	});

	function resetForm() {
		form = {
			plugin_id: '',
			plugin_name: '',
			description: '',
			icon: '',
			oci_image: '',
			github_repo: '',
			org: '',
			version: '',
			manifest_tag: '',
			homepage: '',
			min_daemon_version: '',
			selling_formula: 'free',
			license_type: 'free',
			fee_cents: 0,
			fee_currency: 'EUR',
			duration_days: 30,
			node_limit: 1,
			tags: '',
			publisher_identity: $settings?.identity?.hecate_user_id ?? ''
		};
	}

	function populateForm(listing: SellerListing) {
		const tags = parseTags(listing.tags);
		form = {
			plugin_id: listing.plugin_id,
			plugin_name: listing.name ?? '',
			description: listing.description ?? '',
			icon: listing.icon ?? '',
			oci_image: listing.oci_image ?? '',
			github_repo: listing.github_repo ?? '',
			org: listing.org ?? '',
			version: listing.version ?? '',
			manifest_tag: listing.manifest_tag ?? '',
			homepage: listing.homepage ?? '',
			min_daemon_version: listing.min_daemon_version ?? '',
			selling_formula: listing.selling_formula ?? 'free',
			license_type: listing.license_type ?? 'free',
			fee_cents: listing.fee_cents ?? 0,
			fee_currency: listing.fee_currency ?? 'EUR',
			duration_days: listing.duration_days ?? 30,
			node_limit: listing.node_limit ?? 1,
			tags: tags.join(', '),
			publisher_identity: listing.publisher_identity ?? ''
		};
	}

	// --- Fetch ---
	async function fetchListings() {
		try {
			const res = await apiGet<{ items: SellerListing[] }>('/api/appstore/seller/listings');
			listings = res.items;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function fetchAll() {
		isLoading = true;
		error = null;
		await fetchListings();
		isLoading = false;
	}

	// --- Actions ---
	function startCreate() {
		resetForm();
		editingListing = null;
		view = 'create';
	}

	function startEdit(listing: SellerListing) {
		editingListing = listing;
		populateForm(listing);
		view = 'edit';
	}

	function cancelForm() {
		view = 'list';
		editingListing = null;
	}

	async function submitCreate() {
		actionLoading = 'create';
		try {
			const tagsArray = form.tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			await post('/api/appstore/licenses/initiate', {
				seller_id: $settings?.identity?.hecate_user_id,
				plugin_id: form.plugin_id,
				plugin_name: form.plugin_name,
				description: form.description,
				icon: form.icon || null,
				oci_image: form.oci_image,
				github_repo: form.github_repo || null,
				org: form.org || null,
				version: form.version,
				manifest_tag: form.manifest_tag || null,
				homepage: form.homepage || null,
				min_daemon_version: form.min_daemon_version || null,
				selling_formula: form.selling_formula,
				license_type: form.license_type,
				fee_cents: form.license_type === 'free' ? 0 : form.fee_cents,
				fee_currency: form.fee_currency,
				duration_days: form.license_type === 'subscription' ? form.duration_days : null,
				node_limit: form.node_limit,
				tags: JSON.stringify(tagsArray),
				publisher_identity: form.publisher_identity
			});
			view = 'list';
			await fetchListings();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			actionLoading = null;
		}
	}

	async function submitEdit() {
		if (!editingListing) return;
		actionLoading = 'edit';
		try {
			const tagsArray = form.tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			await patch(`/api/appstore/licenses/${encodeURIComponent(editingListing.plugin_id)}`, {
				plugin_name: form.plugin_name,
				description: form.description,
				icon: form.icon || null,
				oci_image: form.oci_image,
				github_repo: form.github_repo || null,
				org: form.org || null,
				version: form.version,
				manifest_tag: form.manifest_tag || null,
				homepage: form.homepage || null,
				min_daemon_version: form.min_daemon_version || null,
				selling_formula: form.selling_formula,
				license_type: form.license_type,
				fee_cents: form.license_type === 'free' ? 0 : form.fee_cents,
				fee_currency: form.fee_currency,
				duration_days: form.license_type === 'subscription' ? form.duration_days : null,
				node_limit: form.node_limit,
				tags: JSON.stringify(tagsArray),
				publisher_identity: form.publisher_identity
			});
			view = 'list';
			editingListing = null;
			await fetchListings();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			actionLoading = null;
		}
	}

	async function confirmLifecycle() {
		if (!confirmAction) return;
		actionLoading = confirmAction.id;
		try {
			await post(`/api/appstore/licenses/${encodeURIComponent(confirmAction.id)}/${confirmAction.type}`, {});
			confirmAction = null;
			await fetchListings();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			actionLoading = null;
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
			{#if view !== 'list'}
				<button
					onclick={cancelForm}
					class="text-surface-400 hover:text-surface-200 text-xs cursor-pointer"
				>
					{'\u{2190}'} Back
				</button>
			{:else}
				<button onclick={() => goto('/appstore')} class="text-surface-400 hover:text-surface-200 text-xs">
					{'\u{2190}'} Appstore
				</button>
			{/if}

			<span class="text-xl">{'\u{1F4CB}'}</span>
			<h1 class="text-sm font-semibold text-surface-100">
				{#if view === 'create'}
					New Listing
				{:else if view === 'edit'}
					Edit Listing
				{:else}
					My Listings
				{/if}
			</h1>

			{#if $health}
				<div class="flex items-center gap-1.5 text-[10px]">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-success-400"></span>
					<span class="text-surface-500">v{$health.version}</span>
				</div>
			{/if}

			<div class="flex-1"></div>

			{#if view === 'list'}
				<button
					onclick={startCreate}
					class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600 text-surface-50
						hover:bg-accent-500 transition-colors cursor-pointer"
				>
					+ New Listing
				</button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if isLoading}
			<div class="flex items-center justify-center h-full">
				<div class="text-center text-surface-400">
					<div class="text-2xl mb-2 animate-pulse">{'\u{1F4CB}'}</div>
					<div class="text-sm">Loading listings...</div>
				</div>
			</div>
		{:else if error}
			<div class="flex items-center justify-center h-full">
				<div class="text-center">
					<div class="text-2xl mb-2">{'\u{26A0}'}</div>
					<div class="text-sm text-danger-400 mb-4">{error}</div>
					<button
						onclick={() => { error = null; fetchAll(); }}
						class="px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
					>
						Retry
					</button>
				</div>
			</div>
		{:else if view === 'list'}
			<!-- Confirmation overlay -->
			{#if confirmAction}
				<div class="fixed inset-0 bg-surface-950/60 z-50 flex items-center justify-center">
					<div class="bg-surface-800 border border-surface-600 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
						<h3 class="text-sm font-semibold text-surface-100 mb-3">
							{confirmAction.type === 'announce' ? 'Announce Listing?' : 'Publish Listing?'}
						</h3>
						<p class="text-xs text-surface-400 mb-6">
							{confirmAction.type === 'announce'
								? 'This will make your listing visible as pre-release. Continue?'
								: 'This will make your listing live in the marketplace. Continue?'}
						</p>
						<div class="flex gap-2 justify-end">
							<button
								onclick={() => (confirmAction = null)}
								class="px-3 py-1.5 rounded-lg text-xs text-surface-400 hover:text-surface-200
									hover:bg-surface-700 transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								onclick={confirmLifecycle}
								disabled={actionLoading !== null}
								class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
									{confirmAction.type === 'announce'
									? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
									: 'bg-success-500 text-surface-50 hover:bg-success-400'}
									{actionLoading ? 'opacity-50 cursor-wait' : ''}"
							>
								{actionLoading ? '...' : 'Confirm'}
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Listing grid -->
			{#if listings.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="text-2xl mb-3 text-surface-500">{'\u{1F4CB}'}</div>
					<h3 class="text-sm font-medium text-surface-200 mb-1">No listings yet</h3>
					<p class="text-xs text-surface-400 mb-4">
						Create your first plugin listing to start selling
					</p>
					<button
						onclick={startCreate}
						class="px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
					>
						+ New Listing
					</button>
				</div>
			{:else}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each listings as listing (listing.plugin_id)}
						{@const status = getListingStatus(listing.status)}
						{@const price = formatPrice(listing)}
						{@const loading = actionLoading === listing.plugin_id}
						<div
							class="group rounded-xl border border-surface-600 bg-surface-800/80
								hover:border-surface-500 transition-all"
						>
							<!-- Card body -->
							<div class="p-4 pb-2">
								<div class="flex items-start gap-3">
									<span class="text-2xl shrink-0">{listing.icon ?? '\u{1F4E6}'}</span>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap">
											<span class="font-medium text-sm text-surface-100 truncate">
												{listing.name}
											</span>
											<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700
												text-surface-400 border border-surface-600 shrink-0">
												v{listing.version}
											</span>
											<span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0
												{status === 'draft'
												? 'bg-amber-500/15 text-amber-400'
												: status === 'announced'
													? 'bg-blue-500/15 text-blue-400'
													: 'bg-success-500/15 text-success-400'}">
												{status === 'draft' ? 'Draft' : status === 'announced' ? 'Announced' : 'Published'}
											</span>
										</div>
										<div class="text-[11px] text-surface-500 mt-0.5">{listing.org}</div>
										<div class="text-[10px] mt-1
											{price === 'Free'
											? 'text-success-400'
											: 'text-accent-400'}">
											{price}
										</div>
										{#if listing.description}
											<div class="text-xs text-surface-400 mt-2 line-clamp-2">
												{listing.description}
											</div>
										{/if}
									</div>
								</div>
							</div>

							<!-- Card footer with actions -->
							<div class="px-4 pb-3 pt-1 flex items-center justify-end gap-2">
								{#if status === 'draft'}
									<button
										onclick={() => startEdit(listing)}
										class="px-3 py-1.5 rounded-lg text-xs font-medium text-surface-300
											bg-surface-700 hover:bg-surface-600 border border-surface-600
											transition-colors cursor-pointer"
									>
										Edit
									</button>
									<button
										onclick={() => (confirmAction = { id: listing.plugin_id, type: 'announce' })}
										disabled={loading}
										class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600
											text-surface-50 hover:bg-accent-500 transition-colors cursor-pointer
											{loading ? 'opacity-50 cursor-wait' : ''}"
									>
										{loading ? '...' : 'Announce'}
									</button>
								{:else if status === 'announced'}
									<button
										onclick={() => startEdit(listing)}
										class="px-3 py-1.5 rounded-lg text-xs font-medium text-surface-300
											bg-surface-700 hover:bg-surface-600 border border-surface-600
											transition-colors cursor-pointer"
									>
										Edit
									</button>
									<button
										onclick={() => (confirmAction = { id: listing.plugin_id, type: 'publish' })}
										disabled={loading}
										class="px-3 py-1.5 rounded-lg text-xs font-medium bg-success-500
											text-surface-50 hover:bg-success-400 transition-colors cursor-pointer
											{loading ? 'opacity-50 cursor-wait' : ''}"
									>
										{loading ? '...' : 'Publish'}
									</button>
								{:else}
									<span class="text-[10px] text-surface-500 italic">Published</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- Create / Edit form -->
			<div class="max-w-2xl mx-auto space-y-6">
				<!-- Section 1: Plugin Identity -->
				<div class="space-y-4">
					<h2 class="text-[11px] text-surface-500 uppercase tracking-wider">Plugin Identity</h2>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="plugin_id" class="block text-xs text-surface-400 mb-1">Plugin ID</label>
							<input
								id="plugin_id"
								bind:value={form.plugin_id}
								disabled={view === 'edit'}
								placeholder="hecate-social/trader"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
							/>
						</div>
						<div>
							<label for="plugin_name" class="block text-xs text-surface-400 mb-1">Display Name</label>
							<input
								id="plugin_name"
								bind:value={form.plugin_name}
								placeholder="Trader Bot"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
					</div>

					<div>
						<label for="description" class="block text-xs text-surface-400 mb-1">Description</label>
						<textarea
							id="description"
							bind:value={form.description}
							rows="3"
							placeholder="What does this plugin do?"
							class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
								text-xs text-surface-100 placeholder-surface-500 focus:outline-none
								focus:border-accent-500 resize-none"
						></textarea>
					</div>

					<div>
						<label for="icon" class="block text-xs text-surface-400 mb-1">Icon</label>
						<input
							id="icon"
							bind:value={form.icon}
							placeholder="Emoji or filename"
							class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
								text-xs text-surface-100 placeholder-surface-500 focus:outline-none
								focus:border-accent-500"
						/>
					</div>
				</div>

				<!-- Section 2: Distribution -->
				<div class="space-y-4">
					<h2 class="text-[11px] text-surface-500 uppercase tracking-wider">Distribution</h2>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="oci_image" class="block text-xs text-surface-400 mb-1">OCI Image</label>
							<input
								id="oci_image"
								bind:value={form.oci_image}
								placeholder="ghcr.io/org/app:0.1.0"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="github_repo" class="block text-xs text-surface-400 mb-1">GitHub Repo</label>
							<input
								id="github_repo"
								bind:value={form.github_repo}
								placeholder="hecate-social/hecate-trader"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="org" class="block text-xs text-surface-400 mb-1">Organization</label>
							<input
								id="org"
								bind:value={form.org}
								placeholder="hecate-social"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="version" class="block text-xs text-surface-400 mb-1">Version</label>
							<input
								id="version"
								bind:value={form.version}
								placeholder="0.1.0"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="manifest_tag" class="block text-xs text-surface-400 mb-1">Manifest Tag</label>
							<input
								id="manifest_tag"
								bind:value={form.manifest_tag}
								placeholder="latest"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="homepage" class="block text-xs text-surface-400 mb-1">Homepage</label>
							<input
								id="homepage"
								bind:value={form.homepage}
								placeholder="https://example.com"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
						<div>
							<label for="min_daemon_version" class="block text-xs text-surface-400 mb-1">Min Daemon Version</label>
							<input
								id="min_daemon_version"
								bind:value={form.min_daemon_version}
								placeholder="0.10.0"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
					</div>
				</div>

				<!-- Section 3: Pricing -->
				<div class="space-y-4">
					<h2 class="text-[11px] text-surface-500 uppercase tracking-wider">Pricing</h2>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="license_type" class="block text-xs text-surface-400 mb-1">License Type</label>
							<select
								id="license_type"
								bind:value={form.license_type}
								onchange={() => { form.selling_formula = form.license_type; }}
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 focus:outline-none focus:border-accent-500"
							>
								<option value="free">Free</option>
								<option value="one_time">One-time</option>
								<option value="subscription">Subscription</option>
							</select>
						</div>
						<div>
							<label for="fee_currency" class="block text-xs text-surface-400 mb-1">Currency</label>
							<select
								id="fee_currency"
								bind:value={form.fee_currency}
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 focus:outline-none focus:border-accent-500"
							>
								<option value="EUR">EUR</option>
								<option value="USD">USD</option>
							</select>
						</div>
						{#if form.license_type !== 'free'}
							<div>
								<label for="fee_cents" class="block text-xs text-surface-400 mb-1">
									Price ({form.fee_currency === 'USD' ? '$' : '\u20AC'})
								</label>
								<input
									id="fee_cents"
									type="number"
									min="0"
									step="1"
									bind:value={form.fee_cents}
									placeholder="999"
									class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
										text-xs text-surface-100 placeholder-surface-500 focus:outline-none
										focus:border-accent-500"
								/>
								<span class="text-[10px] text-surface-500 mt-0.5 block">
									In cents ({(form.fee_cents / 100).toFixed(2)} {form.fee_currency})
								</span>
							</div>
						{/if}
						{#if form.license_type === 'subscription'}
							<div>
								<label for="duration_days" class="block text-xs text-surface-400 mb-1">Duration (days)</label>
								<input
									id="duration_days"
									type="number"
									min="1"
									bind:value={form.duration_days}
									class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
										text-xs text-surface-100 focus:outline-none focus:border-accent-500"
								/>
							</div>
						{/if}
						<div>
							<label for="node_limit" class="block text-xs text-surface-400 mb-1">Node Limit</label>
							<input
								id="node_limit"
								type="number"
								min="1"
								bind:value={form.node_limit}
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 focus:outline-none focus:border-accent-500"
							/>
						</div>
					</div>
				</div>

				<!-- Section 4: Tags & Identity -->
				<div class="space-y-4">
					<h2 class="text-[11px] text-surface-500 uppercase tracking-wider">Tags & Identity</h2>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="tags" class="block text-xs text-surface-400 mb-1">Tags</label>
							<input
								id="tags"
								bind:value={form.tags}
								placeholder="ai, trading, bot"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
							<span class="text-[10px] text-surface-500 mt-0.5 block">Comma-separated</span>
						</div>
						<div>
							<label for="publisher_identity" class="block text-xs text-surface-400 mb-1">Publisher Identity</label>
							<input
								id="publisher_identity"
								bind:value={form.publisher_identity}
								placeholder="hecate_user_id"
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
									text-xs text-surface-100 placeholder-surface-500 focus:outline-none
									focus:border-accent-500"
							/>
						</div>
					</div>
				</div>

				<!-- Form actions -->
				<div class="flex gap-2 justify-end pt-2 pb-4">
					<button
						onclick={cancelForm}
						class="px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-surface-200
							hover:bg-surface-700 transition-colors cursor-pointer"
					>
						Cancel
					</button>
					{#if view === 'create'}
						<button
							onclick={submitCreate}
							disabled={actionLoading === 'create' || !form.plugin_id || !form.plugin_name}
							class="px-4 py-2 rounded-lg text-xs font-medium bg-accent-600 text-surface-50
								hover:bg-accent-500 transition-colors cursor-pointer
								disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{actionLoading === 'create' ? 'Creating...' : 'Create Listing'}
						</button>
					{:else}
						<button
							onclick={submitEdit}
							disabled={actionLoading === 'edit'}
							class="px-4 py-2 rounded-lg text-xs font-medium bg-accent-600 text-surface-50
								hover:bg-accent-500 transition-colors cursor-pointer
								disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{actionLoading === 'edit' ? 'Saving...' : 'Save Changes'}
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

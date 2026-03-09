<script lang="ts">
	import { page } from '$app/state';
	import { apps } from '$lib/stores/apps';
	import { post, ApiError } from '$lib/api';
	import { toastError, toastSuccess, toastInfo } from '$lib/stores/toasts';
	import { onDestroy } from 'svelte';

	const WARN_TIMEOUT_MS = 30_000;
	const ERROR_TIMEOUT_MS = 60_000;

	const pluginName = $derived(page.params?.name ?? '');
	const app = $derived($apps.get(pluginName));

	const statusLabel = $derived(app?.info.status_label ?? '');
	const isInstalled = $derived(!!app && statusLabel !== 'Removed');
	const isOnline = $derived(app?.online ?? false);
	const isDownloading = $derived(statusLabel === 'Downloading');
	const isReady = $derived(statusLabel === 'Ready' || statusLabel === 'Installed');
	const isStopped = $derived(statusLabel === 'Stopped');
	const isStarting = $derived(statusLabel === 'Starting');

	// Timeout tracking for Starting state
	let now = $state(Date.now());
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (isStarting || isDownloading) {
			if (!tickInterval) {
				tickInterval = setInterval(() => { now = Date.now(); }, 1000);
			}
		} else {
			if (tickInterval) {
				clearInterval(tickInterval);
				tickInterval = null;
			}
		}
	});

	onDestroy(() => {
		if (tickInterval) clearInterval(tickInterval);
	});

	const elapsed = $derived(app ? now - app.statusChangedAt : 0);
	const startingWarn = $derived(isStarting && elapsed >= WARN_TIMEOUT_MS && elapsed < ERROR_TIMEOUT_MS);
	const startingError = $derived(isStarting && elapsed >= ERROR_TIMEOUT_MS);
	const downloadingWarn = $derived(isDownloading && elapsed >= ERROR_TIMEOUT_MS);

	let starting = $state(false);

	async function startPlugin() {
		if (!app?.info.plugin_id) return;
		starting = true;
		try {
			await post('/api/plugins/start', {
				plugin_id: app.info.plugin_id
			});
			toastInfo(`Starting ${pluginName}...`);
		} catch (e) {
			if (e instanceof ApiError && e.code === 'plugin_already_running') {
				toastInfo(`${pluginName} is already running`);
			} else {
				toastError(`Failed to start ${pluginName}`);
			}
		} finally {
			starting = false;
		}
	}

	let container: HTMLElement | undefined = $state();
	let mountedElement: HTMLElement | null = null;
	let mountedFor: string | null = null;

	$effect(() => {
		// Cleanup previous if plugin changed
		if (mountedElement && mountedFor !== pluginName) {
			mountedElement.remove();
			mountedElement = null;
			mountedFor = null;
		}

		// Create custom element
		if (app?.tag && container && !mountedElement) {
			const el = document.createElement(app.tag);
			(el as any).api = app.api;
			container.appendChild(el);
			mountedElement = el;
			mountedFor = pluginName;
		}
	});

	onDestroy(() => {
		if (mountedElement) {
			mountedElement.remove();
			mountedElement = null;
			mountedFor = null;
		}
	});

	// Status details panel
	let showDetails = $state(false);

	function formatElapsed(ms: number): string {
		const secs = Math.floor(ms / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ${secs % 60}s`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ${mins % 60}m`;
	}

	function formatTimestamp(ts: number | null): string {
		if (!ts) return '--';
		return new Date(ts * 1000).toLocaleString();
	}
</script>

{#if isOnline}
	<div bind:this={container} class="h-full overflow-auto p-4"></div>
{:else if isDownloading}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<div class="relative">
			<span class="text-4xl animate-pulse">{'\u{2B07}\uFE0F'}</span>
		</div>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		<p class="text-sm text-surface-400">
			Downloading app...
		</p>
		<div class="w-48 h-1.5 bg-surface-700 rounded-full overflow-hidden">
			<div class="h-full bg-hecate-500 rounded-full animate-pulse" style="width: 60%"></div>
		</div>
		{#if downloadingWarn}
			<div class="mt-2 px-4 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 max-w-sm">
				<p class="text-xs text-amber-400 font-medium">Download is taking longer than expected</p>
				<p class="text-xs text-surface-400 mt-1">The OCI image may be large or the registry may be slow. Check your network connection.</p>
			</div>
		{/if}
	</div>
{:else if isStarting}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		{#if startingError}
			<span class="text-4xl">{'\u{26A0}\uFE0F'}</span>
		{:else}
			<span class="text-4xl animate-spin">{'\u{2699}\uFE0F'}</span>
		{/if}
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		{#if startingError}
			<div class="px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 max-w-sm text-center">
				<p class="text-sm text-red-400 font-medium">App failed to start</p>
				<p class="text-xs text-surface-400 mt-1">The container may have crashed or the socket was never created. Check daemon logs for details.</p>
			</div>
		{:else if startingWarn}
			<p class="text-sm text-surface-400">Starting app...</p>
			<div class="px-4 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 max-w-sm text-center">
				<p class="text-xs text-amber-400 font-medium">Taking longer than usual</p>
				<p class="text-xs text-surface-400 mt-1">First start may take a moment while the container initializes.</p>
			</div>
		{:else}
			<p class="text-sm text-surface-400">Starting app...</p>
		{/if}
	</div>
{:else if isReady || isStopped}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F4E6}'}</span>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			{isStopped ? 'App is stopped.' : 'App is installed and ready.'}
			Press Start to launch it.
		</p>
		<button
			onclick={startPlugin}
			disabled={starting}
			class="px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
				{starting
					? 'bg-surface-600 text-surface-400'
					: 'bg-hecate-600 hover:bg-hecate-500 text-white'}"
		>
			{starting ? 'Starting...' : 'Start App'}
		</button>
	</div>
{:else if isInstalled}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F50C}'}</span>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			App is {statusLabel.toLowerCase() || 'installed'}. Waiting for it to become ready.
		</p>
	</div>
{:else}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F50C}'}</span>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			This app is not installed. Visit the App Store to install it.
		</p>
	</div>
{/if}

{#if app && isInstalled}
	<div class="absolute bottom-2 right-2 z-10">
		<button
			onclick={() => showDetails = !showDetails}
			class="text-[10px] text-surface-500 hover:text-surface-300 transition-colors px-2 py-1 rounded hover:bg-surface-700/50 cursor-pointer"
			aria-label="Toggle status details"
		>
			{showDetails ? 'Hide details' : 'Details'}
		</button>

		{#if showDetails}
			<div class="absolute bottom-7 right-0 w-72 bg-surface-800 border border-surface-600 rounded-lg shadow-xl p-3 text-xs">
				<table class="w-full">
					<tbody>
						<tr>
							<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Status</td>
							<td class="text-surface-200 py-0.5">
								<span class="inline-flex items-center gap-1.5">
									<span class="size-1.5 rounded-full {isOnline ? 'bg-emerald-400' : statusLabel === 'Starting' ? 'bg-amber-400 animate-pulse' : 'bg-surface-500'}"></span>
									{statusLabel || 'Unknown'}
								</span>
							</td>
						</tr>
						{#if isStarting || isDownloading}
							<tr>
								<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Elapsed</td>
								<td class="text-surface-200 py-0.5">{formatElapsed(elapsed)}</td>
							</tr>
						{/if}
						<tr>
							<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Version</td>
							<td class="text-surface-200 py-0.5">{app.manifest?.version ?? app.info.installed_version ?? '--'}</td>
						</tr>
						<tr>
							<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Image</td>
							<td class="text-surface-200 py-0.5 break-all">{app.info.oci_image}</td>
						</tr>
						<tr>
							<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Installed</td>
							<td class="text-surface-200 py-0.5">{formatTimestamp(app.info.installed_at)}</td>
						</tr>
						{#if app.info.upgraded_at}
							<tr>
								<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Upgraded</td>
								<td class="text-surface-200 py-0.5">{formatTimestamp(app.info.upgraded_at)}</td>
							</tr>
						{/if}
						{#if app.manifest?.tag}
							<tr>
								<td class="text-surface-500 pr-3 py-0.5 whitespace-nowrap">Element</td>
								<td class="text-surface-200 py-0.5 font-mono">&lt;{app.manifest.tag}&gt;</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

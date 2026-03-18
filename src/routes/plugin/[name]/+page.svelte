<script lang="ts">
	import { page } from '$app/state';
	import { apps, appsLoaded } from '$lib/stores/apps';
	import { post, ApiError } from '$lib/api';
	import { refreshApps } from '$lib/stores/apps';
	import { toastError, toastSuccess, toastInfo } from '$lib/stores/toasts';
	import { onDestroy } from 'svelte';

	const WARN_TIMEOUT_MS = 30_000;
	const ERROR_TIMEOUT_MS = 60_000;

	const pluginName = $derived(page.params?.name ?? '');
	const app = $derived($apps.get(pluginName));

	// Technical route name derived from plugin_id (e.g. "hecate-apps/hecate-app-snake-duel" -> "hecate-app-snake-duel")
	// Used for SSE routing where the daemon needs the technical name, not the display name.
	const techName = $derived.by(() => {
		if (!app?.info.plugin_id) return pluginName;
		const id = app.info.plugin_id;
		const slash = id.lastIndexOf('/');
		return slash >= 0 ? id.substring(slash + 1) : id;
	});

	const displayName = $derived(
		app?.manifest?.display_name || app?.info.display_name || pluginName.charAt(0).toUpperCase() + pluginName.slice(1)
	);

	const statusLabel = $derived(app?.info.status_label ?? '');
	const isInstalled = $derived(!!app && statusLabel !== 'Removed');
	const isOnline = $derived(app?.online ?? false);
	const debugError = $derived((app as any)?._debugError as string | undefined);

	// Available-actions-based state: drives button visibility and UI state
	const actions = $derived(app?.info.available_actions ?? []);
	const canStart = $derived(actions.includes('start'));
	const canStop = $derived(actions.includes('stop'));
	// In progress: either no actions (daemon transitioning) or running but not yet loaded in UI
	const inProgress = $derived(!!app && isInstalled && (
		(actions.length === 0) || (canStop && !isOnline)
	));

	const isContainer = $derived(app?.info.plugin_type === 'container');

	// Phase-specific UI details derived from statusLabel
	const phase = $derived.by(() => {
		const label = statusLabel.toLowerCase();
		switch (label) {
			case 'downloading':
				return { icon: '\u{2B07}\uFE0F', hint: isContainer ? 'Pulling image from registry...' : 'Downloading plugin package...' };
			case 'extracting':
			case 'extracted':
				return { icon: '\u{1F4E6}', hint: 'Unpacking plugin package...' };
			case 'starting':
				return { icon: '\u{1F680}', hint: isContainer ? 'Starting container...' : 'Loading plugin...' };
			case 'activating':
				return { icon: '\u{26A1}', hint: 'Loading code, creating stores, mounting routes...' };
			case 'running':
				return { icon: '\u{26A1}', hint: 'Connecting to plugin...' };
			case 'ready':
				return { icon: '\u{2705}', hint: 'Download complete. Preparing to start...' };
			default:
				return { icon: '\u{2699}\uFE0F', hint: '' };
		}
	});

	// Timeout tracking for in-progress states
	let now = $state(Date.now());
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (inProgress) {
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
	const progressWarn = $derived(inProgress && elapsed >= WARN_TIMEOUT_MS && elapsed < ERROR_TIMEOUT_MS);
	const progressError = $derived(inProgress && elapsed >= ERROR_TIMEOUT_MS);

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
				// Already running -- trigger refresh to bring online
				await refreshApps();
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
			(el as any).name = techName;
			// Pass query params as props (e.g., file_id from Briefcase)
			const urlParams = page.url?.searchParams;
			if (urlParams) {
				const fileId = urlParams.get('file_id');
				if (fileId) (el as any).fileId = fileId;
			}
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
{:else if inProgress}
	<div class="flex flex-col items-center justify-center h-full gap-5">
		{#if progressError}
			<span class="text-4xl">{'\u{26A0}\uFE0F'}</span>
		{:else}
			<span class="text-4xl {phase.icon === '\u{2699}\uFE0F' ? 'animate-spin' : 'animate-pulse'}">{phase.icon}</span>
		{/if}
		<h2 class="text-lg font-bold text-surface-100">{displayName}</h2>

		{#if progressError}
			<div class="flex flex-col items-center gap-2 max-w-sm text-center">
				<div class="px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 w-full">
					<p class="text-sm text-red-400 font-medium">App failed to start</p>
					<p class="text-xs text-surface-400 mt-1">The plugin may have crashed or timed out. Check daemon logs for details.</p>
				</div>
				{#if debugError}
					<p class="text-xs text-surface-500 font-mono break-all max-w-md">{debugError}</p>
				{/if}
			</div>
		{:else}
			<!-- Phase label -->
			<div class="flex flex-col items-center gap-1.5">
				<p class="text-sm font-medium text-surface-200">{statusLabel || 'Working'}...</p>
				{#if phase.hint}
					<p class="text-xs text-surface-500">{phase.hint}</p>
				{/if}
			</div>

			<!-- Progress bar -->
			<div class="w-56 h-1.5 bg-surface-700 rounded-full overflow-hidden">
				<div class="h-full bg-hecate-500 rounded-full animate-pulse" style="width: 60%"></div>
			</div>

			<!-- Elapsed time -->
			<p class="text-[11px] text-surface-600 tabular-nums">{formatElapsed(elapsed)}</p>

			{#if progressWarn}
				<div class="px-4 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 max-w-sm text-center">
					<p class="text-xs text-amber-400 font-medium">Taking longer than usual</p>
					<p class="text-xs text-surface-400 mt-1">First start may take a moment while the plugin initializes.</p>
				</div>
			{/if}
		{/if}
	</div>
{:else if canStart}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F4E6}'}</span>
		<h2 class="text-lg font-bold text-surface-100">{displayName}</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			{statusLabel}. Press Start to launch it.
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
		<h2 class="text-lg font-bold text-surface-100">{displayName}</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			{statusLabel || 'Installed'}. Waiting for it to become ready.
		</p>
		{#if debugError}
			<div class="mt-1 px-4 py-2 rounded-md bg-red-500/10 border border-red-500/30 max-w-lg">
				<p class="text-xs text-red-400 break-all">{debugError}</p>
			</div>
		{/if}
	</div>
{:else if !$appsLoaded}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl animate-pulse">{'\u{2699}\uFE0F'}</span>
		<p class="text-sm text-surface-400">Loading...</p>
	</div>
{:else}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F50C}'}</span>
		<h2 class="text-lg font-bold text-surface-100">{displayName}</h2>
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
									<span class="size-1.5 rounded-full {isOnline ? 'bg-emerald-400' : inProgress ? 'bg-amber-400 animate-pulse' : 'bg-surface-500'}"></span>
									{statusLabel || 'Unknown'}
								</span>
							</td>
						</tr>
						{#if inProgress}
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

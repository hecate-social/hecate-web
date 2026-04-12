<script lang="ts">
	import { onMount } from 'svelte';
	import { health } from '$lib/stores/daemon.js';
	import { appList } from '$lib/stores/apps';
	import { settings } from '$lib/stores/settings';
	import { nodeIdentity } from '$lib/stores/nodeIdentity';
	import { meta } from '$lib/stores/briefcase';
	import { fetchMeshStatus, type MeshStatus } from '$lib/stores/mesh';
	import { systemOverview, fetchSystemOverview } from '$lib/stores/observer/system';
	import { goto } from '$app/navigation';

	let meshStatus = $state<MeshStatus | null>(null);

	let onlineApps = $derived($appList.filter(a => a.online).length);

	let uptime = $derived.by(() => {
		const s = $health?.uptime_seconds;
		if (!s) return '';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	});

	let realmId = $derived($settings?.realms?.[0]?.realm_id ?? null);
	let realmAccount = $derived($settings?.realms?.[0]?.oauth_account ?? null);

	function formatBytes(bytes: number): string {
		if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	function timeAgo(ts: number): string {
		const diff = Math.floor((Date.now() - ts) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	function fileNameFromPath(p: string): string {
		return p.substring(p.lastIndexOf('/') + 1);
	}

	// Recent files from briefcase meta
	let recentFiles = $derived(($meta?.recent ?? []).slice(0, 8));

	onMount(async () => {
		try { meshStatus = await fetchMeshStatus(); } catch {}
		try { await fetchSystemOverview(); } catch {}
	});
</script>

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-xl mx-auto px-6 py-8 space-y-6">

			<!-- Header -->
			<div class="text-center space-y-2">
				<img src="/macula-symbol-dark.svg" alt="" class="w-16 h-16 mx-auto" />
				<div class="text-2xl font-bold text-macula-400">Hecate</div>
				<div class="text-base text-surface-400">Sovereign computing. No cloud required.</div>
				<div class="text-sm text-surface-500 font-mono">Built on Macula</div>
			</div>

			<!-- Status rows -->
			<div class="space-y-0.5 font-mono text-xs">
				{#if $health}
					<div class="flex gap-2">
						<span class="w-16 text-right text-surface-500 shrink-0">daemon</span>
						<span class="text-surface-300">
							v{$health.version} ·
							<span class="{$health.status === 'healthy' ? 'text-success-400' : 'text-warning-400'}">{$health.status}</span>
							{#if uptime} · up {uptime}{/if}
						</span>
					</div>
				{/if}

				<div class="flex gap-2">
					<span class="w-16 text-right text-surface-500 shrink-0">mesh</span>
					<span class="text-surface-300">
						{#if meshStatus}
							<span class="{meshStatus.connected ? 'text-success-400' : 'text-danger-400'}">{meshStatus.connected ? '\u25CF connected' : '\u25CB disconnected'}</span>
							{#if meshStatus.subscriptions.length > 0} · {meshStatus.subscriptions.length} subscriptions{/if}
						{:else}
							<span class="text-surface-600">loading...</span>
						{/if}
					</span>
				</div>

				{#if $nodeIdentity?.initialized}
					<div class="flex gap-2">
						<span class="w-16 text-right text-surface-500 shrink-0">node</span>
						<span class="text-surface-300">{$settings?.identity?.hostname ?? ''}</span>
					</div>
				{/if}

				{#if realmId}
					<div class="flex gap-2">
						<span class="w-16 text-right text-surface-500 shrink-0">realm</span>
						<span class="text-surface-300">{realmId}{#if realmAccount} · {realmAccount}{/if}</span>
					</div>
				{/if}

				<div class="flex gap-2">
					<span class="w-16 text-right text-surface-500 shrink-0">apps</span>
					<span class="text-surface-300">
						{onlineApps} online
						{#each $appList.filter(a => a.online) as app}
							<span class="text-surface-500">({app.info.display_name || app.info.name})</span>
						{/each}
					</span>
				</div>

				{#if $systemOverview}
					<div class="flex gap-2">
						<span class="w-16 text-right text-surface-500 shrink-0">system</span>
						<span class="text-surface-300">
							{formatBytes($systemOverview.memory.total)} ·
							{$systemOverview.processes.count.toLocaleString()} procs ·
							{$systemOverview.schedulers.online} schedulers
						</span>
					</div>
				{/if}
			</div>

			<!-- Recent files -->
			{#if recentFiles.length > 0}
				<div class="space-y-0.5">
					<div class="text-[9px] text-surface-500 uppercase tracking-wider mb-1">Recent</div>
					{#each recentFiles as filePath}
						<button
							class="w-full text-left px-2 py-0.5 text-xs flex items-center gap-2 text-surface-400 hover:text-surface-200 hover:bg-surface-800 rounded transition-colors cursor-pointer font-mono"
							onclick={() => goto('/briefcase/edit?path=' + encodeURIComponent(filePath))}
						>
							<span class="text-surface-600 shrink-0">{'\uD83D\uDCC4'}</span>
							<span class="flex-1 truncate">{fileNameFromPath(filePath)}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Hint -->
			<div class="text-center text-xs text-surface-600 space-y-0.5 pt-4">
				<div><span class="text-surface-500">Ctrl+P</span> to launch · <span class="text-surface-500">Ctrl+Shift+\u00B1</span> to zoom</div>
			</div>

		</div>
	</div>

	<!-- Status bar (minimal) -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-xs min-h-[24px]">
		<span class="text-surface-500">home</span>
		<div class="flex-1"></div>
		<span class="text-surface-600">Ctrl+P: launcher</span>
	</div>
</div>

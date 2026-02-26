<script lang="ts">
	import { onMount } from 'svelte';
	import { health } from '$lib/stores/daemon';
	import {
		settings,
		settingsLoading,
		settingsError,
		fetchSettings
	} from '$lib/stores/settings';
	import { nodeIdentity, fetchNodeIdentity } from '$lib/stores/nodeIdentity';
	import PairingFlow from '$lib/components/settings/PairingFlow.svelte';

	let copyFeedback: string | null = $state(null);

	function formatUptime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}

	function formatTimestamp(ms: number | null): string {
		if (!ms) return '-';
		return new Date(ms).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function copyToClipboard(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		copyFeedback = label;
		setTimeout(() => {
			copyFeedback = null;
		}, 1500);
	}

	function truncateKey(key: string): string {
		if (key.length <= 20) return key;
		return key.slice(0, 10) + '...' + key.slice(-6);
	}

	onMount(() => {
		fetchSettings();
		fetchNodeIdentity();
	});
</script>

<div class="flex flex-col h-full overflow-y-auto">
	<!-- Header -->
	<div class="border-b border-surface-600 bg-surface-800/50 px-6 py-4 shrink-0">
		<div class="flex items-center gap-3">
			<span class="text-xl">{'\u2699'}</span>
			<h1 class="text-sm font-semibold text-surface-100">Settings</h1>
			{#if $health}
				<div class="flex items-center gap-1.5 text-[10px]">
					<span class="inline-block w-1.5 h-1.5 rounded-full bg-success-400"></span>
					<span class="text-surface-500">v{$health.version}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 p-6 max-w-2xl">
		{#if $settingsLoading && !$settings}
			<div class="flex items-center justify-center py-20">
				<div class="text-center text-surface-400">
					<div class="text-2xl mb-2 animate-pulse">{'\u2699'}</div>
					<div class="text-sm">Loading settings...</div>
				</div>
			</div>
		{:else if $settingsError && !$settings}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="text-2xl mb-2">{'\u{26A0}'}</div>
				<div class="text-sm text-danger-400">{$settingsError}</div>
				<button
					onclick={fetchSettings}
					class="mt-4 px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer"
				>
					Retry
				</button>
			</div>
		{:else if $settings}
			<div class="space-y-6">
				<!-- Section 1: Node -->
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
					<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">
						Node
					</h2>
					{#if $nodeIdentity?.initialized}
						<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
							<span class="text-surface-500">MRI</span>
							<div class="flex items-center gap-2">
								<span
									class="text-surface-200 font-mono text-xs break-all"
									>{$nodeIdentity.mri}</span
								>
								<button
									onclick={() =>
										copyToClipboard($nodeIdentity?.mri ?? '', 'MRI')}
									class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 hover:text-surface-200 cursor-pointer transition-colors"
								>
									{copyFeedback === 'MRI' ? 'Copied' : 'Copy'}
								</button>
							</div>

							<span class="text-surface-500">Public Key</span>
							<div class="flex items-center gap-2">
								<span class="text-surface-200 font-mono text-xs"
									>{truncateKey($nodeIdentity.public_key)}</span
								>
								<button
									onclick={() =>
										copyToClipboard(
											$nodeIdentity?.public_key ?? '',
											'Key'
										)}
									class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 hover:text-surface-200 cursor-pointer transition-colors"
								>
									{copyFeedback === 'Key' ? 'Copied' : 'Copy'}
								</button>
							</div>

							<span class="text-surface-500">Hostname</span>
							<span class="text-surface-200"
								>{$settings.identity.hostname}</span
							>

							<span class="text-surface-500">User</span>
							<span class="text-surface-200"
								>{$settings.identity.linux_user}</span
							>
						</div>
					{:else}
						<div class="text-xs text-surface-500">
							Node identity is initializing. Restart the daemon if this persists.
						</div>
					{/if}
				</div>

				<!-- Section 2: Macula Account -->
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
					<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">
						Macula Account
					</h2>
					<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
						<span class="text-surface-500">Status</span>
						<span>
							{#if $settings.identity.paired}
								<span
									class="text-[10px] px-2 py-1 rounded-full bg-success-500/20 text-success-400 border border-success-500/30"
									>Paired</span
								>
							{:else}
								<span
									class="text-[10px] px-2 py-1 rounded-full bg-warning-500/20 text-warning-400 border border-warning-500/30"
									>Not paired</span
								>
							{/if}
						</span>

						{#if $settings.identity.paired}
							{#if $settings.identity.github_user}
								<span class="text-surface-500">GitHub</span>
								<span class="text-surface-200"
									>{$settings.identity.github_user}</span
								>
							{/if}

							{#if $settings.identity.realm}
								<span class="text-surface-500">Realm</span>
								<span class="text-surface-200"
									>{$settings.identity.realm}</span
								>
							{/if}

							<span class="text-surface-500">Paired since</span>
							<span class="text-surface-200"
								>{formatTimestamp($settings.identity.paired_at)}</span
							>
						{/if}
					</div>
				</div>

				<!-- Section 3: Pairing -->
				<PairingFlow />

				<!-- Section 4: Daemon -->
				{#if $health}
					<div
						class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4"
					>
						<h2
							class="text-xs font-semibold text-surface-300 uppercase tracking-wider"
						>
							Daemon
						</h2>
						<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
							<span class="text-surface-500">Status</span>
							<span
								class="{$health.status === 'healthy'
									? 'text-success-400'
									: 'text-warning-400'}"
							>
								{$health.status}
							</span>

							<span class="text-surface-500">Version</span>
							<span class="text-surface-200">{$health.version}</span>

							<span class="text-surface-500">Service</span>
							<span class="text-surface-200">{$health.service}</span>

							<span class="text-surface-500">Uptime</span>
							<span class="text-surface-200">
								{formatUptime($health.uptime_seconds)}
							</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

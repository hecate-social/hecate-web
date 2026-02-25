<script lang="ts">
	import { onMount } from 'svelte';
	import { health } from '$lib/stores/daemon';
	import {
		settings,
		settingsLoading,
		settingsError,
		fetchSettings,
		pairNode,
		unpairNode
	} from '$lib/stores/settings';

	let githubInput = $state('');
	let pairingInProgress = $state(false);

	function formatUptime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}

	onMount(() => {
		fetchSettings();
	});

	async function handlePair() {
		if (!githubInput.trim()) return;
		pairingInProgress = true;
		await pairNode(githubInput.trim());
		githubInput = '';
		pairingInProgress = false;
	}

	async function handleUnpair() {
		pairingInProgress = true;
		await unpairNode();
		pairingInProgress = false;
	}
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
				<!-- Identity card -->
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
					<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Identity</h2>
					<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
						<span class="text-surface-500">Node ID</span>
						<span class="text-surface-200 font-mono text-xs break-all">{$settings.identity.node_id}</span>

						<span class="text-surface-500">Hostname</span>
						<span class="text-surface-200">{$settings.identity.hostname}</span>

						<span class="text-surface-500">User</span>
						<span class="text-surface-200">{$settings.identity.linux_user}</span>

						<span class="text-surface-500">Realm</span>
						<span class="text-surface-200">{$settings.identity.realm}</span>

						<span class="text-surface-500">Paired</span>
						<span class="{$settings.identity.paired ? 'text-success-400' : 'text-surface-400'}">
							{$settings.identity.paired ? 'Yes' : 'No'}
						</span>

						{#if $settings.identity.github_user}
							<span class="text-surface-500">GitHub</span>
							<span class="text-surface-200">{$settings.identity.github_user}</span>
						{/if}
					</div>
				</div>

				<!-- Pairing -->
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
					<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Pairing</h2>

					{#if $settings.identity.paired}
						<div class="flex items-center gap-3">
							<div class="flex items-center gap-2 flex-1">
								<span class="text-[10px] px-2 py-1 rounded-full bg-success-500/20 text-success-400 border border-success-500/30">
									Paired with {$settings.identity.github_user}
								</span>
							</div>
							<button
								onclick={handleUnpair}
								disabled={pairingInProgress}
								class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
									bg-surface-700 text-surface-300 hover:bg-danger-500/20 hover:text-danger-400 border border-surface-600
									disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{pairingInProgress ? '...' : 'Unpair'}
							</button>
						</div>
					{:else}
						<div class="flex items-end gap-3">
							<div class="flex-1">
								<label for="github-user" class="block text-[11px] text-surface-400 mb-1">GitHub Username</label>
								<input
									id="github-user"
									type="text"
									bind:value={githubInput}
									placeholder="username"
									class="w-full bg-surface-700 border border-surface-600 rounded-lg
										px-3 py-2 text-xs text-surface-100 placeholder-surface-500
										focus:outline-none focus:border-accent-500"
									onkeydown={(e) => { if (e.key === 'Enter') handlePair(); }}
								/>
							</div>
							<button
								onclick={handlePair}
								disabled={pairingInProgress || !githubInput.trim()}
								class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
									{pairingInProgress || !githubInput.trim()
									? 'bg-surface-600 text-surface-400 cursor-not-allowed'
									: 'bg-accent-600 text-surface-50 hover:bg-accent-500'}"
							>
								{pairingInProgress ? '...' : 'Pair'}
							</button>
						</div>
					{/if}
				</div>

				<!-- Daemon status -->
				{#if $health}
					<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
						<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Daemon</h2>
						<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
							<span class="text-surface-500">Status</span>
							<span class="{$health.status === 'healthy' ? 'text-success-400' : 'text-warning-400'}">
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

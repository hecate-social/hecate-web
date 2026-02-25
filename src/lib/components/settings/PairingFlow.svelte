<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import {
		settings,
		fetchSettings,
		initiatePairing,
		checkPairingStatus,
		cancelPairing,
		unpairNode,
		type PairingSession
	} from '$lib/stores/settings';

	type PairingStep = 'idle' | 'initiating' | 'waiting' | 'success' | 'error';

	let step: PairingStep = $state('idle');
	let session: PairingSession | null = $state(null);
	let errorMessage: string = $state('');
	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
	let unpairInProgress: boolean = $state(false);

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function closeWebview() {
		try {
			await invoke('close_webview', { label: 'pairing' });
		} catch {
			// already closed
		}
	}

	async function handleInitiate() {
		step = 'initiating';
		errorMessage = '';
		try {
			session = await initiatePairing();
			step = 'waiting';

			await invoke('open_webview', {
				label: 'pairing',
				url: session.pairing_url,
				title: 'Pair with Macula',
				width: 800,
				height: 700
			});

			pollTimer = setInterval(async () => {
				try {
					const result = await checkPairingStatus();
					if (result.status === 'paired') {
						stopPolling();
						step = 'success';
						await closeWebview();
						await fetchSettings();
					} else if (result.status === 'failed') {
						stopPolling();
						await closeWebview();
						step = 'error';
						errorMessage = 'Pairing session expired or failed. Please try again.';
					}
				} catch {
					// poll failure — keep trying
				}
			}, 3000);
		} catch (e) {
			step = 'error';
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function handleCancel() {
		stopPolling();
		await cancelPairing();
		await closeWebview();
		session = null;
		step = 'idle';
	}

	async function handleUnpair() {
		unpairInProgress = true;
		await unpairNode();
		unpairInProgress = false;
	}

	function handleRetry() {
		step = 'idle';
		errorMessage = '';
		session = null;
	}
</script>

<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
	<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Pairing</h2>

	{#if $settings?.identity.paired}
		<!-- Paired state -->
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2 flex-1">
				<span
					class="text-[10px] px-2 py-1 rounded-full bg-success-500/20 text-success-400 border border-success-500/30"
				>
					Paired with {$settings.identity.github_user}
				</span>
			</div>
			<button
				onclick={handleUnpair}
				disabled={unpairInProgress}
				class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
					bg-surface-700 text-surface-300 hover:bg-danger-500/20 hover:text-danger-400 border border-surface-600
					disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{unpairInProgress ? '...' : 'Unpair'}
			</button>
		</div>
	{:else if step === 'idle'}
		<!-- Idle: show pair button -->
		<button
			onclick={handleInitiate}
			class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
				bg-accent-600 text-surface-50 hover:bg-accent-500"
		>
			Pair with Macula
		</button>
	{:else if step === 'initiating'}
		<!-- Initiating: spinner -->
		<div class="flex items-center gap-2 text-sm text-surface-400">
			<span class="animate-pulse">...</span>
			<span>Starting pairing session...</span>
		</div>
	{:else if step === 'waiting' && session}
		<!-- Waiting: show confirm code -->
		<div class="space-y-3">
			<p class="text-xs text-surface-400">
				Enter this code in the browser window that just opened:
			</p>
			<div
				class="flex items-center justify-center py-3 px-4 rounded-lg
					bg-surface-700 border border-surface-600"
			>
				<span class="text-2xl font-mono font-bold tracking-[0.3em] text-surface-100">
					{session.confirm_code}
				</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-[10px] text-surface-500 animate-pulse">
					Waiting for confirmation...
				</span>
				<button
					onclick={handleCancel}
					class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
						bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-600"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if step === 'success'}
		<!-- Success: brief confirmation before settings reload replaces this -->
		<div class="flex items-center gap-2 text-sm text-success-400">
			<span>Paired successfully!</span>
		</div>
	{:else if step === 'error'}
		<!-- Error: message + retry -->
		<div class="space-y-3">
			<div class="text-xs text-danger-400">{errorMessage}</div>
			<button
				onclick={handleRetry}
				class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
					bg-accent-600 text-surface-50 hover:bg-accent-500"
			>
				Try again
			</button>
		</div>
	{/if}
</div>

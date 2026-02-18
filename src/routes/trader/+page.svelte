<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let status: 'loading' | 'connected' | 'unavailable' = $state('loading');
	let iframeSrc = 'http://localhost:5174';
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	async function checkTraderHealth() {
		try {
			const res = await fetch('hecate://localhost/plugin/trader/health');
			if (res.ok) {
				status = 'connected';
			} else {
				status = 'unavailable';
			}
		} catch {
			status = 'unavailable';
		}
	}

	onMount(() => {
		checkTraderHealth();
		pollTimer = setInterval(checkTraderHealth, 10000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="flex flex-col h-full">
	{#if status === 'loading'}
		<div class="flex-1 flex items-center justify-center bg-surface-900">
			<div class="text-center">
				<div class="text-4xl mb-4">{'\u{1F4C8}'}</div>
				<p class="text-surface-300 text-sm">Connecting to Trader...</p>
			</div>
		</div>
	{:else if status === 'unavailable'}
		<div class="flex-1 flex items-center justify-center bg-surface-900">
			<div class="text-center max-w-md">
				<div class="text-4xl mb-4">{'\u{1F4C8}'}</div>
				<h2 class="text-lg font-bold text-surface-100 mb-2">Trader Unavailable</h2>
				<p class="text-surface-400 text-sm mb-4">
					The Trader daemon is not running. Make sure hecate-traderd is deployed
					and its socket is available.
				</p>
				<div class="bg-surface-800 rounded-lg p-4 text-left">
					<p class="text-surface-500 text-xs font-mono mb-1">Check daemon status:</p>
					<code class="text-accent-400 text-xs">
						curl --unix-socket ~/.hecate/hecate-traderd/sockets/api.sock http://localhost/health
					</code>
				</div>
				<button
					onclick={checkTraderHealth}
					class="mt-4 px-4 py-2 bg-hecate-600 hover:bg-hecate-500 text-surface-50
						text-sm rounded transition-colors"
				>
					Retry
				</button>
			</div>
		</div>
	{:else}
		<iframe
			src={iframeSrc}
			title="Trader Studio"
			class="flex-1 w-full border-none"
			sandbox="allow-scripts allow-same-origin allow-forms"
		></iframe>
	{/if}
</div>

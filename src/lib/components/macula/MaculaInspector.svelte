<script lang="ts">
	import { health, connectionStatus, llmHealth } from '$lib/stores/daemon.js';
	import { models } from '$lib/stores/llm.js';
	import { identity, providers, fetchIdentity, fetchProviders } from '$lib/stores/macula.js';
	import { fetchHealth, fetchLLMHealth } from '$lib/stores/daemon.js';
	import { fetchModels } from '$lib/stores/llm.js';
	import { onMount } from 'svelte';

	interface Props {
		onBack: () => void;
	}

	let { onBack }: Props = $props();

	onMount(() => {
		fetchIdentity();
		fetchProviders();
		fetchHealth();
		fetchLLMHealth();
		fetchModels();
	});

	function uptimeStr(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) {
			const m = Math.floor(seconds / 60);
			const s = seconds % 60;
			return `${m}m ${s}s`;
		}
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}h ${m}m`;
	}

	function providerStatus(name: string): string {
		if (!$llmHealth?.providers) return 'unknown';
		const status = $llmHealth.providers[name];
		return status || 'unknown';
	}

	function providerStatusColor(name: string): string {
		const status = providerStatus(name);
		if (status === 'healthy') return 'text-health-ok';
		if (status === 'unknown') return 'text-surface-400';
		return 'text-health-err';
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header with back button -->
	<div class="flex items-center gap-3 px-4 py-2.5 bg-surface-800 border-b border-surface-600 shrink-0">
		<button
			onclick={onBack}
			class="text-surface-400 hover:text-surface-100 transition-colors text-xs"
		>
			&larr; Back
		</button>
		<div class="w-px h-4 bg-surface-600"></div>
		<span class="text-accent-400 text-sm font-medium">Macula Inspector</span>
	</div>

	<div class="flex-1 overflow-y-auto p-6 gap-6 flex flex-col">
		<!-- Status cards row -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Connection -->
			<div class="rounded-lg bg-surface-800 border border-surface-600 p-4">
				<div class="text-[11px] text-surface-400 uppercase tracking-wider mb-3">Daemon</div>
				<div class="flex items-center gap-2 mb-2">
					<span
						class={$connectionStatus === 'connected'
							? 'text-health-ok'
							: $connectionStatus === 'connecting'
								? 'text-health-loading animate-pulse'
								: 'text-health-err'}
					>
						&#9679;
					</span>
					<span class="text-sm text-surface-100 capitalize">{$connectionStatus}</span>
				</div>
				{#if $health}
					<div class="text-xs text-surface-300 space-y-1">
						<div class="flex justify-between">
							<span class="text-surface-400">Version:</span>
							<span>{$health.version}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-400">Uptime:</span>
							<span>{uptimeStr($health.uptime_seconds)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-surface-400">Identity:</span>
							<span>{$health.identity}</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Identity -->
			<div class="rounded-lg bg-surface-800 border border-surface-600 p-4">
				<div class="text-[11px] text-surface-400 uppercase tracking-wider mb-3">Identity</div>
				{#if $identity?.identity}
					<div class="text-xs text-surface-300 space-y-1">
						<div class="flex justify-between">
							<span class="text-surface-400">Node ID:</span>
							<span class="text-surface-100 font-mono truncate ml-2">
								{$identity.identity.node_id}
							</span>
						</div>
						{#if $identity.identity.display_name}
							<div class="flex justify-between">
								<span class="text-surface-400">Name:</span>
								<span>{$identity.identity.display_name}</span>
							</div>
						{/if}
						{#if $identity.identity.realm}
							<div class="flex justify-between">
								<span class="text-surface-400">Realm:</span>
								<span>{$identity.identity.realm}</span>
							</div>
						{/if}
					</div>
				{:else}
					<div class="text-xs text-surface-400">Not initialized</div>
				{/if}
			</div>

			<!-- LLM Health -->
			<div class="rounded-lg bg-surface-800 border border-surface-600 p-4">
				<div class="text-[11px] text-surface-400 uppercase tracking-wider mb-3">LLM</div>
				<div class="flex items-center gap-2 mb-2">
					<span
						class={$llmHealth?.status === 'healthy'
							? 'text-health-ok'
							: $llmHealth
								? 'text-health-err'
								: 'text-surface-400'}
					>
						&#9679;
					</span>
					<span class="text-sm text-surface-100">
						{$llmHealth?.status ?? 'unknown'}
					</span>
				</div>
				<div class="text-xs text-surface-300">
					{$models.length} model{$models.length !== 1 ? 's' : ''} available
				</div>
			</div>
		</div>

		<!-- Providers -->
		<div class="rounded-lg bg-surface-800 border border-surface-600 p-4">
			<div class="text-[11px] text-surface-400 uppercase tracking-wider mb-3">Providers</div>
			{#if $providers.length === 0}
				<div class="text-xs text-surface-400">No providers configured</div>
			{:else}
				<div class="space-y-2">
					{#each $providers as provider}
						<div
							class="flex items-center justify-between text-xs bg-surface-700 rounded px-3 py-2"
						>
							<div class="flex items-center gap-2">
								<span class={providerStatusColor(provider.name)}>&#9679;</span>
								<span class="text-surface-100 font-medium">{provider.name}</span>
								<span class="text-surface-400">{provider.type}</span>
							</div>
							<div class="flex items-center gap-2">
								{#if provider.url}
									<span class="text-surface-400 font-mono text-[10px]">{provider.url}</span>
								{/if}
								<span
									class="text-[10px] px-1.5 py-0.5 rounded {provider.enabled
										? 'bg-health-ok/10 text-health-ok'
										: 'bg-surface-600 text-surface-400'}"
								>
									{provider.enabled ? 'enabled' : 'disabled'}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Models -->
		<div class="rounded-lg bg-surface-800 border border-surface-600 p-4">
			<div class="text-[11px] text-surface-400 uppercase tracking-wider mb-3">Models</div>
			{#if $models.length === 0}
				<div class="text-xs text-surface-400">No models available</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
					{#each $models as model}
						<div class="flex items-center justify-between text-xs bg-surface-700 rounded px-3 py-2">
							<div>
								<span class="text-surface-100 font-medium">{model.name}</span>
								{#if model.parameter_size}
									<span class="text-surface-400 ml-1">({model.parameter_size})</span>
								{/if}
							</div>
							<span class="text-hecate-400 text-[10px]">{model.provider}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

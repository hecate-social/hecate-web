<script lang="ts">
	import { page } from '$app/state';
	import { connectionStatus, health, llmHealth, isStarting } from '../stores/daemon.js';
	import { selectedModel, isStreaming, lastUsage } from '../stores/llm.js';
	import { aiModel, selectedPhase } from '../stores/devops.js';
	import ThemeToggle from './ThemeToggle.svelte';

	const phaseNames: Record<string, string> = {
		dna: 'DnA',
		anp: 'AnP',
		tni: 'TnI',
		dno: 'DnO'
	};

	function isDevOps(): boolean {
		return (page.url?.pathname ?? '').startsWith('/devops');
	}

	function statusLed(status: string): string {
		switch (status) {
			case 'connected':
				return 'text-health-ok';
			case 'connecting':
				return 'text-health-loading animate-pulse';
			case 'error':
			case 'disconnected':
				return 'text-health-err';
			default:
				return 'text-surface-400';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'connected':
				return 'Connected';
			case 'connecting':
				return 'Connecting...';
			case 'error':
				return 'Disconnected';
			case 'disconnected':
				return 'Offline';
			default:
				return status;
		}
	}

	function llmStatusLed(): string {
		if (!$llmHealth) return 'text-surface-400';
		return $llmHealth.status === 'healthy' ? 'text-health-ok' : 'text-health-err';
	}

	function uptimeStr(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}h ${m}m`;
	}
</script>

<footer
	class="flex items-center gap-4 bg-surface-800 border-t border-surface-600 px-3 h-7 text-[11px] font-mono text-surface-300 shrink-0"
>
	<!-- Daemon status -->
	<div class="flex items-center gap-1.5">
		{#if $isStarting}
			<span class="text-health-warn animate-pulse">●</span>
			<span>Starting...</span>
		{:else}
			<span class={statusLed($connectionStatus)}>●</span>
			<span>{statusLabel($connectionStatus)}</span>
		{/if}
	</div>

	{#if $health}
		<div class="text-surface-400">
			{uptimeStr($health.uptime_seconds)}
		</div>
	{/if}

	<!-- LLM status -->
	<div class="flex items-center gap-1.5">
		<span class={llmStatusLed()}>●</span>
		<span>LLM</span>
	</div>

	{#if isDevOps()}
		<div class="text-phase-{$selectedPhase}">
			{phaseNames[$selectedPhase] ?? $selectedPhase}
		</div>
		{#if $aiModel}
			<div class="text-hecate-400">{$aiModel}</div>
		{/if}
	{:else if $selectedModel}
		<div class="text-hecate-400">
			{$selectedModel}
		</div>
	{/if}

	{#if $isStreaming}
		<div class="text-health-loading animate-pulse">streaming...</div>
	{/if}

	<div class="flex-1"></div>

	<!-- update badge moved to StudioTabs -->

	<ThemeToggle />

	{#if $lastUsage}
		<div class="text-surface-400">
			{#if $lastUsage.prompt_tokens}
				↑{$lastUsage.prompt_tokens}
			{/if}
			{#if $lastUsage.completion_tokens}
				↓{$lastUsage.completion_tokens}
			{/if}
		</div>
	{/if}
</footer>

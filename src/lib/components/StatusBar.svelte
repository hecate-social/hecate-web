<script lang="ts">
	import { connectionStatus, health, isStarting } from '../stores/daemon.js';
	import { pluginList } from '../stores/plugins.js';
	import ThemeToggle from './ThemeToggle.svelte';

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
			<span class="text-health-warn animate-pulse">{'\u{25CF}'}</span>
			<span>Starting...</span>
		{:else}
			<span class={statusLed($connectionStatus)}>{'\u{25CF}'}</span>
			<span>{statusLabel($connectionStatus)}</span>
		{/if}
	</div>

	{#if $health}
		<div class="text-surface-400">
			{uptimeStr($health.uptime_seconds)}
		</div>
	{/if}

	<!-- Plugin count -->
	{#if $pluginList.length > 0}
		<div class="flex items-center gap-1.5">
			<span class="text-accent-400">{$pluginList.length}</span>
			<span class="text-surface-400">plugin{$pluginList.length !== 1 ? 's' : ''}</span>
		</div>
	{/if}

	<div class="flex-1"></div>

	<ThemeToggle />
</footer>

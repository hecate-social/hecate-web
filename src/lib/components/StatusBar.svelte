<script lang="ts">
	import { connectionStatus, health, isReady } from '../stores/daemon.js';
	import { appList } from '../stores/apps';
	import ActivityFeed from './ActivityFeed.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	function statusLed(conn: string, ready: boolean): string {
		if (conn !== 'connected') return 'text-health-err';
		return ready ? 'text-health-ok' : 'text-health-warn animate-pulse';
	}

	function statusLabel(conn: string, ready: boolean): string {
		switch (conn) {
			case 'connected':
				return ready ? 'Connected' : 'Starting...';
			case 'connecting':
				return 'Connecting...';
			case 'error':
				return 'Disconnected';
			default:
				return conn;
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
	class="flex items-center gap-4 bg-surface-800 border-t border-surface-600 px-3 h-7 text-xs font-mono text-surface-300 shrink-0"
>
	<!-- Daemon status -->
	<div class="flex items-center gap-1.5">
		<span class={statusLed($connectionStatus, $isReady)}>{'\u{25CF}'}</span>
		<span>{statusLabel($connectionStatus, $isReady)}</span>
	</div>

	{#if $health}
		<div class="text-surface-400">
			{uptimeStr($health.uptime_seconds)}
		</div>
	{/if}

	<!-- Plugin count -->
	{#if $appList.length > 0}
		<div class="flex items-center gap-1.5">
			<span class="text-accent-400">{$appList.length}</span>
			<span class="text-surface-400">app{$appList.length !== 1 ? 's' : ''}</span>
		</div>
	{/if}

	<div class="flex-1"></div>

	<ActivityFeed />
	<ThemeToggle />
</footer>

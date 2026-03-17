<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import MetricsChart from '$lib/components/observer/MetricsChart.svelte';
	import {
		systemOverview,
		metricsHistory,
		fetchSystemOverview,
		startMetricsStream,
		stopMetricsStream,
		type SystemOverview
	} from '$lib/stores/observer';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function formatBytes(bytes: number): string {
		if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	function formatUptime(ms: number): string {
		const secs = Math.floor(ms / 1000);
		const days = Math.floor(secs / 86400);
		const hours = Math.floor((secs % 86400) / 3600);
		const mins = Math.floor((secs % 3600) / 60);
		if (days > 0) return `${days}d ${hours}h ${mins}m`;
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins}m`;
	}

	async function refresh() {
		try {
			await fetchSystemOverview();
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	// Extract sparkline data from metrics history
	const memoryValues = $derived($metricsHistory.map(m => m.memory.total));
	const processValues = $derived($metricsHistory.map(m => m.process_count));
	const reductionValues = $derived($metricsHistory.map(m => m.reductions_delta));
	const avgSchedUtil = $derived($metricsHistory.map(m => {
		const utils = m.scheduler_utilization;
		return utils.length > 0 ? utils.reduce((s, u) => s + u.utilization, 0) / utils.length : 0;
	}));

	onMount(async () => {
		await refresh();
		pollTimer = setInterval(refresh, 5000);
		startMetricsStream();
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		stopMetricsStream();
	});
</script>

<div class="p-6 max-w-4xl space-y-6">
	{#if loading && !$systemOverview}
		<div class="flex items-center justify-center py-20">
			<div class="text-center text-surface-400">
				<div class="text-2xl mb-2 animate-pulse">{'\uD83D\uDD2C'}</div>
				<div class="text-sm">Loading system overview...</div>
			</div>
		</div>
	{:else if error && !$systemOverview}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="text-2xl mb-2">{'\u{26A0}'}</div>
			<div class="text-sm text-danger-400">{error}</div>
			<button onclick={refresh} class="mt-4 px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer">Retry</button>
		</div>
	{:else if $systemOverview}
		{@const sys = $systemOverview}

		<!-- Stat Cards -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="stat-card">
				<div class="stat-label">Memory</div>
				<div class="stat-value">{formatBytes(sys.memory.total)}</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">Processes</div>
				<div class="stat-value">{sys.processes.count.toLocaleString()}</div>
				<div class="stat-sub">/ {sys.processes.limit.toLocaleString()}</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">Schedulers</div>
				<div class="stat-value">{sys.schedulers.online}</div>
				<div class="stat-sub">/ {sys.schedulers.total} total</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">Uptime</div>
				<div class="stat-value">{formatUptime(sys.uptime_ms)}</div>
			</div>
		</div>

		<!-- Sparklines -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">Real-time Metrics</h2>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-6">
				<MetricsChart values={memoryValues} label="Memory" unit="" color="#6366f1" />
				<MetricsChart values={processValues} label="Processes" unit="" color="#22c55e" />
				<MetricsChart values={reductionValues} label="Reductions/2s" unit="" color="#f59e0b" />
				<MetricsChart values={avgSchedUtil} label="Scheduler %" unit="%" color="#ec4899" />
			</div>
		</div>

		<!-- System Info -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">System</h2>
			<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
				<span class="text-surface-500">OTP Release</span>
				<span class="text-surface-200">{sys.otp_release}</span>
				<span class="text-surface-500">ERTS Version</span>
				<span class="text-surface-200">{sys.erts_version}</span>
				<span class="text-surface-500">Boot Phase</span>
				<span class="text-surface-200">{sys.boot_phase}</span>
				<span class="text-surface-500">Atoms</span>
				<span class="text-surface-200">{sys.atoms.count.toLocaleString()} / {sys.atoms.limit.toLocaleString()}</span>
				<span class="text-surface-500">Ports</span>
				<span class="text-surface-200">{sys.ports.count.toLocaleString()} / {sys.ports.limit.toLocaleString()}</span>
			</div>
		</div>

		<!-- Memory Breakdown -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Memory Breakdown</h2>
			<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
				{#each Object.entries(sys.memory) as [key, value]}
					<span class="text-surface-500 capitalize">{key}</span>
					<div class="flex items-center gap-3">
						<div class="flex-1 h-2 rounded-full bg-surface-700 overflow-hidden">
							<div class="h-full rounded-full bg-accent-500" style="width: {Math.min((value / sys.memory.total) * 100, 100)}%"></div>
						</div>
						<span class="text-surface-200 text-xs font-mono w-20 text-right">{formatBytes(value)}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- PG Groups -->
		{#if sys.pg_groups.length > 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
				<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Process Groups</h2>
				<div class="flex flex-wrap gap-2">
					{#each sys.pg_groups as group}
						<span class="px-3 py-1.5 rounded-lg bg-surface-700 text-xs text-surface-200">
							{group.name} <span class="text-surface-500">({group.member_count})</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.stat-card {
		padding: 16px;
		border-radius: 12px;
		border: 1px solid var(--color-surface-600, #334155);
		background: var(--color-surface-800, #1e293b);
	}
	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-surface-400, #94a3b8);
		margin-bottom: 4px;
	}
	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-surface-100, #f1f5f9);
		font-variant-numeric: tabular-nums;
	}
	.stat-sub {
		font-size: 0.7rem;
		color: var(--color-surface-500, #64748b);
	}
</style>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { fetchProcessDetail, type ProcessDetail } from '$lib/stores/observer/processes';

	let detail = $state<ProcessDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const pid = $derived(($page.params as Record<string, string>).pid);

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	async function refresh() {
		try {
			const data = await fetchProcessDetail(pid);
			detail = data;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await refresh();
		pollTimer = setInterval(refresh, 3000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="p-6 max-w-3xl space-y-6">
	<div class="flex items-center gap-3">
		<a href="/observer/processes" class="text-sm text-accent-400 hover:text-accent-300">{'\u2190'} Processes</a>
		<h2 class="text-base font-semibold text-surface-100">Process {pid}</h2>
	</div>

	{#if loading && !detail}
		<div class="text-center text-surface-400 py-10 text-base">Loading...</div>
	{:else if error && !detail}
		<div class="text-center text-danger-400 py-10 text-base">{error}</div>
	{:else if detail}
		<!-- Basic Info -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h3 class="text-sm font-semibold text-surface-300 uppercase tracking-wider">Info</h3>
			<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-base">
				<span class="text-surface-500">PID</span>
				<span class="text-surface-200 font-mono text-sm">{detail.pid}</span>
				<span class="text-surface-500">Name</span>
				<span class="text-surface-200">{detail.registered_name ?? '-'}</span>
				<span class="text-surface-500">Initial Call</span>
				<span class="text-surface-200 font-mono text-sm">{detail.initial_call ?? '-'}</span>
				<span class="text-surface-500">Current Function</span>
				<span class="text-surface-200 font-mono text-sm">{detail.current_function ?? '-'}</span>
				<span class="text-surface-500">Status</span>
				<span class="text-surface-200">{detail.status}</span>
				<span class="text-surface-500">Trap Exit</span>
				<span class="text-surface-200">{detail.trap_exit ? 'yes' : 'no'}</span>
			</div>
		</div>

		<!-- Memory -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h3 class="text-sm font-semibold text-surface-300 uppercase tracking-wider">Memory & GC</h3>
			<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-base">
				<span class="text-surface-500">Memory</span>
				<span class="text-surface-200">{formatBytes(detail.memory)}</span>
				<span class="text-surface-500">Heap Size</span>
				<span class="text-surface-200">{detail.heap_size.toLocaleString()} words</span>
				<span class="text-surface-500">Stack Size</span>
				<span class="text-surface-200">{detail.stack_size.toLocaleString()} words</span>
				<span class="text-surface-500">Total Heap</span>
				<span class="text-surface-200">{detail.total_heap_size.toLocaleString()} words</span>
				<span class="text-surface-500">Reductions</span>
				<span class="text-surface-200">{detail.reductions.toLocaleString()}</span>
				<span class="text-surface-500">Msg Queue</span>
				<span class="text-surface-200" class:text-warning-400={detail.message_queue_len > 100}>{detail.message_queue_len}</span>
				<span class="text-surface-500">Minor GCs</span>
				<span class="text-surface-200">{detail.garbage_collection.minor_gcs}</span>
			</div>
		</div>

		<!-- Links & Monitors -->
		{#if detail.links.length > 0 || detail.monitors.length > 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
				<h3 class="text-sm font-semibold text-surface-300 uppercase tracking-wider">Links & Monitors</h3>
				{#if detail.links.length > 0}
					<div>
						<div class="text-sm text-surface-500 mb-2">Links ({detail.links.length})</div>
						<div class="flex flex-wrap gap-2">
							{#each detail.links as link}
								<span class="px-2 py-1 rounded bg-surface-700 text-sm font-mono text-surface-200">{link}</span>
							{/each}
						</div>
					</div>
				{/if}
				{#if detail.monitors.length > 0}
					<div>
						<div class="text-sm text-surface-500 mb-2">Monitors ({detail.monitors.length})</div>
						<div class="flex flex-wrap gap-2">
							{#each detail.monitors as mon}
								<span class="px-2 py-1 rounded bg-surface-700 text-sm font-mono text-surface-200">{mon.type}: {mon.target}</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Stacktrace -->
		{#if detail.current_stacktrace.length > 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
				<h3 class="text-sm font-semibold text-surface-300 uppercase tracking-wider">Stacktrace</h3>
				<div class="space-y-1">
					{#each detail.current_stacktrace as frame}
						<div class="text-sm font-mono text-surface-200">
							{frame.module}:{frame.function}/{frame.arity}
							{#if frame.file}
								<span class="text-surface-500">{frame.file}:{frame.line}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Dictionary -->
		{#if detail.dictionary.length > 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
				<h3 class="text-sm font-semibold text-surface-300 uppercase tracking-wider">
					Dictionary ({detail.dictionary_size} entries{detail.dictionary_size > 20 ? ', showing first 20' : ''})
				</h3>
				<div class="space-y-2 max-h-64 overflow-y-auto">
					{#each detail.dictionary as entry}
						<div class="flex gap-4 text-sm">
							<span class="font-mono text-accent-400 shrink-0">{entry.key}</span>
							<span class="font-mono text-surface-300 break-all">{entry.value}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

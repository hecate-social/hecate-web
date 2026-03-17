<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import ProcessTable from '$lib/components/observer/ProcessTable.svelte';
	import { fetchProcesses, type ProcessInfo } from '$lib/stores/observer';

	let processes = $state<ProcessInfo[]>([]);
	let total = $state(0);
	let sortField = $state('memory');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const filtered = $derived(
		searchQuery
			? processes.filter(p =>
				(p.registered_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
				(p.current_function?.toLowerCase().includes(searchQuery.toLowerCase())) ||
				p.pid.includes(searchQuery)
			)
			: processes
	);

	async function refresh() {
		try {
			const data = await fetchProcesses(sortField, 200);
			processes = data.items;
			total = data.total;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	function handleSort(field: string) {
		sortField = field;
		refresh();
	}

	function handleSelect(pid: string) {
		goto(`/observer/processes/${pid}`);
	}

	onMount(async () => {
		await refresh();
		pollTimer = setInterval(refresh, 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-surface-100">Processes</h2>
			<span class="text-xs text-surface-500">{total.toLocaleString()} total</span>
		</div>
		<input
			type="text"
			placeholder="Search by name, pid, function..."
			bind:value={searchQuery}
			class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-200 placeholder:text-surface-500 w-64 focus:outline-none focus:border-accent-500"
		/>
	</div>

	{#if loading && processes.length === 0}
		<div class="text-center text-surface-400 py-10 text-sm">Loading processes...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else}
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden">
			<div class="max-h-[calc(100vh-220px)] overflow-y-auto">
				<ProcessTable processes={filtered} {sortField} onSort={handleSort} onSelect={handleSelect} />
			</div>
		</div>
	{/if}
</div>

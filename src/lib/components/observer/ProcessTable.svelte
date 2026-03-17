<script lang="ts">
	import type { ProcessInfo } from '$lib/stores/observer';

	let { processes = [], sortField = 'memory', onSort, onSelect }: {
		processes: ProcessInfo[];
		sortField?: string;
		onSort?: (field: string) => void;
		onSelect?: (pid: string) => void;
	} = $props();

	function handleSort(field: string) {
		onSort?.(field);
	}

	function handleSelect(pid: string) {
		onSelect?.(pid);
	}

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	function formatNumber(n: number): string {
		return n.toLocaleString();
	}
</script>

<div class="process-table-wrapper">
	<table class="process-table">
		<thead>
			<tr>
				<th>PID</th>
				<th>Name</th>
				<th>Current Function</th>
				<th class="sortable" class:active={sortField === 'memory'} onclick={() => handleSort('memory')}>Memory</th>
				<th class="sortable" class:active={sortField === 'reductions'} onclick={() => handleSort('reductions')}>Reductions</th>
				<th class="sortable" class:active={sortField === 'message_queue_len'} onclick={() => handleSort('message_queue_len')}>MsgQ</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#each processes as proc}
				<tr class="clickable" onclick={() => handleSelect(proc.pid)}>
					<td class="mono">{proc.pid}</td>
					<td class="name">{proc.registered_name ?? '-'}</td>
					<td class="mono func">{proc.current_function ?? '-'}</td>
					<td class="number">{formatBytes(proc.memory)}</td>
					<td class="number">{formatNumber(proc.reductions)}</td>
					<td class="number" class:warn={proc.message_queue_len > 100}>{proc.message_queue_len}</td>
					<td><span class="status-badge" class:running={proc.status === 'running'} class:waiting={proc.status === 'waiting'}>{proc.status}</span></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.process-table-wrapper {
		overflow-x: auto;
	}
	.process-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}
	thead th {
		text-align: left;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border-color, #334155);
		color: var(--text-secondary, #94a3b8);
		font-weight: 500;
		position: sticky;
		top: 0;
		background: var(--surface-primary, #0f172a);
	}
	th.sortable {
		cursor: pointer;
	}
	th.sortable:hover {
		color: var(--text-primary, #e2e8f0);
	}
	th.active {
		color: var(--accent, #6366f1);
	}
	tbody td {
		padding: 6px 12px;
		border-bottom: 1px solid var(--border-color-subtle, rgba(255,255,255,0.05));
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover {
		background: var(--surface-hover, rgba(255,255,255,0.04));
	}
	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
	}
	.func {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}
	.number {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.warn {
		color: #f59e0b;
		font-weight: 600;
	}
	.status-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.7rem;
		background: var(--surface-secondary, rgba(255,255,255,0.06));
	}
	.status-badge.running {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}
	.status-badge.waiting {
		background: rgba(99, 102, 241, 0.15);
		color: #818cf8;
	}
</style>

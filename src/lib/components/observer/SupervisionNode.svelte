<script lang="ts">
	import type { SupervisionNode as SupNode } from '$lib/stores/observer';
	import SupervisionNode from './SupervisionNode.svelte';

	let { node, depth = 0 }: {
		node: SupNode;
		depth?: number;
	} = $props();

	let expanded = $state(depth < 3);

	function toggle() {
		expanded = !expanded;
	}

	const hasChildren = $derived(node.children && node.children.length > 0);
	const statusClass = $derived(
		node.status === 'running' || node.status === 'waiting' ? 'healthy' :
		node.status === 'restarting' ? 'restarting' :
		node.status === 'dead' ? 'dead' : 'unknown'
	);
</script>

<div class="tree-node" style="--depth: {depth}">
	<div class="node-row" onclick={hasChildren ? toggle : undefined} class:clickable={hasChildren}>
		<span class="toggle">{hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u2022'}</span>
		<span class="status-dot {statusClass}"></span>
		<span class="node-id">{node.id}</span>
		<span class="node-type">{node.type}</span>
		{#if node.pid}
			<span class="node-pid">{node.pid}</span>
		{/if}
	</div>
	{#if expanded && hasChildren}
		<div class="children">
			{#each node.children as child}
				<SupervisionNode node={child} depth={depth + 1} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		margin-left: calc(var(--depth) * 20px);
	}
	.node-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 0.8rem;
	}
	.node-row.clickable {
		cursor: pointer;
	}
	.node-row.clickable:hover {
		background: var(--surface-hover, rgba(255,255,255,0.04));
	}
	.toggle {
		width: 12px;
		font-size: 0.65rem;
		color: var(--text-secondary, #94a3b8);
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.status-dot.healthy { background: #22c55e; }
	.status-dot.restarting { background: #f59e0b; }
	.status-dot.dead { background: #ef4444; }
	.status-dot.unknown { background: #64748b; }
	.node-id {
		font-weight: 500;
		color: var(--text-primary, #e2e8f0);
	}
	.node-type {
		color: var(--text-secondary, #94a3b8);
		font-size: 0.7rem;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--surface-secondary, rgba(255,255,255,0.06));
	}
	.node-pid {
		color: var(--text-tertiary, #64748b);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
	}
	.children {
		border-left: 1px solid var(--border-color-subtle, rgba(255,255,255,0.08));
		margin-left: 14px;
	}
</style>

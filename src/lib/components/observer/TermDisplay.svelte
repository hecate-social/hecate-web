<script lang="ts">
	// Renders structured Erlang terms from the daemon's JSON serialization.
	// Supports: maps, tuples, lists, atoms, pids, binaries, primitives.
	// Collapsible nested structures with syntax coloring.
	import TermDisplay from './TermDisplay.svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type TermValue = any;

	let { value, depth = 0 }: {
		value: TermValue;
		depth?: number;
	} = $props();

	let expanded = $state(depth < 2);

	function isStructured(v: TermValue): boolean {
		if (v === null || v === undefined) return false;
		if (typeof v !== 'object') return false;
		if (Array.isArray(v)) return v.length > 0;
		return v.__type === 'map' || v.__type === 'tuple';
	}

	function toggle() { expanded = !expanded; }

	async function copyValue() {
		try {
			await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
		} catch { /* ignore */ }
	}

	// Helper accessors to avoid inline type narrowing issues
	const typ = $derived(value?.__type as string | undefined);
	const entries = $derived(value?.entries as { k: TermValue; v: TermValue }[] | undefined);
	const elements = $derived(value?.elements as TermValue[] | undefined);
	const val = $derived(value?.value as string | undefined);
	const truncated = $derived(value?.truncated as boolean | undefined);
	const size = $derived(value?.size as number | undefined);
</script>

{#if value === null || value === undefined}
	<span class="t-null">nil</span>
{:else if typeof value === 'boolean'}
	<span class="t-bool">{value}</span>
{:else if typeof value === 'number'}
	<span class="t-num">{value.toLocaleString()}</span>
{:else if typeof value === 'string'}
	<span class="t-str" title="Double-click to copy" ondblclick={copyValue}>"{value}"</span>
{:else if Array.isArray(value)}
	{#if value.length === 0}
		<span class="t-bracket">[]</span>
	{:else}
		<span class="t-toggle" onclick={toggle} role="button" tabindex="0"
			>{expanded ? '\u25BC' : '\u25B6'}</span>
		<span class="t-bracket">[</span>
		<span class="t-badge">{value.length}</span>
		{#if expanded}
			<div class="t-indent">
				{#each value as item, i}
					<div class="t-entry">
						<span class="t-index">{i}</span>
						<TermDisplay value={item} depth={depth + 1} />
					</div>
				{/each}
			</div>
		{/if}
		<span class="t-bracket">]</span>
	{/if}
{:else if typ === 'atom'}
	<span class="t-atom">{val}</span>
{:else if typ === 'pid'}
	<span class="t-pid">{val}</span>
{:else if typ === 'ref'}
	<span class="t-ref">{val}</span>
{:else if typ === 'fun'}
	<span class="t-fun">{val}</span>
{:else if typ === 'binary'}
	<span class="t-str" title={truncated ? `${size} bytes total` : undefined}>
		"{val}"{#if truncated}<span class="t-trunc"> ({size?.toLocaleString()} B)</span>{/if}
	</span>
{:else if typ === 'map'}
	{#if !entries || entries.length === 0}
		<span class="t-bracket">{@html '#&#123;&#125;'}</span>
	{:else}
		<span class="t-toggle" onclick={toggle} role="button" tabindex="0"
			>{expanded ? '\u25BC' : '\u25B6'}</span>
		<span class="t-bracket">{@html '#&#123;'}</span>
		<span class="t-badge">{entries.length}</span>
		{#if expanded}
			<div class="t-indent">
				{#each entries as entry}
					<div class="t-entry">
						<span class="t-map-key">
							<TermDisplay value={entry.k} depth={depth + 1} />
						</span>
						<span class="t-arrow">{@html '=&gt;'}</span>
						<TermDisplay value={entry.v} depth={depth + 1} />
					</div>
				{/each}
			</div>
		{/if}
		<span class="t-bracket">{@html '&#125;'}</span>
	{/if}
{:else if typ === 'tuple'}
	{#if !elements || elements.length === 0}
		<span class="t-bracket">{@html '&#123;&#125;'}</span>
	{:else if elements.length <= 3 && !elements.some(isStructured)}
		<!-- Small tuples rendered inline -->
		<span class="t-bracket">{@html '&#123;'}</span>{#each elements as el, i}{#if i > 0}<span class="t-comma">, </span>{/if}<TermDisplay value={el} depth={depth + 1} />{/each}<span class="t-bracket">{@html '&#125;'}</span>
	{:else}
		<span class="t-toggle" onclick={toggle} role="button" tabindex="0"
			>{expanded ? '\u25BC' : '\u25B6'}</span>
		<span class="t-bracket">{@html '&#123;'}</span>
		<span class="t-badge">{elements.length}</span>
		{#if expanded}
			<div class="t-indent">
				{#each elements as el, i}
					<div class="t-entry">
						<span class="t-index">{i}</span>
						<TermDisplay value={el} depth={depth + 1} />
					</div>
				{/each}
			</div>
		{/if}
		<span class="t-bracket">{@html '&#125;'}</span>
	{/if}
{:else}
	<!-- Fallback for unknown objects -->
	<span class="t-str">{JSON.stringify(value)}</span>
{/if}

<style>
	.t-indent {
		margin-left: 16px;
		border-left: 1px solid rgba(255,255,255,0.08);
		padding-left: 8px;
	}
	.t-entry {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 1px 0;
		flex-wrap: wrap;
	}
	.t-toggle {
		cursor: pointer;
		font-size: 0.6rem;
		color: #64748b;
		user-select: none;
		width: 10px;
		display: inline-block;
	}
	.t-toggle:hover { color: #94a3b8; }
	.t-bracket { color: #64748b; font-weight: 500; }
	.t-badge {
		font-size: 0.6rem;
		color: #64748b;
		background: rgba(255,255,255,0.06);
		padding: 0 4px;
		border-radius: 3px;
		margin-left: 2px;
	}
	.t-index {
		font-size: 0.65rem;
		color: #475569;
		min-width: 14px;
		text-align: right;
	}
	.t-null { color: #64748b; font-style: italic; }
	.t-bool { color: #c084fc; }
	.t-num { color: #67e8f9; }
	.t-str {
		color: #86efac;
		word-break: break-all;
		cursor: default;
	}
	.t-atom { color: #fbbf24; }
	.t-pid { color: #94a3b8; font-style: italic; }
	.t-ref { color: #94a3b8; font-style: italic; }
	.t-fun { color: #94a3b8; font-style: italic; }
	.t-trunc { color: #64748b; font-size: 0.7rem; }
	.t-map-key { font-weight: 500; }
	.t-arrow { color: #64748b; }
	.t-comma { color: #64748b; }

	/* All text in this component uses mono */
	span, div {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>

<script lang="ts">
	import type { EventRecord } from '$lib/stores/observer/stores';

	let { event }: { event: EventRecord } = $props();

	let expanded = $state(false);

	function toggle() {
		expanded = !expanded;
	}

	// Separate envelope fields from business data
	const envelopeFields = ['event_id', 'event_type', 'stream_id', 'version',
		'timestamp', 'epoch_us', 'data_content_type', 'metadata_content_type'];

	const envelope = $derived(
		Object.fromEntries(envelopeFields.filter(k => event[k] !== undefined).map(k => [k, event[k]]))
	);

	const metadata = $derived(event.metadata ?? {});

	const businessData = $derived(
		event.data ?? Object.fromEntries(
			Object.entries(event).filter(([k]) => !envelopeFields.includes(k) && k !== 'metadata' && k !== 'data' && k !== 'ok')
		)
	);

	function formatTimestamp(ts: number | undefined): string {
		if (!ts) return '-';
		try {
			return new Date(ts).toISOString();
		} catch {
			return String(ts);
		}
	}
</script>

<div class="event-row" onclick={toggle}>
	<div class="event-summary">
		<span class="event-type">{event.event_type ?? 'unknown'}</span>
		{#if event.stream_id}
			<span class="event-stream">{event.stream_id}</span>
		{/if}
		<span class="event-version">v{event.version ?? '?'}</span>
		<span class="event-time">{formatTimestamp(event.timestamp)}</span>
		<span class="expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
	</div>
</div>

{#if expanded}
	<div class="event-detail">
		<div class="detail-section">
			<h4>Envelope</h4>
			<pre class="json-block">{JSON.stringify(envelope, null, 2)}</pre>
		</div>

		{#if Object.keys(businessData as Record<string, unknown>).length > 0}
			<div class="detail-section">
				<h4>Data</h4>
				<pre class="json-block highlight">{JSON.stringify(businessData, null, 2)}</pre>
			</div>
		{/if}

		{#if Object.keys(metadata as Record<string, unknown>).length > 0}
			<div class="detail-section">
				<h4>Metadata</h4>
				<pre class="json-block">{JSON.stringify(metadata, null, 2)}</pre>
			</div>
		{/if}
	</div>
{/if}

<style>
	.event-row {
		cursor: pointer;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border-color-subtle, rgba(255,255,255,0.05));
	}
	.event-row:hover {
		background: var(--surface-hover, rgba(255,255,255,0.04));
	}
	.event-summary {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.8rem;
	}
	.event-type {
		font-weight: 600;
		color: var(--accent, #6366f1);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
	}
	.event-stream {
		color: var(--text-secondary, #94a3b8);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.event-version {
		color: var(--text-tertiary, #64748b);
		font-size: 0.7rem;
	}
	.event-time {
		color: var(--text-tertiary, #64748b);
		font-size: 0.7rem;
		margin-left: auto;
	}
	.expand-icon {
		color: var(--text-tertiary, #64748b);
		font-size: 0.6rem;
	}
	.event-detail {
		padding: 8px 12px 16px;
		background: var(--surface-secondary, rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border-color, #334155);
	}
	.detail-section {
		margin-bottom: 12px;
	}
	.detail-section:last-child {
		margin-bottom: 0;
	}
	h4 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary, #94a3b8);
		margin: 0 0 4px;
	}
	.json-block {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		line-height: 1.5;
		padding: 8px 12px;
		border-radius: 6px;
		background: var(--surface-primary, #0f172a);
		overflow-x: auto;
		margin: 0;
		color: var(--text-secondary, #94a3b8);
	}
	.json-block.highlight {
		color: var(--text-primary, #e2e8f0);
	}
</style>

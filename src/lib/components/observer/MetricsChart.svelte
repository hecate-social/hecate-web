<script lang="ts">
	// Pure SVG sparkline — no charting library.
	// Renders a polyline from an array of numeric values.

	let { values = [], label = '', unit = '', color = '#6366f1', height = 48, width = 200 }: {
		values: number[];
		label?: string;
		unit?: string;
		color?: string;
		height?: number;
		width?: number;
	} = $props();

	const points = $derived.by(() => {
		if (values.length < 2) return '';
		const max = Math.max(...values, 1);
		const min = Math.min(...values, 0);
		const range = max - min || 1;
		const stepX = width / (values.length - 1);
		const padding = 2;
		const usableHeight = height - padding * 2;
		return values
			.map((v, i) => `${(i * stepX).toFixed(1)},${(padding + usableHeight - ((v - min) / range) * usableHeight).toFixed(1)}`)
			.join(' ');
	});

	const currentValue = $derived(values.length > 0 ? values[values.length - 1] : 0);
</script>

<div class="sparkline-container">
	<div class="sparkline-header">
		<span class="sparkline-label">{label}</span>
		<span class="sparkline-value">{formatValue(currentValue)}{unit}</span>
	</div>
	<svg viewBox="0 0 {width} {height}" class="sparkline-svg" preserveAspectRatio="none">
		{#if points}
			<polyline
				points={points}
				fill="none"
				stroke={color}
				stroke-width="1.5"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/if}
	</svg>
</div>

<script lang="ts" module>
	function formatValue(v: number): string {
		if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'G';
		if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
		if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
		return v.toFixed(0);
	}
</script>

<style>
	.sparkline-container {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sparkline-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.75rem;
	}
	.sparkline-label {
		color: var(--text-secondary, #94a3b8);
	}
	.sparkline-value {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary, #e2e8f0);
	}
	.sparkline-svg {
		width: 100%;
		height: 48px;
		border-radius: 4px;
		background: var(--surface-secondary, rgba(255,255,255,0.03));
	}
</style>

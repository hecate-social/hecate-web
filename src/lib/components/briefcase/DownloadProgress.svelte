<!--
  Polls the download-progress endpoint for one file and renders a
  progress bar. Auto-dismisses + calls `onDone` when the download
  reaches a terminal state (completed | failed | cancelled).
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		pollDownloadUntilDone,
		type DownloadProgress
	} from '$lib/stores/briefcase-viewstate';

	interface Props {
		fileId: string;
		onDone?: (p: DownloadProgress) => void | Promise<void>;
	}

	let { fileId, onDone }: Props = $props();

	let progress = $state<DownloadProgress | null>(null);
	const controller = new AbortController();

	onMount(() => {
		pollDownloadUntilDone(
			fileId,
			(p) => (progress = p),
			750,
			controller.signal
		).then((terminal) => {
			progress = terminal;
			onDone?.(terminal);
		}).catch(() => { /* swallow — abort or transient network errors */ });
	});

	onDestroy(() => controller.abort());

	let percent = $derived(progress?.percent ?? null);
	let phase = $derived(progress?.state ?? 'downloading');
</script>

<div class="flex items-center gap-2 min-w-[200px]">
	{#if phase === 'downloading'}
		<progress
			class="w-32 h-2 rounded overflow-hidden
				[&::-webkit-progress-bar]:bg-surface-800
				[&::-webkit-progress-value]:bg-macula-500
				[&::-moz-progress-bar]:bg-macula-500"
			value={percent ?? undefined}
			max="100"
		></progress>
		<span class="text-xs opacity-70 w-16 text-right">
			{percent != null ? `${percent}%` : '…'}
		</span>
	{:else if phase === 'completed'}
		<span class="text-xs text-success-400">Cached</span>
	{:else if phase === 'failed'}
		<span class="text-xs text-danger-400">Failed{progress?.reason ? `: ${progress.reason}` : ''}</span>
	{:else if phase === 'cancelled'}
		<span class="text-xs text-accent-400">Cancelled</span>
	{/if}
</div>

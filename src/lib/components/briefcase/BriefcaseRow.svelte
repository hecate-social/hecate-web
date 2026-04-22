<!--
  Renders one viewstate-driven file row. Maps daemon-supplied
  available_actions to BriefcaseAction buttons; shows a progress bar
  when the row is in the downloading state.
-->
<script lang="ts">
	import BriefcaseAction from './BriefcaseAction.svelte';
	import DownloadProgress from './DownloadProgress.svelte';
	import {
		formatSize,
		presenceLabelClass,
		type FileView
	} from '$lib/stores/briefcase-viewstate';

	interface Props {
		file: FileView;
		onChange?: () => void | Promise<void>;
	}

	let { file, onChange }: Props = $props();
	let isDownloading = $derived(file.presence === 'downloading');
	let guardRefused = $derived(file.guard?.state === 'refused');
</script>

<tr>
	<td class="font-mono text-sm">{file.path}</td>
	<td>
		<span
			class="px-2 py-0.5 text-xs rounded-full border {presenceLabelClass(file.presence)}"
			title={file.guard?.reason ? `License: ${file.guard.reason}` : ''}
		>
			{file.status_label}
		</span>
		{#if guardRefused}
			<span
				class="ml-1 text-xs text-error opacity-80"
				title="License: {file.guard.reason}"
			>
				⚠
			</span>
		{/if}
	</td>
	<td class="text-xs opacity-70">{file.mime_type || '—'}</td>
	<td class="text-xs">{formatSize(file.size)}</td>
	<td class="text-xs opacity-70">
		{new Date(file.uploaded_at).toLocaleString()}
	</td>
	<td class="text-right">
		{#if isDownloading}
			<DownloadProgress fileId={file.file_id} onDone={onChange} />
		{:else}
			<div class="flex items-center justify-end gap-1 flex-wrap">
				{#each file.available_actions as action (action.id)}
					<BriefcaseAction
						fileId={file.file_id}
						{action}
						fileName={file.path}
						onDone={onChange}
					/>
				{/each}
			</div>
		{/if}
	</td>
</tr>

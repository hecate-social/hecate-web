<!--
  Renders one daemon-supplied action descriptor for a briefcase row.

  GET actions become <a> tags so the browser can stream-render
  content (Open) or trigger native downloads. POST/DELETE actions
  become <button> tags that invoke runAction() — with optional
  confirm prompts.
-->
<script lang="ts">
	import {
		runAction,
		actionContentUrl,
		variantClass,
		type ActionDescriptor
	} from '$lib/stores/briefcase-viewstate';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

	interface Props {
		fileId: string;
		action: ActionDescriptor;
		fileName?: string;
		onDone?: () => void | Promise<void>;
	}

	let { fileId, action, fileName, onDone }: Props = $props();

	let busy = $state(false);

	async function onClick() {
		if (action.confirm && !confirm(action.confirm)) return;
		busy = true;
		try {
			await runAction(fileId, action);
			toastSuccess(`${action.label}: ok`);
			if (onDone) await onDone();
		} catch (e) {
			toastError(`${action.label} failed: ${String(e)}`);
		} finally {
			busy = false;
		}
	}

	let isLink = $derived(action.method === 'GET' && action.id !== 'progress');
	let href = $derived(isLink ? actionContentUrl(fileId, action) : '#');
</script>

{#if isLink}
	<a
		class={variantClass(action.variant)}
		{href}
		download={action.id === 'open' ? undefined : fileName}
		target={action.id === 'open' ? '_blank' : undefined}
		rel="noopener"
		title={action.label}
	>
		{action.label}
	</a>
{:else if action.id === 'progress'}
	<!-- Progress is a UI affordance, not a clickable action. The
	     row component renders a progress bar based on the
	     download-progress endpoint instead. -->
	<span class="text-xs opacity-60">{action.label}…</span>
{:else}
	<button
		class={variantClass(action.variant)}
		onclick={onClick}
		disabled={busy}
		title={action.label}
	>
		{busy ? '…' : action.label}
	</button>
{/if}

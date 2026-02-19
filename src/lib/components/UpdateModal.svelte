<script lang="ts">
	import {
		availableUpdate,
		updateState,
		downloadProgress,
		showUpdateModal,
		startUpdate
	} from '../stores/updater.js';

	function close() {
		if ($updateState === 'idle') {
			showUpdateModal.set(false);
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	let progress = $derived(
		$downloadProgress.total
			? ($downloadProgress.downloaded / $downloadProgress.total) * 100
			: 0
	);
</script>

{#if $showUpdateModal && $availableUpdate}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		onkeydown={(e) => e.key === 'Escape' && close()}
		onclick={close}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="bg-surface-800 border border-surface-600 rounded-lg w-96 p-6 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<h2 class="text-lg font-semibold text-surface-100">Update Available</h2>

			<p class="text-sm text-surface-300 mt-2">
				Hecate <span class="font-mono text-hecate-400">v{$availableUpdate.version}</span> is
				ready to install.
			</p>

			{#if $availableUpdate.body}
				<div
					class="mt-3 max-h-32 overflow-y-auto text-xs text-surface-400 bg-surface-900 rounded p-3 whitespace-pre-wrap"
				>
					{$availableUpdate.body}
				</div>
			{/if}

			{#if $updateState === 'downloading'}
				<div class="mt-4">
					<div class="w-full bg-surface-700 rounded-full h-2 overflow-hidden">
						<div
							class="bg-hecate-500 h-2 rounded-full transition-all duration-300"
							style="width: {progress}%"
						></div>
					</div>
					<p class="text-xs text-surface-400 mt-1.5">
						Downloading... {formatBytes($downloadProgress.downloaded)}
						{#if $downloadProgress.total}
							/ {formatBytes($downloadProgress.total)}
						{/if}
					</p>
				</div>
			{:else if $updateState === 'installing'}
				<div class="mt-4 flex items-center gap-2">
					<div
						class="w-4 h-4 border-2 border-hecate-500 border-t-transparent rounded-full animate-spin"
					></div>
					<span class="text-sm text-hecate-400">Installing...</span>
				</div>
			{:else if $updateState === 'restarting'}
				<div class="mt-4 flex items-center gap-2">
					<div
						class="w-4 h-4 border-2 border-hecate-500 border-t-transparent rounded-full animate-spin"
					></div>
					<span class="text-sm text-hecate-400">Restarting...</span>
				</div>
			{:else}
				<div class="mt-5 flex gap-3 justify-end">
					<button
						class="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-200 transition-colors cursor-pointer"
						onclick={close}
					>
						Later
					</button>
					<button
						class="px-4 py-1.5 text-sm bg-hecate-600 hover:bg-hecate-500 text-white rounded transition-colors cursor-pointer"
						onclick={() => startUpdate()}
					>
						Update Now
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<script lang="ts">
	import {
		pluginUpdates,
		pluginUpdateStates,
		showPluginUpdateModal,
		installPluginUpdate
	} from '../stores/pluginUpdater.js';
	import { pushOverlay, popOverlay } from '$lib/stores/keyboard';
	import FocusTrap from './FocusTrap.svelte';

	let error = $state<string | null>(null);

	function close() {
		const name = $showPluginUpdateModal;
		if (!name) return;
		const state = $pluginUpdateStates.get(name);
		if (!state) {
			showPluginUpdateModal.set(null);
			error = null;
		}
	}

	async function doUpdate() {
		const name = $showPluginUpdateModal;
		if (!name) return;
		error = null;
		try {
			await installPluginUpdate(name);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	let update = $derived(
		$showPluginUpdateModal ? $pluginUpdates.get($showPluginUpdateModal) ?? null : null
	);

	let updateState = $derived(
		$showPluginUpdateModal ? $pluginUpdateStates.get($showPluginUpdateModal) ?? null : null
	);

	let isOpen = $derived(!!($showPluginUpdateModal && update));

	$effect(() => {
		if (isOpen) {
			pushOverlay('plugin-update-modal', close);
		} else {
			popOverlay('plugin-update-modal');
		}
	});
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		onclick={close}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="bg-surface-800 border border-surface-600 rounded-lg w-96 p-6 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<FocusTrap active={isOpen}>
				<h2 class="text-lg font-semibold text-surface-100">Plugin Update Available</h2>

				<p class="text-base text-surface-300 mt-2">
					<span class="capitalize">{update?.name}</span>
					<span class="font-mono text-surface-500">v{update?.installed_version}</span>
					&rarr;
					<span class="font-mono text-macula-400">v{update?.latest_version}</span>
				</p>

				{#if update?.body}
					<div
						class="mt-3 max-h-32 overflow-y-auto text-sm text-surface-400 bg-surface-900 rounded p-3 whitespace-pre-wrap"
					>
						{update.body}
					</div>
				{/if}

				{#if error}
					<p class="mt-3 text-sm text-danger-400 bg-danger-900/30 rounded p-2">{error}</p>
				{/if}

				{#if updateState === 'pulling'}
					<div class="mt-4 flex items-center gap-2">
						<div
							class="w-4 h-4 border-2 border-macula-500 border-t-transparent rounded-full animate-spin"
						></div>
						<span class="text-base text-macula-400">Pulling image...</span>
					</div>
				{:else if updateState === 'restarting'}
					<div class="mt-4 flex items-center gap-2">
						<div
							class="w-4 h-4 border-2 border-macula-500 border-t-transparent rounded-full animate-spin"
						></div>
						<span class="text-base text-macula-400">Restarting service...</span>
					</div>
				{:else}
					<div class="mt-5 flex gap-3 justify-end">
						<button
							class="px-3 py-1.5 text-base text-surface-400 hover:text-surface-200 transition-colors cursor-pointer"
							onclick={close}
						>
							Later
						</button>
						<button
							class="px-4 py-1.5 text-base bg-macula-600 hover:bg-macula-500 text-white rounded transition-colors cursor-pointer"
							onclick={() => doUpdate()}
						>
							Update Now
						</button>
					</div>
				{/if}
			</FocusTrap>
		</div>
	</div>
{/if}

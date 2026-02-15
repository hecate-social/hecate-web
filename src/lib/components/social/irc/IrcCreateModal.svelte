<script lang="ts">
	import { openChannel, joinChannel, activeChannelId } from '../../../stores/irc.js';

	interface Props {
		show: boolean;
		onClose: () => void;
	}

	let { show, onClose }: Props = $props();

	let newChannelName = $state('');
	let newChannelTopic = $state('');

	async function handleCreate() {
		const name = newChannelName.trim();
		if (!name) return;
		const ch = await openChannel(name, newChannelTopic.trim() || undefined);
		if (ch) {
			onClose();
			newChannelName = '';
			newChannelTopic = '';
			activeChannelId.set(ch.channel_id);
			await joinChannel(ch.channel_id);
		}
	}
</script>

{#if show}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-surface-800 border border-surface-600 rounded-xl p-5 w-80 shadow-xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<h3 class="text-sm font-medium text-surface-100 mb-4">Open New Channel</h3>
			<div class="space-y-3">
				<div>
					<label for="chan-name" class="text-[10px] text-surface-400 uppercase tracking-wider"
						>Name</label
					>
					<input
						id="chan-name"
						bind:value={newChannelName}
						placeholder="general"
						class="w-full mt-1 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
              text-xs text-surface-100 placeholder-surface-500
              focus:outline-none focus:border-accent-500/50"
					/>
				</div>
				<div>
					<label for="chan-topic" class="text-[10px] text-surface-400 uppercase tracking-wider"
						>Topic (optional)</label
					>
					<input
						id="chan-topic"
						bind:value={newChannelTopic}
						placeholder="General discussion"
						class="w-full mt-1 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
              text-xs text-surface-100 placeholder-surface-500
              focus:outline-none focus:border-accent-500/50"
					/>
				</div>
				<div class="flex gap-2 pt-1">
					<button
						onclick={onClose}
						class="flex-1 px-3 py-2 rounded-lg text-xs text-surface-400 hover:text-surface-200 bg-surface-700 transition-colors"
					>
						Cancel
					</button>
					<button
						onclick={handleCreate}
						class="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors
              {newChannelName.trim()
							? 'bg-accent-600 text-surface-50 hover:bg-accent-500'
							: 'bg-surface-700 text-surface-500 cursor-not-allowed'}"
						disabled={!newChannelName.trim()}
					>
						Open
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

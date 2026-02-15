<script lang="ts">
	import {
		lobbySearch,
		lobbyChannels,
		joinedChannels,
		activeChannelId,
		joinChannel,
		addTab,
		clearUnread
	} from '../../../stores/irc.js';

	interface Props {
		onCreateChannel: () => void;
	}

	let { onCreateChannel }: Props = $props();

	let focusedIndex = $state(0);
	let searchRef: HTMLInputElement | undefined = $state();

	// Reset focus index when search changes
	$effect(() => {
		void $lobbySearch;
		focusedIndex = 0;
	});

	async function handleSelectChannel(channelId: string) {
		activeChannelId.set(channelId);
		clearUnread(channelId);
		const joined = $joinedChannels.has(channelId);
		if (!joined) {
			await joinChannel(channelId);
		} else {
			addTab(channelId);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		const items = $lobbyChannels;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
		} else if (e.key === 'Enter' && items.length > 0) {
			e.preventDefault();
			handleSelectChannel(items[focusedIndex].channel_id);
		}
	}

	export function focusSearch() {
		searchRef?.focus();
	}
</script>

<div class="flex-1 flex flex-col items-center justify-start py-8 px-6 overflow-y-auto">
	<div class="w-full max-w-lg">
		<div class="text-center mb-6">
			<div class="text-2xl mb-2 text-surface-300">#</div>
			<h2 class="text-sm font-medium text-surface-200">Channel Lobby</h2>
			<p class="text-[10px] text-surface-500 mt-1">Browse and join channels</p>
		</div>

		<!-- Search -->
		<div class="mb-4">
			<input
				bind:this={searchRef}
				bind:value={$lobbySearch}
				onkeydown={handleKeydown}
				placeholder="Search channels..."
				class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2
          text-xs text-surface-100 placeholder-surface-500
          focus:outline-none focus:border-accent-500/50"
			/>
		</div>

		<!-- Channel list -->
		<div class="space-y-1">
			{#each $lobbyChannels as channel, i}
				{@const isJoined = $joinedChannels.has(channel.channel_id)}
				{@const isFocused = i === focusedIndex}
				<button
					onclick={() => handleSelectChannel(channel.channel_id)}
					class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
            {isFocused
						? 'bg-surface-700 ring-1 ring-accent-500/30'
						: 'hover:bg-surface-700/50'}"
				>
					<span class="text-accent-400 font-mono text-xs shrink-0">#</span>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span class="text-xs text-surface-100 font-medium">{channel.name}</span>
							{#if isJoined}
								<span class="w-1.5 h-1.5 rounded-full bg-success-400 shrink-0"></span>
							{/if}
						</div>
						{#if channel.topic}
							<div class="text-[10px] text-surface-500 truncate mt-0.5">{channel.topic}</div>
						{/if}
					</div>
					<span class="text-[10px] text-surface-500 shrink-0">
						{channel.memberCount} online
					</span>
				</button>
			{/each}

			{#if $lobbyChannels.length === 0}
				<div class="text-center py-6 text-surface-500">
					<div class="text-xs">No channels found</div>
					<button
						onclick={onCreateChannel}
						class="text-accent-400 hover:text-accent-300 text-xs mt-2 transition-colors"
					>
						Create one
					</button>
				</div>
			{/if}
		</div>

		<!-- Create button -->
		<div class="mt-4 text-center">
			<button
				onclick={onCreateChannel}
				class="text-xs text-surface-400 hover:text-accent-400 transition-colors"
			>
				+ Create Channel (Ctrl+N)
			</button>
		</div>
	</div>
</div>

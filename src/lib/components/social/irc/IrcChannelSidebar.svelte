<script lang="ts">
	import {
		channels,
		joinedChannels,
		activeChannelId,
		unreadByChannel,
		joinChannel,
		clearUnread,
		addTab
	} from '../../../stores/irc.js';

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
</script>

<div class="w-48 shrink-0 bg-surface-850 border-r border-surface-600 flex flex-col">
	<div class="px-3 py-2">
		<span class="text-[10px] text-surface-500 uppercase tracking-wider font-medium">Channels</span>
	</div>
	<div class="flex-1 overflow-y-auto">
		{#each $channels as channel}
			{@const isJoined = $joinedChannels.has(channel.channel_id)}
			{@const isActive = $activeChannelId === channel.channel_id}
			{@const unread = $unreadByChannel[channel.channel_id] ?? 0}
			<button
				onclick={() => handleSelectChannel(channel.channel_id)}
				class="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left
          {isActive
					? 'bg-surface-700 text-surface-100 font-medium'
					: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
			>
				<span class="text-surface-500 font-mono text-[10px]">#</span>
				<span class="truncate flex-1">{channel.name}</span>
				{#if unread > 0 && !isActive}
					<span
						class="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-accent-600 text-[9px] text-surface-50 font-medium flex items-center justify-center"
					>
						{unread > 99 ? '99+' : unread}
					</span>
				{:else if isJoined}
					<span class="ml-auto w-1 h-1 rounded-full bg-success-400 shrink-0"></span>
				{/if}
			</button>
		{/each}
	</div>
</div>

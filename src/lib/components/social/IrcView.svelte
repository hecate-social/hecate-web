<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		activeChannelId,
		tabOrder,
		nick,
		fetchChannels,
		connectStream,
		disconnectStream,
		partChannel,
		clearUnread
	} from '../../stores/irc.js';
	import IrcHeader from './irc/IrcHeader.svelte';
	import IrcChannelSidebar from './irc/IrcChannelSidebar.svelte';
	import IrcTabBar from './irc/IrcTabBar.svelte';
	import IrcLobby from './irc/IrcLobby.svelte';
	import IrcMessagePane from './irc/IrcMessagePane.svelte';
	import IrcMemberSidebar from './irc/IrcMemberSidebar.svelte';
	import IrcCreateModal from './irc/IrcCreateModal.svelte';

	interface Props {
		onBack: () => void;
	}

	let { onBack }: Props = $props();

	let showCreateModal = $state(false);
	let lobbyRef: IrcLobby | undefined = $state();
	let messagePaneRef: IrcMessagePane | undefined = $state();

	onMount(async () => {
		await fetchChannels();
		await connectStream();
		// Resolve nick if not persisted
		if (!$nick) {
			try {
				const resp = await fetch('hecate://localhost/api/identity');
				const data = await resp.json();
				if (data.ok && data.identity?.display_name) {
					nick.set(data.identity.display_name);
				} else if (data.ok && data.identity?.node_id) {
					nick.set(data.identity.node_id.slice(0, 12));
				} else {
					const health = await fetch('hecate://localhost/health');
					const hdata = await health.json();
					nick.set(hdata.service || 'hecate');
				}
			} catch {
				nick.set('hecate');
			}
		}
	});

	onDestroy(() => {
		disconnectStream();
	});

	// Clear unread when switching to a channel
	$effect(() => {
		if ($activeChannelId) {
			clearUnread($activeChannelId);
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

		// Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (works even in inputs)
		if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			const tabs = $tabOrder;
			if (tabs.length === 0) return;
			const currentIdx = tabs.indexOf($activeChannelId ?? '');
			const nextIdx = e.shiftKey
				? (currentIdx - 1 + tabs.length) % tabs.length
				: (currentIdx + 1) % tabs.length;
			activeChannelId.set(tabs[nextIdx]);
			clearUnread(tabs[nextIdx]);
			return;
		}

		// Ctrl+W — close current tab
		if (e.ctrlKey && e.key === 'w') {
			e.preventDefault();
			if ($activeChannelId) {
				partChannel($activeChannelId);
			}
			return;
		}

		// Ctrl+N — create channel
		if (e.ctrlKey && e.key === 'n') {
			e.preventDefault();
			showCreateModal = true;
			return;
		}

		// Alt+1..9 — switch to tab N
		if (e.altKey && e.key >= '1' && e.key <= '9') {
			e.preventDefault();
			const idx = parseInt(e.key) - 1;
			const tabs = $tabOrder;
			if (idx < tabs.length) {
				activeChannelId.set(tabs[idx]);
				clearUnread(tabs[idx]);
			}
			return;
		}

		// Escape — back to lobby or close modal
		if (e.key === 'Escape') {
			if (showCreateModal) {
				showCreateModal = false;
			} else if ($activeChannelId) {
				activeChannelId.set(null);
			}
			return;
		}

		// / in lobby — focus search (only when not in an input)
		if (!isInput && e.key === '/' && !$activeChannelId) {
			e.preventDefault();
			lobbyRef?.focusSearch();
			return;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="flex flex-col h-full">
	<IrcHeader {onBack} />

	<div class="flex flex-1 min-h-0">
		<IrcChannelSidebar onCreateChannel={() => (showCreateModal = true)} />

		{#if $activeChannelId}
			<!-- Active channel: tabs + messages + members -->
			<div class="flex-1 flex flex-col min-w-0 min-h-0">
				<IrcTabBar />
				<div class="flex flex-1 min-h-0">
					<IrcMessagePane bind:this={messagePaneRef} />
					<IrcMemberSidebar />
				</div>
			</div>
		{:else}
			<!-- No channel: show lobby -->
			<IrcLobby
				bind:this={lobbyRef}
				onCreateChannel={() => (showCreateModal = true)}
			/>
		{/if}
	</div>
</div>

<IrcCreateModal show={showCreateModal} onClose={() => (showCreateModal = false)} />

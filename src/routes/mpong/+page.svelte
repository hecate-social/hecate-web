<script lang="ts">
	import { onDestroy } from 'svelte';
	import MpongArena from '$lib/components/mpong/MpongArena.svelte';
	import MpongLobby from '$lib/components/mpong/MpongLobby.svelte';
	import MpongScoreboard from '$lib/components/mpong/MpongScoreboard.svelte';
	import MpongControls from '$lib/components/mpong/MpongControls.svelte';
	import {
		currentGame,
		gameState,
		fetchGame,
		connectGameStream,
		disconnectGameStream,
		disconnectLobbyStream
	} from '$lib/stores/mpong';

	let selectedGameId: string | null = $state(null);
	let loadError: string | null = $state(null);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function selectGame(gameId: string) {
		selectedGameId = gameId;
		loadError = null;

		// Connect SSE first
		connectGameStream(gameId);
		disconnectLobbyStream();

		// Fetch game data (retries for projection lag)
		let game = null;
		for (let attempt = 0; attempt < 10; attempt++) {
			game = await fetchGame(gameId);
			if (game) break;
			await new Promise((r) => setTimeout(r, 300));
		}

		if (!game) {
			loadError = 'Game not found';
			return;
		}

		// Poll game state for lifecycle updates
		pollInterval = setInterval(() => fetchGame(gameId), 2000);
	}

	function backToLobby() {
		disconnectGameStream();
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = null;
		selectedGameId = null;
		loadError = null;
		currentGame.set(null);
		gameState.set(null);
	}

	onDestroy(() => {
		disconnectGameStream();
		disconnectLobbyStream();
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

<div class="h-full flex flex-col">
	<div class="flex items-center justify-between px-4 py-2 border-b border-gray-700">
		<div class="flex items-center gap-2">
			{#if selectedGameId}
				<button onclick={backToLobby} class="text-xs text-gray-400 hover:text-gray-200 transition-colors">
					&larr; Lobby
				</button>
				<span class="text-xs text-gray-600">/</span>
			{/if}
			<h1 class="text-sm font-medium text-gray-200">MPong</h1>
			<span class="text-xs text-gray-500">Mesh Pong Stress Test</span>
		</div>
	</div>

	<div class="flex-1 overflow-auto p-4">
		{#if !selectedGameId}
			<div class="max-w-md mx-auto">
				<MpongLobby onSelectGame={selectGame} />
			</div>
		{:else if loadError}
			<div class="text-center text-red-400 text-sm mt-8">
				{loadError}
				<button onclick={backToLobby} class="block mx-auto mt-2 text-xs text-gray-400 hover:text-gray-200">
					Back to lobby
				</button>
			</div>
		{:else}
			<div class="flex gap-4 justify-center">
				<div class="flex-shrink-0">
					<MpongArena gameState={$gameState} players={$currentGame?.players ?? []} />
				</div>
				<div class="w-56 space-y-3 flex-shrink-0">
					{#if $currentGame}
						<MpongControls game={$currentGame} />
						<MpongScoreboard players={$currentGame.players} gameState={$gameState} />
					{:else}
						<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-xs text-gray-500 animate-pulse">
							Loading game info...
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

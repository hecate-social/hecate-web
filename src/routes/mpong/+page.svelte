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

		// Connect SSE — game state arrives in real-time, no projection needed
		connectGameStream(gameId);
		disconnectLobbyStream();

		// Fetch projection in background (for metadata like player names)
		// Never block the game view on this
		fetchGame(gameId);
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

	// Build player list from game state when projection isn't available (observer)
	function fakePlayers(gs: typeof $gameState): import('$lib/stores/mpong').MpongPlayer[] {
		if (!gs) return [];
		return Object.entries(gs.paddles).map(([wi, _]) => ({
			node_id: `player_${wi}`,
			wall_index: Number(wi),
			alive: gs.alive?.[Number(wi)] ?? true,
			joined_at: 0
		}));
	}

	// Build minimal game object from state when projection isn't available
	function fakeGame(gameId: string | null, gs: typeof $gameState): import('$lib/stores/mpong').MpongGame | null {
		if (!gameId) return null;
		const isOver = gs ? Object.values(gs.games_won).some((w) => (w as number) >= 2) : false;
		return {
			game_id: gameId,
			host_node_id: '',
			players: fakePlayers(gs),
			max_players: 2,
			status: isOver ? 'ended' : (gs ? 'playing' : 'waiting'),
			hosted_at: 0
		};
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
				<button onclick={backToLobby} class="text-sm text-gray-400 hover:text-gray-200 transition-colors">
					&larr; Lobby
				</button>
				<span class="text-sm text-gray-600">/</span>
			{/if}
			<h1 class="text-base font-medium text-gray-200">MPong</h1>
			<span class="text-sm text-gray-500">Mesh Pong Stress Test</span>
		</div>
	</div>

	<div class="flex-1 overflow-auto p-4">
		{#if !selectedGameId}
			<div class="max-w-md mx-auto">
				<MpongLobby onSelectGame={selectGame} />
			</div>
		{:else if loadError}
			<div class="text-center text-red-400 text-base mt-8">
				{loadError}
				<button onclick={backToLobby} class="block mx-auto mt-2 text-sm text-gray-400 hover:text-gray-200">
					Back to lobby
				</button>
			</div>
		{:else}
			{@const gs = $gameState}
			{@const players = $currentGame?.players ?? fakePlayers(gs)}
			{@const game = $currentGame ?? fakeGame(selectedGameId, gs)}
			<div class="flex gap-4 justify-center">
				<div class="flex-shrink-0">
					<MpongArena gameState={gs} players={players} />
				</div>
				<div class="w-56 space-y-3 flex-shrink-0">
					{#if game}
						<MpongControls game={game} onBack={backToLobby} onNewGame={selectGame} />
						<MpongScoreboard players={players} gameState={gs} />
					{:else}
						<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-500 animate-pulse">
							Connecting...
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

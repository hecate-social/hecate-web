<script lang="ts">
	import { startGame, connected, openLobby, type MpongGame } from '$lib/stores/mpong';

	interface Props {
		game: MpongGame;
		onBack: () => void;
		onNewGame: (gameId: string) => void;
	}

	let { game, onBack, onNewGame }: Props = $props();
	let starting = $state(false);
	let newGame = $state(false);

	async function handleStart() {
		starting = true;
		await startGame(game.game_id);
		starting = false;
	}

	async function handleNewGame() {
		newGame = true;
		// Open a new lobby — other nodes will auto-join
		await openLobby(2);
		newGame = false;
		// Go back to lobby view where the lobby UI shows countdown
		onBack();
	}
</script>

<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-2">
	<div class="flex items-center justify-between">
		<span class="text-sm text-gray-400">Game</span>
		<span class="text-sm font-mono text-gray-300">{game.game_id.slice(0, 12)}</span>
	</div>

	<div class="flex items-center justify-between">
		<span class="text-sm text-gray-400">Status</span>
		<span class="text-sm font-medium" class:text-yellow-400={game.status === 'waiting'}
			class:text-green-400={game.status === 'playing'} class:text-gray-400={game.status === 'ended'}>
			{game.status}
		</span>
	</div>

	<div class="flex items-center justify-between">
		<span class="text-sm text-gray-400">Stream</span>
		<span class="text-sm" class:text-green-400={$connected} class:text-red-400={!$connected}>
			{$connected ? 'connected' : 'disconnected'}
		</span>
	</div>

	{#if game.status === 'waiting' && game.players.length >= 2}
		<button
			onclick={handleStart}
			disabled={starting}
			class="w-full mt-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
		>
			{starting ? 'Starting...' : 'Start Game'}
		</button>
	{/if}

	{#if game.status === 'waiting' && game.players.length < 2}
		<p class="text-sm text-gray-500 mt-1">Waiting for at least 2 players...</p>
	{/if}

	{#if game.winner_node_id}
		{@const winnerPlayer = game.players.find(p => p.node_id === game.winner_node_id)}
		{@const winnerName = winnerPlayer?.champion_name && winnerPlayer.champion_name !== 'undefined'
			? winnerPlayer.champion_name
			: game.winner_node_id.split('@')[0]}
		<div class="mt-2 py-2 text-center border-t border-gray-700">
			<span class="text-sm text-gray-400">Winner</span>
			<div class="text-base font-bold text-yellow-400 mt-0.5">{winnerName}</div>
		</div>
	{/if}

	{#if game.status === 'ended'}
		<div class="flex gap-2 mt-2">
			<button
				onclick={handleNewGame}
				disabled={newGame}
				class="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
			>
				{newGame ? 'Opening...' : 'New Game'}
			</button>
			<button
				onclick={onBack}
				class="flex-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded font-medium transition-colors"
			>
				Lobby
			</button>
		</div>
	{/if}
</div>

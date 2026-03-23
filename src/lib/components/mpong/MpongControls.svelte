<script lang="ts">
	import { startGame, connected, type MpongGame } from '$lib/stores/mpong';

	interface Props {
		game: MpongGame;
	}

	let { game }: Props = $props();
	let starting = $state(false);

	async function handleStart() {
		starting = true;
		await startGame(game.game_id);
		starting = false;
	}
</script>

<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-2">
	<div class="flex items-center justify-between">
		<span class="text-xs text-gray-400">Game</span>
		<span class="text-xs font-mono text-gray-300">{game.game_id.slice(0, 12)}</span>
	</div>

	<div class="flex items-center justify-between">
		<span class="text-xs text-gray-400">Status</span>
		<span class="text-xs font-medium" class:text-yellow-400={game.status === 'waiting'}
			class:text-green-400={game.status === 'playing'} class:text-gray-400={game.status === 'ended'}>
			{game.status}
		</span>
	</div>

	<div class="flex items-center justify-between">
		<span class="text-xs text-gray-400">Stream</span>
		<span class="text-xs" class:text-green-400={$connected} class:text-red-400={!$connected}>
			{$connected ? 'connected' : 'disconnected'}
		</span>
	</div>

	{#if game.status === 'waiting' && game.players.length >= 2}
		<button
			onclick={handleStart}
			disabled={starting}
			class="w-full mt-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
		>
			{starting ? 'Starting...' : 'Start Game'}
		</button>
	{/if}

	{#if game.status === 'waiting' && game.players.length < 2}
		<p class="text-xs text-gray-500 mt-1">Waiting for at least 2 players...</p>
	{/if}

	{#if game.winner_node_id}
		<div class="mt-2 text-center">
			<span class="text-xs text-gray-400">Winner: </span>
			<span class="text-xs font-mono text-yellow-400">{game.winner_node_id.split('@')[0]}</span>
		</div>
	{/if}
</div>

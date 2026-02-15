<script lang="ts">
	import SnakeDuelHeader from './snake-duel/SnakeDuelHeader.svelte';
	import SnakeDuelCanvas from './snake-duel/SnakeDuelCanvas.svelte';
	import SnakeDuelScoreboard from './snake-duel/SnakeDuelScoreboard.svelte';
	import SnakeDuelControls from './snake-duel/SnakeDuelControls.svelte';
	import { createGame } from '$lib/game/snake-duel/engine';
	import type { GameState } from '$lib/game/snake-duel/types';

	interface Props {
		onBack: () => void;
	}

	let { onBack }: Props = $props();

	let p1AssholeFactor = $state(30);
	let p2AssholeFactor = $state(70);
	let tickMs = $state(100);
	let gameState: GameState = $state(createGame(30, 70));
	let canvasRef: SnakeDuelCanvas;

	function handleNewMatch(): void {
		canvasRef.startMatch();
	}
</script>

<div class="flex flex-col h-full">
	<SnakeDuelHeader {onBack} onNewMatch={handleNewMatch} />
	<SnakeDuelScoreboard snake1={gameState.snake1} snake2={gameState.snake2} />

	<SnakeDuelCanvas
		bind:this={canvasRef}
		{p1AssholeFactor}
		{p2AssholeFactor}
		{tickMs}
		bind:gameState
	/>

	<SnakeDuelControls
		bind:p1AssholeFactor
		bind:p2AssholeFactor
		bind:tickMs
		status={gameState.status}
	/>
</div>

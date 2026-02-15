<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { GRID_WIDTH, GRID_HEIGHT } from '$lib/game/snake-duel/constants';
	import { createGame, tickGame } from '$lib/game/snake-duel/engine';
	import { drawFrame, drawCountdown, drawGameOver, drawIdle } from '$lib/game/snake-duel/renderer';
	import type { GameState } from '$lib/game/snake-duel/types';

	interface Props {
		p1AssholeFactor: number;
		p2AssholeFactor: number;
		tickMs: number;
		gameState: GameState;
	}

	let { p1AssholeFactor, p2AssholeFactor, tickMs, gameState = $bindable() }: Props = $props();

	let wrapper: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let tickInterval: ReturnType<typeof setInterval> | null = null;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;
	let resizeObserver: ResizeObserver | null = null;

	export function startMatch(): void {
		stopIntervals();
		gameState = { ...createGame(p1AssholeFactor, p2AssholeFactor), status: 'countdown', countdown: 3 };
		render();
		startCountdown();
	}

	function startCountdown(): void {
		countdownInterval = setInterval(() => {
			if (gameState.countdown > 0) {
				gameState = { ...gameState, countdown: gameState.countdown - 1 };
				render();
			} else {
				if (countdownInterval) clearInterval(countdownInterval);
				countdownInterval = null;
				gameState = { ...gameState, status: 'running' };
				startGameLoop();
			}
		}, 800);
	}

	function startGameLoop(): void {
		tickInterval = setInterval(() => {
			const next = tickGame(gameState);
			gameState = next;
			render();
			if (next.status === 'finished') {
				stopIntervals();
			}
		}, tickMs);
	}

	function stopIntervals(): void {
		if (tickInterval) {
			clearInterval(tickInterval);
			tickInterval = null;
		}
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function sizeCanvas(): void {
		if (!wrapper || !canvas) return;
		const rect = wrapper.getBoundingClientRect();
		const aspect = GRID_WIDTH / GRID_HEIGHT;
		const maxW = 540;
		const maxH = 432;
		let w = Math.min(rect.width, maxW);
		let h = w / aspect;
		if (h > Math.min(rect.height, maxH)) {
			h = Math.min(rect.height, maxH);
			w = h * aspect;
		}
		canvas.width = Math.floor(w);
		canvas.height = Math.floor(h);
		render();
	}

	function render(): void {
		if (!ctx) return;
		drawFrame(ctx, gameState);
		if (gameState.status === 'idle') {
			drawIdle(ctx);
		} else if (gameState.status === 'countdown') {
			drawCountdown(ctx, gameState.countdown);
		} else if (gameState.status === 'finished') {
			drawGameOver(ctx, gameState.winner);
		}
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		sizeCanvas();
		resizeObserver = new ResizeObserver(() => sizeCanvas());
		resizeObserver.observe(wrapper);
	});

	onDestroy(() => {
		stopIntervals();
		resizeObserver?.disconnect();
	});
</script>

<div bind:this={wrapper} class="flex-1 min-h-0 min-w-0 flex items-center justify-center">
	<canvas
		bind:this={canvas}
		class="rounded-lg border border-surface-600/30"
		style="image-rendering: pixelated;"
	></canvas>
</div>

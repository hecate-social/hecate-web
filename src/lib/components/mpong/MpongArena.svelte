<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { PLAYER_COLORS, DEAD_COLOR, BALL_COLOR, ARENA_BG, PADDLE_COLOR } from './arena';
	import type { MpongGameState, MpongPlayer } from '$lib/stores/mpong';

	interface Props {
		gameState: MpongGameState | null;
		players: MpongPlayer[];
	}

	let { gameState, players }: Props = $props();

	let canvas: HTMLCanvasElement;
	let animFrame: number;

	const CANVAS = 600;
	const GRID = 1000;
	const PADDLE_HALF_H = 55;
	const PADDLE_WIDTH_PX = 8;

	function playerLabel(player: MpongPlayer, fallbackIdx: number): string {
		if (player.champion_name && player.champion_name !== 'undefined') return player.champion_name;
		const full = player.node_id ?? '';
		const atIdx = full.indexOf('@');
		if (atIdx > 0) return full.slice(0, atIdx);
		return `P${fallbackIdx}`;
	}

	function nodeLabel(player: MpongPlayer): string {
		const full = player.node_id ?? '';
		const atIdx = full.indexOf('@');
		if (atIdx <= 0) return '';
		const raw = full.slice(atIdx + 1).split('@')[0] ?? '';
		// "hecate_dev@host00.lab" → "host00", strip .lab suffix
		const parts = raw.split('@');
		const host = parts[parts.length - 1] ?? raw;
		return host.replace('.lab', '');
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		const draw = () => { render(ctx); animFrame = requestAnimationFrame(draw); };
		draw();
	});

	onDestroy(() => { if (animFrame) cancelAnimationFrame(animFrame); });

	function g2c(v: number): number { return (v / GRID) * CANVAS; }

	function render(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = ARENA_BG;
		ctx.fillRect(0, 0, CANVAS, CANVAS);

		// Center line
		ctx.setLineDash([4, 8]);
		ctx.strokeStyle = '#374151';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(CANVAS / 2, 0);
		ctx.lineTo(CANVAS / 2, CANVAS);
		ctx.stroke();
		ctx.setLineDash([]);

		if (!gameState) {
			ctx.fillStyle = '#6b7280';
			ctx.font = '14px monospace';
			ctx.textAlign = 'center';
			ctx.fillText('Waiting for game data...', CANVAS / 2, CANVAS / 2);
			return;
		}

		const gs = gameState;
		const p0 = gs.points?.[0] ?? 0;
		const p1 = gs.points?.[1] ?? 0;
		const g0 = gs.games_won?.[0] ?? 0;
		const g1 = gs.games_won?.[1] ?? 0;

		// Score display (big, centered)
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';

		// Games won (small, top)
		ctx.font = '12px monospace';
		ctx.fillStyle = '#6b7280';
		ctx.fillText(`Best of 3`, CANVAS / 2, 8);

		// Game wins as dots
		for (let i = 0; i < 2; i++) {
			const gw = i === 0 ? g0 : g1;
			const baseX = i === 0 ? CANVAS / 2 - 40 : CANVAS / 2 + 28;
			for (let d = 0; d < gw; d++) {
				ctx.beginPath();
				ctx.arc(baseX + d * 14, 36, 4, 0, Math.PI * 2);
				ctx.fillStyle = PLAYER_COLORS[i] ?? '#666';
				ctx.fill();
			}
		}

		// Points (large)
		ctx.font = 'bold 48px monospace';
		ctx.fillStyle = PLAYER_COLORS[0] ?? '#ef4444';
		ctx.textAlign = 'right';
		ctx.fillText(`${p0}`, CANVAS / 2 - 20, 48);

		ctx.fillStyle = '#374151';
		ctx.textAlign = 'center';
		ctx.fillText(':', CANVAS / 2, 48);

		ctx.fillStyle = PLAYER_COLORS[1] ?? '#3b82f6';
		ctx.textAlign = 'left';
		ctx.fillText(`${p1}`, CANVAS / 2 + 20, 48);

		// Serve indicator
		const serveX = gs.serving === 0 ? CANVAS / 2 - 60 : CANVAS / 2 + 55;
		ctx.fillStyle = '#fbbf24';
		ctx.font = '10px monospace';
		ctx.textAlign = 'center';
		ctx.fillText('SERVE', serveX, 100);

		// Walls
		for (let i = 0; i < 2; i++) {
			const alive = gs.alive?.[i] ?? true;
			const color = alive ? (PLAYER_COLORS[i] ?? '#666') : DEAD_COLOR;
			const x = i === 0 ? 0 : CANVAS - 2;
			ctx.fillStyle = color;
			ctx.globalAlpha = alive ? 0.3 : 0.1;
			ctx.fillRect(x, 0, 2, CANVAS);
			ctx.globalAlpha = 1;
		}

		// Paddles
		for (let i = 0; i < 2; i++) {
			const alive = gs.alive?.[i] ?? true;
			const paddleY = gs.paddles?.[i] ?? 500;
			const cy = g2c(paddleY);
			const halfH = g2c(PADDLE_HALF_H);
			const x = i === 0 ? 2 : CANVAS - 2 - PADDLE_WIDTH_PX;

			ctx.globalAlpha = alive ? 1 : 0.2;
			ctx.fillStyle = alive ? (PLAYER_COLORS[i] ?? PADDLE_COLOR) : '#374151';
			ctx.fillRect(x, cy - halfH, PADDLE_WIDTH_PX, halfH * 2);
			ctx.globalAlpha = 1;
		}

		// Obstacles
		for (const obs of gs.obstacles ?? []) {
			const ox = g2c(obs.x);
			const oy = g2c(obs.y);
			const ohw = g2c(obs.hw);
			const ohh = g2c(obs.hh);
			// Fade opacity based on TTL (flash when about to expire)
			const fade = Math.min(1, obs.ttl / 50);
			const flash = obs.ttl < 30 && obs.ttl % 6 < 3 ? 0.3 : 1;
			ctx.globalAlpha = fade * flash * 0.6;
			ctx.fillStyle = '#8b5cf6'; // purple
			ctx.fillRect(ox - ohw, oy - ohh, ohw * 2, ohh * 2);
			// Border glow
			ctx.strokeStyle = '#a78bfa';
			ctx.lineWidth = 1;
			ctx.strokeRect(ox - ohw, oy - ohh, ohw * 2, ohh * 2);
			ctx.globalAlpha = 1;
		}

		// Ball
		const bx = g2c(gs.ball.x);
		const by = g2c(gs.ball.y);
		const br = g2c(gs.ball.r);

		ctx.beginPath();
		ctx.arc(bx, by, br * 2, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
		ctx.fill();

		ctx.beginPath();
		ctx.arc(bx, by, br, 0, Math.PI * 2);
		ctx.fillStyle = BALL_COLOR;
		ctx.fill();

		// Paused overlay
		if (gs.paused) {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
			ctx.font = '20px monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('●', CANVAS / 2, CANVAS / 2);
		}

		// Player labels (champion name + transport badge + node)
		for (let i = 0; i < 2; i++) {
			const alive = gs.alive?.[i] ?? true;
			const player = players.find((p) => p.wall_index === i);
			if (!player) continue;

			const champName = playerLabel(player, i);
			const transport = player.transport;
			const nodePart = nodeLabel(player);

			const x = i === 0 ? 20 : CANVAS - 20;
			const align: CanvasTextAlign = i === 0 ? 'left' : 'right';

			ctx.fillStyle = alive ? (PLAYER_COLORS[i] ?? '#666') : DEAD_COLOR;
			ctx.font = 'bold 11px monospace';
			ctx.textAlign = align;
			ctx.fillText(champName.slice(0, 14), x, CANVAS - 28);

			// Transport badge
			if (transport && transport !== 'undefined') {
				const badgeColor = transport === 'local' ? '#3b82f6' : transport === 'mesh' ? '#10b981' : transport === 'lan' ? '#a855f7' : '#6b7280';
				const badgeText = transport === 'local' ? 'HOST' : transport === 'mesh' ? 'RELAY' : transport.toUpperCase();
				ctx.font = '8px monospace';
				ctx.fillStyle = badgeColor;
				const tagX = i === 0 ? x : x;
				ctx.fillText(badgeText, tagX, CANVAS - 16);
			}

			if (nodePart) {
				ctx.font = '9px monospace';
				ctx.fillStyle = '#4b5563';
				ctx.fillText(nodePart.slice(0, 15), x, CANVAS - 6);
			}
		}
	}
</script>

<canvas
	bind:this={canvas}
	width={600}
	height={600}
	class="w-full aspect-square max-w-[600px] rounded-lg border border-gray-700"
></canvas>

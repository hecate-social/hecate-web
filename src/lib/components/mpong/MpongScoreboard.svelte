<script lang="ts">
	import type { MpongGameState, MpongPlayer } from '$lib/stores/mpong';
	import { PLAYER_COLORS } from './arena';

	interface Props {
		players: MpongPlayer[];
		gameState: MpongGameState | null;
	}

	let { players, gameState }: Props = $props();

	function playerName(player: MpongPlayer): string {
		// node_id format: "ChampionName@node_name" or "bot_N@node_name"
		const full = player.node_id ?? '';
		const atIdx = full.indexOf('@');
		if (atIdx > 0) return full.slice(0, atIdx);
		return `P${player.wall_index}`;
	}

	function nodeName(player: MpongPlayer): string {
		const full = player.node_id ?? '';
		const atIdx = full.indexOf('@');
		if (atIdx > 0) {
			const node = full.slice(atIdx + 1);
			return node.split('@')[0] ?? node;  // handle double-@ from bot names
		}
		return '';
	}
</script>

<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-3">
	<h3 class="text-xs font-medium text-gray-400 uppercase tracking-wider">Match (Best of 3)</h3>

	{#each players as player}
		{@const wi = player.wall_index}
		{@const pts = gameState?.points?.[wi] ?? 0}
		{@const gw = gameState?.games_won?.[wi] ?? 0}
		{@const isServing = gameState?.serving === wi}
		{@const color = PLAYER_COLORS[wi] ?? '#666'}

		<div class="space-y-0.5">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="w-2 h-2 rounded-full" style="background-color: {color}"></span>
					<span class="font-mono text-xs font-medium text-gray-200">{playerName(player)}</span>
					{#if isServing}
						<span class="text-yellow-400 text-xs">●</span>
					{/if}
				</div>
				<div class="flex items-center gap-2 font-mono text-xs">
					<!-- Game wins as dots -->
					{#each Array(gw) as _}
						<span class="w-1.5 h-1.5 rounded-full" style="background-color: {color}"></span>
					{/each}
					<span class="font-bold" style="color: {color}">{pts}</span>
				</div>
			</div>
			{#if nodeName(player)}
				<div class="text-[10px] text-gray-600 ml-4">{nodeName(player)}</div>
			{/if}
		</div>
	{/each}
</div>

<script lang="ts">
	import type { MpongGameState, MpongPlayer } from '$lib/stores/mpong';
	import { PLAYER_COLORS } from './arena';

	interface Props {
		players: MpongPlayer[];
		gameState: MpongGameState | null;
	}

	let { players, gameState }: Props = $props();

	function playerName(player: MpongPlayer): string {
		if (player.champion_name && player.champion_name !== 'undefined') return player.champion_name;
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
			return node.split('@')[0] ?? node;
		}
		return '';
	}

	function transportBadge(player: MpongPlayer): { label: string; cls: string } | null {
		const t = player.transport;
		if (!t || t === 'undefined') return null;
		if (t === 'mesh') return { label: 'MESH', cls: 'bg-emerald-800/40 text-emerald-400' };
		if (t === 'lan') return { label: 'LAN', cls: 'bg-purple-800/40 text-purple-400' };
		if (t === 'local') return { label: 'LOCAL', cls: 'bg-gray-700/40 text-gray-400' };
		return { label: t.toUpperCase(), cls: 'bg-gray-700/40 text-gray-400' };
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
		{@const badge = transportBadge(player)}

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
					{#each Array(gw) as _}
						<span class="w-1.5 h-1.5 rounded-full" style="background-color: {color}"></span>
					{/each}
					<span class="font-bold" style="color: {color}">{pts}</span>
				</div>
			</div>
			<div class="flex items-center gap-1.5 ml-4 text-[10px]">
				{#if badge}
					<span class="px-1 rounded {badge.cls}">{badge.label}</span>
				{/if}
				{#if player.country}
					<span class="text-gray-500">{player.city ? `${player.city}, ${player.country}` : player.country}</span>
				{/if}
				{#if player.rtt_ms != null && player.rtt_ms !== undefined}
					<span class="text-gray-500">{player.rtt_ms}ms</span>
				{/if}
				{#if nodeName(player)}
					<span class="text-gray-600">{nodeName(player)}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<script lang="ts">
	import {
		games, lobbies, champion, currentLobby,
		fetchGames, fetchLobbies, fetchChampion,
		quickStart, openLobby, connectLobbyStream
	} from '$lib/stores/mpong';
	import { onMount } from 'svelte';
	import { PLAYER_COLORS } from './arena';

	interface Props {
		onSelectGame: (gameId: string) => void;
	}

	let { onSelectGame }: Props = $props();
	let starting = $state(false);
	let openingLobby = $state(false);

	onMount(() => {
		fetchChampion();
		fetchGames();
		fetchLobbies();
		// Don't connect lobby stream until user opens a lobby
		const interval = setInterval(() => { fetchGames(); fetchLobbies(); }, 3000);
		return () => clearInterval(interval);
	});

	async function handleQuickStart() {
		starting = true;
		const gameId = await quickStart(2);
		starting = false;
		if (gameId) onSelectGame(gameId);
	}

	let hostingMode: 'lan' | 'mesh' | 'mixed' | null = $state(null);

	async function handleHost(mode: 'lan' | 'mesh' | 'mixed') {
		openingLobby = true;
		hostingMode = mode;
		connectLobbyStream();
		waitingForLobbyGame = true;
		await openLobby(2, mode);
		openingLobby = false;
	}

	// When lobby countdown hits 0 and game starts, navigate to game
	// Only react if we explicitly opened/joined a lobby (not from stale SSE events)
	let waitingForLobbyGame = $state(false);

	$effect(() => {
		if (!waitingForLobbyGame) return;
		const lobby = $currentLobby;
		if (lobby?.game_id && (lobby.state === 'playing' || (lobby.state === 'countdown' && lobby.countdown === 0))) {
			waitingForLobbyGame = false;
			onSelectGame(lobby.game_id);
		}
	});

	function statusBadge(status: string): string {
		switch (status) {
			case 'waiting': return 'bg-yellow-500/20 text-yellow-400';
			case 'playing': return 'bg-green-500/20 text-green-400';
			case 'ended': return 'bg-gray-500/20 text-gray-400';
			default: return 'bg-gray-500/20 text-gray-400';
		}
	}

	function styleEmoji(style: string): string {
		switch (style) {
			case 'slicer': return '\u2694';
			case 'wall': return '\uD83E\uDDF1';
			case 'gambler': return '\uD83C\uDFB2';
			case 'ghost': return '\uD83D\uDC7B';
			default: return '\uD83E\uDD16';
		}
	}
</script>

<div class="space-y-6">
	<!-- Our Champion -->
	{#if $champion}
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
			<div class="flex items-center justify-between">
				<div>
					<span class="text-xs text-gray-400">Your Champion</span>
					<div class="flex items-center gap-2 mt-1">
						<span class="text-lg">{styleEmoji($champion.personality?.style ?? '')}</span>
						<span class="text-sm font-medium text-gray-200">{$champion.name}</span>
						<span class="text-xs text-gray-500">{$champion.personality?.style}</span>
					</div>
				</div>
				<div class="text-right text-xs text-gray-500">
					<div>W: {$champion.wins} L: {$champion.losses}</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-xs text-gray-500 animate-pulse">
			Generating champion...
		</div>
	{/if}

	<!-- Actions -->
	<div class="flex gap-2">
		<button
			onclick={handleQuickStart}
			disabled={starting}
			class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
		>
			{starting ? 'Starting...' : 'Quick Play'}
		</button>
		<button
			onclick={() => handleHost('lan')}
			disabled={openingLobby}
			class="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
		>
			{openingLobby && hostingMode === 'lan' ? 'Hosting...' : 'LAN'}
		</button>
		<button
			onclick={() => handleHost('mesh')}
			disabled={openingLobby}
			class="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
		>
			{openingLobby && hostingMode === 'mesh' ? 'Hosting...' : 'Mesh'}
		</button>
		<button
			onclick={() => handleHost('mixed')}
			disabled={openingLobby}
			class="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
		>
			{openingLobby && hostingMode === 'mixed' ? 'Hosting...' : 'Mixed'}
		</button>
	</div>

	<!-- Current Lobby (if we opened or joined one) -->
	{#if $currentLobby?.game_id}
		<div class="rounded-lg border border-purple-700/50 bg-purple-900/20 p-4">
			<div class="flex items-center justify-between mb-2">
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium text-purple-300">Lobby {$currentLobby.game_id.slice(0, 8)}</span>
					<span class="text-[10px] px-1.5 py-0.5 rounded {
						$currentLobby.mode === 'mesh' ? 'bg-emerald-500/20 text-emerald-400' :
						$currentLobby.mode === 'mixed' ? 'bg-amber-500/20 text-amber-400' :
						'bg-purple-500/20 text-purple-400'}">
						{$currentLobby.mode ?? 'lan'}
					</span>
				</div>
				<span class="text-xs px-1.5 py-0.5 rounded {statusBadge($currentLobby.state)}">
					{$currentLobby.state}
				</span>
			</div>

			<!-- Seats -->
			<div class="space-y-1.5">
				{#each $currentLobby.seats as seat}
					<div class="space-y-0.5">
						<div class="flex items-center justify-between text-xs">
							<div class="flex items-center gap-2">
								<span class="w-2 h-2 rounded-full"
									style="background-color: {seat.status === 'reserved' ? PLAYER_COLORS[seat.wall_index] ?? '#666' : '#374151'}">
								</span>
								{#if seat.status === 'reserved'}
									<span class="text-gray-200">{seat.champion_name}</span>
									<span class="text-gray-500">@{seat.node_id?.split('@')[0]?.slice(0, 12)}</span>
								{:else}
									<span class="text-gray-500 animate-pulse">Waiting for challenger...</span>
								{/if}
							</div>
							<span class="text-gray-600">wall {seat.wall_index}</span>
						</div>
						{#if seat.status === 'reserved' && seat.transport}
							<div class="ml-4 flex items-center gap-1.5 text-[10px]">
								<span class="px-1 rounded {seat.transport === 'mesh' ? 'bg-emerald-800/40 text-emerald-400' : 'bg-purple-800/40 text-purple-400'}">
									{seat.transport}
								</span>
								{#if seat.country}
									<span class="text-gray-500">{seat.city ? `${seat.city}, ${seat.country}` : seat.country}</span>
								{/if}
								{#if seat.rtt_ms != null}
									<span class="text-gray-500">{seat.rtt_ms}ms</span>
								{/if}
								{#if seat.nat_type && seat.nat_type !== 'unknown'}
									<span class="text-gray-600">NAT:{seat.nat_type}</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Countdown -->
			{#if $currentLobby.state === 'countdown'}
				<div class="mt-3 text-center">
					<span class="text-3xl font-bold text-white animate-pulse">{$currentLobby.countdown}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- LAN Lobbies (from other nodes) -->
	{#if $lobbies.length > 0}
		<div>
			<h3 class="text-sm font-medium text-gray-300 mb-2">Nearby Games</h3>
			<div class="space-y-2">
				{#each $lobbies.filter(l => l?.game_id) as lobby}
					<div class="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
						<div class="flex items-center justify-between">
							<div>
								<span class="text-xs font-mono text-gray-300">{lobby.game_id.slice(0, 8)}</span>
								<span class="ml-2 text-xs text-gray-500">hosted by {lobby.host_node?.split('@')[0] ?? '?'}</span>
							</div>
							<span class="text-xs text-gray-400">{lobby.open_seats} open</span>
						</div>
						<div class="mt-1 text-xs text-gray-400">
							Champion: {lobby.host_champion_name ?? 'Unknown'}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Active Games -->
	{#if $games.length > 0}
		<div>
			<h3 class="text-sm font-medium text-gray-300 mb-2">Recent Games</h3>
			<div class="space-y-2">
				{#each $games as game}
					<button
						onclick={() => onSelectGame(game.game_id)}
						class="w-full text-left rounded-lg border border-gray-700 bg-gray-800/30 p-3 hover:bg-gray-700/50 transition-colors"
					>
						<div class="flex items-center justify-between">
							<div>
								<span class="text-xs font-mono text-gray-300">{game.game_id.slice(0, 12)}</span>
								<span class="ml-2 text-xs px-1.5 py-0.5 rounded {statusBadge(game.status)}">
									{game.status}
								</span>
							</div>
							<span class="text-xs text-gray-400">{game.players.length} players</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

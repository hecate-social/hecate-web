<script lang="ts">
	import { COLORS } from '$lib/game/snake-gladiators/constants';
	import { exportChampion, fetchChampion } from '$lib/game/snake-gladiators/client';
	import type { Champion } from '$lib/game/snake-gladiators/types';

	interface Props {
		stableId: string;
		champion: Champion | null;
		onTestDuel?: (stableId: string) => void;
		onContinueTraining?: (stableId: string) => void;
	}

	let { stableId, champion = $bindable(), onTestDuel, onContinueTraining }: Props = $props();

	let exporting = $state(false);
	let exported = $state(false);
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function handleExport(): Promise<void> {
		exporting = true;
		error = null;
		try {
			await exportChampion(stableId);
			exported = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		exporting = false;
	}

	async function handleRetry(): Promise<void> {
		loading = true;
		error = null;
		try {
			champion = await fetchChampion(stableId);
		} catch (e) {
			error = 'Champion not found yet. Training may still be finalizing.';
		}
		loading = false;
	}

	const winRate = $derived(
		champion && champion.wins + champion.losses + champion.draws > 0
			? Math.round((champion.wins / (champion.wins + champion.losses + champion.draws)) * 100)
			: 0
	);
</script>

{#if champion}
	<div class="rounded-xl bg-surface-800/80 border border-surface-600/50 p-5">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h3 class="text-sm font-semibold text-surface-100">Champion</h3>
				<p class="text-[10px] text-surface-400 mt-0.5">
					Best neural network from this stable
				</p>
			</div>
			{#if !exported}
				<button
					onclick={handleExport}
					disabled={exporting}
					class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200
						bg-gradient-to-r from-purple-600 to-amber-600
						hover:from-purple-500 hover:to-amber-500
						text-white shadow-lg shadow-purple-900/30
						disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{exporting ? 'Exporting...' : 'Export Champion'}
				</button>
			{:else}
				<span class="text-[11px] font-semibold" style:color={COLORS.completed}>Exported</span>
			{/if}
		</div>

		{#if error}
			<p class="text-[11px] text-red-400 mb-3">{error}</p>
		{/if}

		<div class="grid grid-cols-4 gap-2">
			<div class="rounded-lg bg-surface-900/50 px-3 py-2 text-center">
				<div class="text-lg font-bold tabular-nums" style:color={COLORS.fitness}>
					{champion.fitness.toFixed(1)}
				</div>
				<div class="text-[9px] text-surface-500 uppercase tracking-wider">Fitness</div>
			</div>
			<div class="rounded-lg bg-surface-900/50 px-3 py-2 text-center">
				<div class="text-lg font-bold text-surface-100 tabular-nums">
					{champion.generation}
				</div>
				<div class="text-[9px] text-surface-500 uppercase tracking-wider">Generation</div>
			</div>
			<div class="rounded-lg bg-surface-900/50 px-3 py-2 text-center">
				<div class="text-lg font-bold tabular-nums" style:color={COLORS.completed}>
					{champion.wins}
				</div>
				<div class="text-[9px] text-surface-500 uppercase tracking-wider">Wins</div>
			</div>
			<div class="rounded-lg bg-surface-900/50 px-3 py-2 text-center">
				<div class="text-lg font-bold text-surface-100 tabular-nums">
					{winRate}%
				</div>
				<div class="text-[9px] text-surface-500 uppercase tracking-wider">Win Rate</div>
			</div>
		</div>

		<div class="flex items-center gap-3 mt-3 text-[11px] text-surface-400">
			<span>W: <span class="text-surface-200 tabular-nums">{champion.wins}</span></span>
			<span>L: <span class="text-surface-200 tabular-nums">{champion.losses}</span></span>
			<span>D: <span class="text-surface-200 tabular-nums">{champion.draws}</span></span>
		</div>

		<!-- Action buttons -->
		<div class="flex items-center gap-2 mt-4">
			{#if onTestDuel}
				<button
					onclick={() => onTestDuel?.(stableId)}
					class="flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200
						bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30
						hover:border-blue-500/50"
				>
					Test in Duel
				</button>
			{/if}
			{#if onContinueTraining}
				<button
					onclick={() => onContinueTraining?.(stableId)}
					class="flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200
						bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30
						hover:border-purple-500/50"
				>
					Continue Training
				</button>
			{/if}
		</div>
	</div>
{:else}
	<div class="rounded-xl bg-surface-800/80 border border-surface-600/50 p-5 text-center">
		<h3 class="text-sm font-semibold text-surface-100 mb-2">Champion</h3>
		{#if error}
			<p class="text-[11px] text-red-400 mb-3">{error}</p>
		{/if}
		<p class="text-[11px] text-surface-400 mb-3">Loading champion data...</p>
		<button
			onclick={handleRetry}
			disabled={loading}
			class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200
				bg-surface-700 hover:bg-surface-600 text-surface-200
				disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{loading ? 'Loading...' : 'Retry'}
		</button>
	</div>
{/if}

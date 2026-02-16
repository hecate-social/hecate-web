<script lang="ts">
	import GladiatorStablesList from './snake-gladiators/GladiatorStablesList.svelte';
	import GladiatorTrainingMonitor from './snake-gladiators/GladiatorTrainingMonitor.svelte';
	import GladiatorDuelView from './snake-gladiators/GladiatorDuelView.svelte';
	import type { Stable } from '$lib/game/snake-gladiators/types';

	interface Props {
		onBack: () => void;
	}

	let { onBack }: Props = $props();

	let view: 'stables' | 'training' | 'duel' = $state('stables');
	let selectedStableId = $state<string | null>(null);

	function handleSelectStable(stableId: string, _status: Stable['status']): void {
		selectedStableId = stableId;
		view = 'training';
	}

	function handleTestDuel(stableId: string): void {
		selectedStableId = stableId;
		view = 'duel';
	}

	function handleContinueTraining(stableId: string): void {
		selectedStableId = stableId;
		view = 'stables';
	}

	function handleBackToStables(): void {
		view = 'stables';
		selectedStableId = null;
	}
</script>

{#if view === 'duel' && selectedStableId}
	<GladiatorDuelView
		stableId={selectedStableId}
		onBack={handleBackToStables}
	/>
{:else if view === 'training' && selectedStableId}
	<GladiatorTrainingMonitor
		stableId={selectedStableId}
		onBack={handleBackToStables}
		onTestDuel={handleTestDuel}
		onContinueTraining={handleContinueTraining}
	/>
{:else}
	<GladiatorStablesList
		{onBack}
		onSelectStable={handleSelectStable}
		seedStableId={selectedStableId}
		onClearSeed={() => { selectedStableId = null; }}
	/>
{/if}

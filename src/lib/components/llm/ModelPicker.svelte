<script lang="ts">
	import type { Model } from '$lib/types/llm';
	import { SPECIALTIES, specialtyOf, costOf, filterModels } from './model-filters';
	import { onMount } from 'svelte';

	interface Props {
		models: Model[];
		currentModel: string;
		onSelect: (modelName: string) => void;
		onClose: () => void;
		anchorRect: DOMRect;
	}

	let { models, currentModel, onSelect, onClose, anchorRect }: Props = $props();

	let searchText = $state('');
	let selectedProvider: string | null = $state(null);
	let selectedSpecialty: string | null = $state(null);
	let searchInput: HTMLInputElement | undefined = $state();
	let panelEl: HTMLDivElement | undefined = $state();
	let flipAbove = $state(false);

	const providers = $derived([...new Set(models.map((m) => m.provider))].sort());
	const filtered = $derived(filterModels(models, searchText, selectedProvider, selectedSpecialty));
	const hasActiveFilters = $derived(!!searchText || !!selectedProvider || !!selectedSpecialty);
	const activeFilterCount = $derived(
		(searchText ? 1 : 0) + (selectedProvider ? 1 : 0) + (selectedSpecialty ? 1 : 0)
	);

	onMount(() => {
		searchInput?.focus();
		positionPanel();
	});

	function positionPanel() {
		const spaceBelow = window.innerHeight - anchorRect.bottom;
		flipAbove = spaceBelow < 380 && anchorRect.top > spaceBelow;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}

	function selectModel(name: string) {
		onSelect(name);
		onClose();
	}

	function toggleProvider(p: string) {
		selectedProvider = selectedProvider === p ? null : p;
	}

	function toggleSpecialty(s: string) {
		selectedSpecialty = selectedSpecialty === s ? null : s;
	}

	function clearFilters() {
		searchText = '';
		selectedProvider = null;
		selectedSpecialty = null;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-40" onkeydown={handleKeydown} onclick={onClose}></div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={panelEl}
	class="fixed z-50 w-80 max-h-[420px] flex flex-col rounded-lg border border-surface-600
		bg-surface-800 shadow-xl shadow-black/40"
	style="left: {anchorRect.left}px; {flipAbove
		? `bottom: ${window.innerHeight - anchorRect.top + 4}px`
		: `top: ${anchorRect.bottom + 4}px`};"
	onkeydown={handleKeydown}
	onclick={(e) => e.stopPropagation()}
>
	<!-- Search -->
	<div class="p-2 border-b border-surface-700">
		<div class="relative">
			<input
				bind:this={searchInput}
				type="text"
				bind:value={searchText}
				placeholder="Search models..."
				class="w-full px-3 py-1.5 pl-7 text-xs rounded
					bg-surface-700 border border-surface-600
					text-surface-100 placeholder:text-surface-500
					focus:outline-none focus:border-hecate-500
					transition-colors"
			/>
			<span class="absolute left-2 top-1/2 -translate-y-1/2 text-surface-500 text-[10px]">
				&#128269;
			</span>
		</div>
	</div>

	<!-- Pills -->
	<div class="px-2 pt-2 pb-1 flex flex-col gap-1.5 border-b border-surface-700">
		{#if providers.length > 1}
			<div class="flex flex-wrap gap-1">
				<span class="text-[9px] text-surface-500 self-center mr-0.5">Provider</span>
				{#each providers as provider}
					<button
						onclick={() => toggleProvider(provider)}
						class="px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer
							{selectedProvider === provider
								? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
								: 'bg-surface-800/60 border-surface-600/50 text-surface-400 hover:border-surface-500 hover:text-surface-300'}"
					>
						{provider}
					</button>
				{/each}
			</div>
		{/if}

		<div class="flex flex-wrap gap-1">
			<span class="text-[9px] text-surface-500 self-center mr-0.5">Specialty</span>
			{#each SPECIALTIES as specialty}
				<button
					onclick={() => toggleSpecialty(specialty)}
					class="px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer
						{selectedSpecialty === specialty
							? 'bg-hecate-500/20 border-hecate-500/50 text-hecate-400'
							: 'bg-surface-800/60 border-surface-600/50 text-surface-400 hover:border-surface-500 hover:text-surface-300'}"
				>
					{specialty}
				</button>
			{/each}
		</div>

		<!-- Filter status -->
		<div class="flex items-center justify-between text-[9px] text-surface-500 pb-0.5">
			<span>{filtered.length} of {models.length} models</span>
			{#if hasActiveFilters}
				<button
					onclick={clearFilters}
					class="text-surface-400 hover:text-accent-400 transition-colors cursor-pointer"
				>
					Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
				</button>
			{/if}
		</div>
	</div>

	<!-- Model list -->
	<div class="flex-1 overflow-y-auto min-h-0">
		{#each filtered as model}
			<button
				onclick={() => selectModel(model.name)}
				class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer
					hover:bg-surface-700/80
					{model.name === currentModel
						? 'bg-hecate-500/10 border-l-2 border-l-hecate-500'
						: 'border-l-2 border-l-transparent'}"
			>
				<div class="flex-1 min-w-0">
					<div class="text-xs text-surface-100 truncate">{model.name}</div>
				</div>
				<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-700 text-hecate-400 shrink-0">
					{model.provider}
				</span>
				<span class="text-[9px] text-amber-400/80 shrink-0" title="Estimated cost">
					{costOf(model)}
				</span>
				{#if model.parameter_size}
					<span class="text-[9px] text-surface-500 shrink-0">{model.parameter_size}</span>
				{/if}
			</button>
		{/each}

		{#if filtered.length === 0}
			<div class="text-center py-4">
				<div class="text-[11px] text-surface-400">No models match</div>
				{#if hasActiveFilters}
					<button
						onclick={clearFilters}
						class="text-[10px] text-accent-400 hover:text-accent-300 mt-1 transition-colors cursor-pointer"
					>
						Clear filters
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

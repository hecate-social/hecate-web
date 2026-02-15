<script lang="ts">
	import { models } from '$lib/stores/llm.js';
	import { modelAffinity } from '$lib/stores/devops.js';

	interface Props {
		currentModel: string;
		onSelect: (name: string) => void;
		showPhaseInfo?: boolean;
		phasePreference?: string | null;
		phaseAffinity?: 'code' | 'general';
		onPinModel?: (name: string) => void;
		onClearPin?: () => void;
		phaseName?: string;
	}

	let {
		currentModel,
		onSelect,
		showPhaseInfo = false,
		phasePreference = null,
		phaseAffinity: phaseAff = 'general',
		onPinModel,
		onClearPin,
		phaseName = ''
	}: Props = $props();

	let showDropdown = $state(false);
	let providerFilter: string | null = $state(null);
	let specialtyFilter: 'all' | 'general' | 'code' = $state('all');

	// Unique providers from available models
	let providers = $derived.by(() => {
		const set = new Set<string>();
		for (const m of $models) {
			set.add(m.provider);
		}
		return Array.from(set).sort();
	});

	// Filtered models based on provider + specialty
	let filteredModels = $derived.by(() => {
		return $models.filter((m) => {
			const matchesProvider = !providerFilter || m.provider === providerFilter;
			const matchesSpecialty =
				specialtyFilter === 'all' || modelAffinity(m.name) === specialtyFilter;
			return matchesProvider && matchesSpecialty;
		});
	});

	// Provider color classes
	function providerColor(provider: string): { bg: string; text: string } {
		switch (provider) {
			case 'ollama':
				return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
			case 'groq':
				return { bg: 'bg-orange-500/15', text: 'text-orange-400' };
			case 'google':
				return { bg: 'bg-blue-500/15', text: 'text-blue-400' };
			case 'anthropic':
				return { bg: 'bg-purple-500/15', text: 'text-purple-400' };
			case 'openai':
				return { bg: 'bg-green-500/15', text: 'text-green-400' };
			default:
				return { bg: 'bg-surface-600', text: 'text-surface-300' };
		}
	}

	function handleSelect(name: string) {
		onSelect(name);
		showDropdown = false;
	}

	function handlePin(name: string) {
		onPinModel?.(name);
		showDropdown = false;
	}

	function handleClearPin() {
		onClearPin?.();
		showDropdown = false;
	}
</script>

<div class="relative">
	<button
		onclick={() => (showDropdown = !showDropdown)}
		class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
			bg-surface-700 border border-surface-600
			hover:border-surface-500 transition-colors text-surface-200"
	>
		<span class="max-w-[150px] truncate">{currentModel || 'No model'}</span>
		{#if phasePreference}
			<span
				class="text-[8px] px-1 rounded bg-hecate-600/20 text-hecate-400"
				title="Pinned for this phase">{'\u{1F4CC}'}</span
			>
		{/if}
		<span class="text-surface-400">{'\u{25BE}'}</span>
	</button>

	{#if showDropdown}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute top-full right-0 mt-1 w-72 rounded-lg border border-surface-600
				bg-surface-800 shadow-lg z-20 overflow-hidden"
			onmouseleave={() => (showDropdown = false)}
		>
			<!-- Phase affinity header (optional) -->
			{#if showPhaseInfo}
				<div class="px-2.5 py-1.5 border-b border-surface-600 text-[9px] text-surface-400">
					Phase prefers
					<span class="text-surface-200"
						>{phaseAff === 'code' ? 'code-optimized' : 'general-purpose'}</span
					> models
					{#if phasePreference}
						<button
							onclick={handleClearPin}
							class="ml-1 text-hecate-400 hover:text-hecate-300"
						>
							(clear pin)
						</button>
					{/if}
				</div>
			{/if}

			<!-- Filter chips -->
			<div class="px-2.5 py-1.5 border-b border-surface-600 space-y-1">
				<!-- Provider filter -->
				<div class="flex items-center gap-1 flex-wrap">
					<span class="text-[8px] text-surface-500 w-10 shrink-0">Prov:</span>
					<button
						onclick={() => (providerFilter = null)}
						class="text-[9px] px-1.5 py-0.5 rounded transition-colors
							{providerFilter === null
							? 'bg-hecate-600/20 text-hecate-400'
							: 'bg-surface-700 text-surface-400 hover:text-surface-200'}"
					>
						All
					</button>
					{#each providers as prov}
						{@const colors = providerColor(prov)}
						<button
							onclick={() => (providerFilter = providerFilter === prov ? null : prov)}
							class="text-[9px] px-1.5 py-0.5 rounded transition-colors
								{providerFilter === prov
								? colors.bg + ' ' + colors.text
								: 'bg-surface-700 text-surface-400 hover:text-surface-200'}"
						>
							{prov}
						</button>
					{/each}
				</div>

				<!-- Specialty filter -->
				<div class="flex items-center gap-1">
					<span class="text-[8px] text-surface-500 w-10 shrink-0">Type:</span>
					<button
						onclick={() => (specialtyFilter = 'all')}
						class="text-[9px] px-1.5 py-0.5 rounded transition-colors
							{specialtyFilter === 'all'
							? 'bg-hecate-600/20 text-hecate-400'
							: 'bg-surface-700 text-surface-400 hover:text-surface-200'}"
					>
						All
					</button>
					<button
						onclick={() => (specialtyFilter = 'general')}
						class="text-[9px] px-1.5 py-0.5 rounded transition-colors
							{specialtyFilter === 'general'
							? 'bg-hecate-600/20 text-hecate-400'
							: 'bg-surface-700 text-surface-400 hover:text-surface-200'}"
					>
						General
					</button>
					<button
						onclick={() => (specialtyFilter = 'code')}
						class="text-[9px] px-1.5 py-0.5 rounded transition-colors
							{specialtyFilter === 'code'
							? 'bg-phase-tni/20 text-phase-tni'
							: 'bg-surface-700 text-surface-400 hover:text-surface-200'}"
					>
						Coding
					</button>
				</div>
			</div>

			<!-- Model list -->
			<div class="max-h-48 overflow-y-auto">
				{#each filteredModels as model}
					{@const isActive = currentModel === model.name}
					{@const aff = modelAffinity(model.name)}
					{@const colors = providerColor(model.provider)}
					{@const isPinned = phasePreference === model.name}

					<div class="flex items-center border-b border-surface-700/50">
						<button
							onclick={() => handleSelect(model.name)}
							class="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 text-[10px]
								text-left transition-colors
								{isActive
								? 'bg-hecate-600/10 text-surface-100'
								: 'text-surface-300 hover:bg-surface-700'}"
						>
							{#if isActive}
								<span class="text-hecate-400">{'\u{25CF}'}</span>
							{:else}
								<span class="text-surface-500">{'\u{25CB}'}</span>
							{/if}

							<span class="truncate flex-1">{model.name}</span>

							<span class="text-[8px] px-1 py-0.5 rounded {colors.bg} {colors.text}">
								{model.provider}
							</span>

							{#if aff === 'code'}
								<span class="text-[8px] px-1 py-0.5 rounded bg-phase-tni/15 text-phase-tni">
									code
								</span>
							{/if}

							{#if model.parameter_size}
								<span class="text-[8px] text-surface-500">{model.parameter_size}</span>
							{/if}

							{#if isPinned}
								<span class="text-[8px] text-hecate-400">{'\u{1F4CC}'}</span>
							{/if}
						</button>

						{#if showPhaseInfo && onPinModel}
							<button
								onclick={() => isPinned ? handleClearPin() : handlePin(model.name)}
								class="px-2 py-1.5 text-[9px] text-surface-500
									hover:text-hecate-400 transition-colors"
								title="{isPinned ? 'Unpin' : 'Pin for'} {phaseName} phase"
							>
								{isPinned ? '\u{2715}' : '\u{1F4CC}'}
							</button>
						{/if}
					</div>
				{/each}
			</div>

			{#if filteredModels.length === 0}
				<div class="px-2.5 py-3 text-[10px] text-surface-400 text-center">
					No models match filters
				</div>
			{/if}
		</div>
	{/if}
</div>

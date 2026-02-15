<script lang="ts">
	import VentureHeader from '$lib/components/devops/VentureHeader.svelte';
	import VisionOracle from '$lib/components/devops/VisionOracle.svelte';
	import VentureSummary from '$lib/components/devops/VentureSummary.svelte';
	import DivisionNav from '$lib/components/devops/DivisionNav.svelte';
	import PhaseProgress from '$lib/components/devops/PhaseProgress.svelte';
	import DnAView from '$lib/components/devops/DnAView.svelte';
	import AnPView from '$lib/components/devops/AnPView.svelte';
	import TnIView from '$lib/components/devops/TnIView.svelte';
	import DnOView from '$lib/components/devops/DnOView.svelte';
	import BigPictureBoard from '$lib/components/devops/BigPictureBoard.svelte';
	import EventStreamViewer from '$lib/components/devops/EventStreamViewer.svelte';
	import AIAssistPanel from '$lib/components/devops/AIAssistPanel.svelte';
	import {
		activeVenture,
		ventures,
		divisions,
		selectedDivision,
		selectedPhase,
		isLoading,
		devopsError,
		showAIAssist,
		showEventStream,
		ventureStep,
		bigPicturePhase,
		fetchActiveVenture,
		fetchVentures,
		selectVenture,
		initiateVenture,
		openAIAssist
	} from '$lib/stores/devops.js';
	import { VL_ARCHIVED } from '$lib/types.js';
	import { onMount } from 'svelte';

	let ventureName = $state('');
	let ventureBrief = $state('');

	onMount(() => {
		fetchActiveVenture();
		fetchVentures();
	});

	async function handleInitiate() {
		if (!ventureName.trim()) return;
		const result = await initiateVenture(
			ventureName.trim(),
			ventureBrief.trim() || undefined
		);
		if (result) {
			ventureName = '';
			ventureBrief = '';
		}
	}
</script>

<div class="flex flex-col h-full">
	{#if $isLoading && !$activeVenture}
		<!-- Loading state -->
		<div class="flex items-center justify-center h-full">
			<div class="text-center text-surface-400">
				<div class="text-2xl mb-2 animate-pulse">{'\u{25C6}'}</div>
				<div class="text-sm">Loading venture...</div>
			</div>
		</div>
	{:else if !$activeVenture}
		<!-- No venture — initiation view -->
		<div class="flex items-center justify-center h-full">
			<div class="max-w-md w-full mx-4">
				<div class="text-center mb-8">
					<div class="text-4xl mb-4 text-hecate-400">{'\u{25C6}'}</div>
					<h2 class="text-lg font-semibold text-surface-100 mb-2">
						No Active Venture
					</h2>
					<p class="text-xs text-surface-400 leading-relaxed">
						A venture is the umbrella for your software endeavor. It houses
						divisions (bounded contexts) and guides them through the development
						lifecycle.
					</p>
				</div>

				<!-- Existing ventures -->
				{#if $ventures.length > 0}
					<div class="rounded-lg border border-surface-600 bg-surface-800 p-4 mb-4 space-y-2">
						<h3 class="text-[11px] text-surface-400 uppercase tracking-wider mb-2">
							Existing Ventures
						</h3>
						{#each $ventures.filter((v) => !(v.status & VL_ARCHIVED)) as v}
							<button
								onclick={() => selectVenture(v)}
								class="w-full text-left px-3 py-2.5 rounded-lg border transition-colors
									border-surface-600 hover:border-hecate-500 hover:bg-hecate-600/10"
							>
								<div class="flex items-center gap-2">
									<span class="text-hecate-400">{'\u{25C6}'}</span>
									<span class="text-sm font-medium text-surface-100">{v.name}</span>
									<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-300 border border-surface-600">
										{v.status_label}
									</span>
								</div>
								{#if v.brief}
									<div class="text-[11px] text-surface-400 mt-1 ml-6 truncate">
										{v.brief}
									</div>
								{/if}
							</button>
						{/each}
					</div>

					<div class="text-center text-[11px] text-surface-500 mb-4">or create a new one</div>
				{/if}

				<div
					class="rounded-lg border border-surface-600 bg-surface-800 p-6 space-y-4"
				>
					<div>
						<label
							for="venture-name"
							class="text-[11px] text-surface-300 block mb-1.5"
						>
							Venture Name
						</label>
						<input
							id="venture-name"
							bind:value={ventureName}
							placeholder="e.g., my-saas-app, marketplace, social-platform"
							class="w-full bg-surface-700 border border-surface-600 rounded-lg
								px-4 py-2.5 text-sm text-surface-100 placeholder-surface-400
								focus:outline-none focus:border-hecate-500"
						/>
					</div>
					<div>
						<label
							for="venture-brief"
							class="text-[11px] text-surface-300 block mb-1.5"
						>
							Brief (optional)
						</label>
						<textarea
							id="venture-brief"
							bind:value={ventureBrief}
							placeholder="What does this venture aim to achieve? One or two sentences."
							rows={3}
							class="w-full bg-surface-700 border border-surface-600 rounded-lg
								px-4 py-2.5 text-sm text-surface-100 placeholder-surface-400
								resize-none focus:outline-none focus:border-hecate-500"
						></textarea>
					</div>

					{#if $devopsError}
						<div
							class="text-[11px] text-health-err bg-health-err/10 rounded px-3 py-2"
						>
							{$devopsError}
						</div>
					{/if}

					<div class="flex gap-3">
						<button
							onclick={handleInitiate}
							disabled={!ventureName.trim() || $isLoading}
							class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
								{!ventureName.trim() || $isLoading
								? 'bg-surface-600 text-surface-400 cursor-not-allowed'
								: 'bg-hecate-600 text-surface-50 hover:bg-hecate-500'}"
						>
							{$isLoading ? 'Initiating...' : 'Initiate Venture'}
						</button>
						<button
							onclick={() =>
								openAIAssist(
									'Help me define a new venture. What should I consider? Ask me about the problem domain, target users, and core functionality.'
								)}
							class="px-4 py-2.5 rounded-lg text-sm text-hecate-400 border border-hecate-600/30
								hover:bg-hecate-600/10 transition-colors"
						>
							{'\u{2726}'} AI Help
						</button>
					</div>
				</div>

				<p class="text-center text-[10px] text-surface-500 mt-4">
					The venture lifecycle: Setup {'\u{2192}'} Discovery {'\u{2192}'} Design
					{'\u{2192}'} Plan {'\u{2192}'} Implement {'\u{2192}'} Deploy {'\u{2192}'}
					Monitor {'\u{2192}'} Rescue {'\u{21BA}'}
				</p>
			</div>
		</div>

		<!-- AI Assist panel even when no venture -->
		{#if $showAIAssist}
			<div class="absolute top-0 right-0 bottom-0 z-10">
				<AIAssistPanel />
			</div>
		{/if}
	{:else}
		<!-- Active venture -->
		<VentureHeader />

		<div class="flex flex-1 overflow-hidden relative">
			<!-- Left: Division nav -->
			{#if $divisions.length > 0}
				<DivisionNav />
			{/if}

			<!-- Main: Phase content -->
			<div class="flex-1 flex flex-col overflow-hidden">
				{#if $selectedDivision}
					<PhaseProgress />

					<div class="flex-1 overflow-y-auto">
						{#if $selectedPhase === 'dna'}
							<DnAView />
						{:else if $selectedPhase === 'anp'}
							<AnPView />
						{:else if $selectedPhase === 'tni'}
							<TnIView />
						{:else if $selectedPhase === 'dno'}
							<DnOView />
						{/if}
					</div>
				{:else if $divisions.length === 0}
					<!-- No divisions — Big Picture Event Storming or pre-discovery -->
					{#if $ventureStep === 'discovering' || $bigPicturePhase !== 'ready'}
						<div class="flex h-full">
							<div class="flex-1 overflow-hidden">
								<BigPictureBoard />
							</div>
							{#if $showEventStream}
								<div class="w-80 border-l border-surface-600 overflow-hidden shrink-0">
									<EventStreamViewer />
								</div>
							{/if}
						</div>
					{:else if $ventureStep === 'initiated' || $ventureStep === 'vision_refined'}
						<VisionOracle />
					{:else if $ventureStep === 'vision_submitted'}
						<VentureSummary nextAction="discovery" />
					{:else if $ventureStep === 'discovery_paused'}
						<div class="flex h-full">
							<div class="flex-1 overflow-hidden">
								<BigPictureBoard />
							</div>
							{#if $showEventStream}
								<div class="w-80 border-l border-surface-600 overflow-hidden shrink-0">
									<EventStreamViewer />
								</div>
							{/if}
						</div>
					{:else if $ventureStep === 'discovery_completed'}
						<VentureSummary nextAction="identify" />
					{:else}
						<VentureSummary nextAction="discovery" />
					{/if}
				{:else}
					<div
						class="flex items-center justify-center h-full text-surface-400 text-sm"
					>
						Select a division from the sidebar
					</div>
				{/if}
			</div>

			<!-- Right: AI Assist panel -->
			{#if $showAIAssist}
				<AIAssistPanel />
			{/if}
		</div>
	{/if}
</div>

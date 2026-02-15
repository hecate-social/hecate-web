<script lang="ts">
	import ChatView from '$lib/components/llm/ChatView.svelte';
	import { models, selectedModel, fetchModels } from '$lib/stores/llm.js';
	import { onMount } from 'svelte';

	let activeApp: string | null = $state(null);

	onMount(() => {
		fetchModels();
	});

	function openChat(modelName: string) {
		$selectedModel = modelName;
		activeApp = 'chat';
	}
</script>

{#if activeApp === 'chat'}
	<ChatView onBack={() => activeApp = null} />
{:else}
	<!-- Model Explorer -->
	<div class="flex flex-col items-center h-full overflow-y-auto py-8 px-6 gap-6">
		<div class="flex flex-col items-center gap-2">
			<h2
				class="text-xl font-bold tracking-wide"
				style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				LLM Studio
			</h2>
			<p class="text-surface-400 text-xs text-center">
				Chat with AI models across providers
			</p>
		</div>

		{#if $models.length === 0}
			<div class="text-center py-8">
				<div class="text-2xl mb-2 text-surface-500">&#9670;</div>
				<div class="text-xs text-surface-400">No models available</div>
				<div class="text-[10px] text-surface-500 mt-1">Check daemon connection</div>
			</div>
		{:else}
			<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
				{#each $models as model}
					<button
						onclick={() => openChat(model.name)}
						class="group relative flex flex-col items-center gap-2.5 p-5 rounded-xl
							bg-surface-800/80 border border-surface-600/50
							hover:border-accent-500/30 hover:bg-surface-700/80
							transition-all duration-200 cursor-pointer"
					>
						<span
							class="text-2xl transition-transform duration-200 group-hover:scale-110
								group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
						>
							&#9670;
						</span>
						<span class="text-sm font-medium text-surface-100 group-hover:text-accent-400 transition-colors">
							{model.name}
						</span>
						<div class="flex flex-col items-center gap-1">
							<span
								class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-700 text-hecate-400"
							>
								{model.provider}
							</span>
							{#if model.parameter_size}
								<span class="text-[10px] text-surface-400">
									{model.parameter_size}
								</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

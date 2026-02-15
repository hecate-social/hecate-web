<script lang="ts">
	import ChatMessageBubble from '$lib/components/ChatMessage.svelte';
	import StreamingText from '$lib/components/StreamingText.svelte';
	import {
		models,
		selectedModel,
		messages,
		isStreaming,
		streamingContent,
		lastUsage,
		sendMessage,
		clearChat,
		fetchModels
	} from '$lib/stores/llm.js';
	import {
		personalityInfo,
		activeRole,
		personalityEnabled,
		setRole,
		togglePersonality
	} from '$lib/stores/personality.js';
	import { onMount, tick } from 'svelte';

	let inputValue = $state('');
	let messagesContainer: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	onMount(() => {
		fetchModels();
		inputEl?.focus();
	});

	async function handleSubmit() {
		if (!inputValue.trim() || $isStreaming) return;
		const msg = inputValue;
		inputValue = '';
		await sendMessage(msg);
		// Auto-resize textarea
		if (inputEl) {
			inputEl.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function autoResize(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = Math.min(target.scrollHeight, 200) + 'px';
	}

	// Auto-scroll on new content
	$effect(() => {
		// Reference reactive values to trigger effect
		$messages;
		$streamingContent;
		tick().then(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		});
	});
</script>

<div class="flex flex-col h-full">
	<!-- Model selector bar -->
	<div
		class="flex items-center gap-3 px-4 py-2 border-b border-surface-600 bg-surface-800/50 shrink-0"
	>
		<label for="model-select" class="text-[11px] text-surface-400">Model:</label>
		<select
			id="model-select"
			bind:value={$selectedModel}
			class="bg-surface-700 border border-surface-600 rounded px-2 py-1 text-xs text-surface-100
				focus:outline-none focus:border-hecate-500 cursor-pointer"
		>
			{#each $models as model}
				<option value={model.name}>
					{model.name}
					{#if model.provider}({model.provider}){/if}
				</option>
			{/each}
		</select>

		<!-- Personality / Role selector -->
		{#if $personalityInfo?.personality_loaded}
			<div class="w-px h-4 bg-surface-600"></div>

			<button
				onclick={togglePersonality}
				class="text-[11px] px-1.5 py-0.5 rounded transition-colors
					{$personalityEnabled
					? 'text-amber-400 hover:text-amber-300'
					: 'text-surface-500 hover:text-surface-400'}"
				title={$personalityEnabled ? 'Personality active (click to disable)' : 'Personality disabled (click to enable)'}
			>
				{$personalityEnabled ? '\u{1F525}' : '\u{26AB}'}
			</button>

			{#if $personalityEnabled}
				<select
					value={$activeRole ?? ''}
					onchange={(e) => setRole((e.target as HTMLSelectElement).value || null)}
					class="bg-surface-700 border border-surface-600 rounded px-1.5 py-0.5 text-[11px] text-surface-300
						focus:outline-none focus:border-amber-500/50 cursor-pointer"
				>
					<option value="">No role</option>
					{#each $personalityInfo.roles.filter(r => r.available) as role}
						<option value={role.code}>{role.name}</option>
					{/each}
				</select>
			{/if}
		{/if}

		<div class="flex-1"></div>

		{#if $lastUsage}
			<div class="text-[10px] text-surface-400 font-mono">
				{#if $lastUsage.prompt_tokens}prompt: {$lastUsage.prompt_tokens}{/if}
				{#if $lastUsage.completion_tokens}
					&middot; completion: {$lastUsage.completion_tokens}
				{/if}
			</div>
		{/if}

		<button
			onclick={clearChat}
			class="text-[11px] text-surface-400 hover:text-surface-100 px-2 py-1 rounded
				hover:bg-surface-700 transition-colors"
		>
			Clear
		</button>
	</div>

	<!-- Messages area -->
	<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4">
		{#if $messages.length === 0 && !$isStreaming}
			<div class="flex items-center justify-center h-full">
				<div class="text-center text-surface-400">
					<div class="text-3xl mb-3">◆</div>
					<div class="text-sm">Start a conversation</div>
					<div class="text-[11px] mt-1">
						{#if $selectedModel}
							Using <span class="text-hecate-400">{$selectedModel}</span>
						{:else}
							No model selected
						{/if}
					</div>
				</div>
			</div>
		{:else}
			{#each $messages as message}
				<ChatMessageBubble {message} />
			{/each}

			{#if $isStreaming}
				<StreamingText content={$streamingContent} />
			{/if}
		{/if}
	</div>

	<!-- Input area -->
	<div class="border-t border-surface-600 bg-surface-800/50 p-3 shrink-0">
		<div class="flex items-end gap-2 max-w-4xl mx-auto">
			<textarea
				bind:this={inputEl}
				bind:value={inputValue}
				onkeydown={handleKeydown}
				oninput={autoResize}
				placeholder={$isStreaming ? 'Waiting for response...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
				disabled={$isStreaming || !$selectedModel}
				rows={1}
				class="flex-1 bg-surface-700 border border-surface-600 rounded-lg px-4 py-2.5 text-sm
					text-surface-100 placeholder-surface-400 resize-none
					focus:outline-none focus:border-hecate-500
					disabled:opacity-50 disabled:cursor-not-allowed"
			></textarea>

			<button
				onclick={handleSubmit}
				disabled={$isStreaming || !inputValue.trim() || !$selectedModel}
				class="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
					{$isStreaming || !inputValue.trim() || !$selectedModel
					? 'bg-surface-600 text-surface-400 cursor-not-allowed'
					: 'bg-hecate-600 text-white hover:bg-hecate-500'}"
			>
				Send
			</button>
		</div>
	</div>
</div>

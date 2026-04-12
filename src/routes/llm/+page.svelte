<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ChatMessageBubble from '$lib/components/llm/ChatMessage.svelte';
	import StreamingText from '$lib/components/llm/StreamingText.svelte';
	import {
		models, selectedModel, messages, isStreaming, streamingContent,
		lastUsage, sendMessage, clearChat, fetchModels
	} from '$lib/stores/llm';
	import { specialtyOf, costOf, filterModels } from '$lib/components/llm/model-filters';
	import type { Model } from '$lib/types/llm';

	// =====================================================================
	// STATE
	// =====================================================================
	type View = 'chat' | 'models';
	let currentView: View = $state('chat');
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	// Model browser state
	let modelCursor = $state(0);
	let modelSearch = $state('');
	let modelMode: 'normal' | 'search' = $state('normal');

	// Chat command detection
	let statusMsg = $state('');

	// =====================================================================
	// DERIVED
	// =====================================================================
	const currentModelObj = $derived($models.find((m) => m.name === $selectedModel));
	const filteredModels = $derived(filterModels($models, modelSearch, null, null));

	const providers = $derived.by(() => {
		const set = new Set<string>();
		for (const m of $models) if (m.provider) set.add(m.provider);
		return [...set].sort();
	});

	// Group models by provider
	const groupedModels = $derived.by(() => {
		const groups: { provider: string; models: Model[] }[] = [];
		const map = new Map<string, Model[]>();
		for (const m of filteredModels) {
			const p = m.provider ?? 'unknown';
			if (!map.has(p)) map.set(p, []);
			map.get(p)!.push(m);
		}
		for (const [provider, models] of map) {
			groups.push({ provider, models });
		}
		return groups;
	});

	// =====================================================================
	// CHAT INPUT
	// =====================================================================
	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			inputEl?.blur();
		}
	}

	async function handleSubmit() {
		const val = inputValue.trim();
		if (!val || $isStreaming) return;

		// Check for : commands in chat input
		if (val.startsWith(':')) {
			inputValue = '';
			await handleCommand(val.slice(1));
			return;
		}

		if (!$selectedModel) {
			statusMsg = 'No model selected — :model <name> or Tab to browse';
			return;
		}

		inputValue = '';
		if (inputEl) inputEl.style.height = 'auto';
		await sendMessage(val);
	}

	async function handleCommand(raw: string) {
		const spaceIdx = raw.indexOf(' ');
		const cmd = spaceIdx >= 0 ? raw.substring(0, spaceIdx) : raw;
		const args = spaceIdx >= 0 ? raw.substring(spaceIdx + 1).trim() : '';

		switch (cmd) {
			case 'model': case 'm':
				if (!args) { statusMsg = `Current: ${$selectedModel || 'none'}. Use :model <name>`; return; }
				const match = $models.find(m => m.name.toLowerCase() === args.toLowerCase()
					|| m.name.toLowerCase().includes(args.toLowerCase()));
				if (match) {
					$selectedModel = match.name;
					messages.set([]);
					streamingContent.set('');
					lastUsage.set(null);
					statusMsg = `Model: ${match.name}`;
				} else {
					statusMsg = `Model not found: ${args}`;
				}
				break;
			case 'models': case 'ls':
				currentView = 'models';
				modelCursor = 0;
				modelSearch = '';
				break;
			case 'clear': case 'c':
				messages.set([]);
				streamingContent.set('');
				lastUsage.set(null);
				statusMsg = 'Chat cleared';
				break;
			case 'refresh': case 'r':
				statusMsg = 'Refreshing models...';
				await fetchModels();
				statusMsg = `${$models.length} models available`;
				break;
			case 'q': case 'quit': case 'back':
				if (currentView === 'models') { currentView = 'chat'; }
				else { history.back(); }
				break;
			case 'help': case 'h': case '?':
				statusMsg = ':model <name>  :models  :clear  :refresh  :q  Tab:browse';
				break;
			default:
				statusMsg = `Unknown: ${cmd}  (:help)`;
		}
	}

	function autoResize(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = Math.min(target.scrollHeight, 200) + 'px';
	}

	// Auto-scroll on new messages
	$effect(() => {
		$messages;
		$streamingContent;
		tick().then(() => {
			if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
		});
	});

	// =====================================================================
	// MODEL BROWSER KEYBOARD
	// =====================================================================
	function onWindowKeydown(e: KeyboardEvent) {
		// Tab toggles views (only when not typing in input)
		if (e.key === 'Tab' && document.activeElement !== inputEl) {
			e.preventDefault();
			currentView = currentView === 'chat' ? 'models' : 'chat';
			if (currentView === 'chat') {
				tick().then(() => inputEl?.focus());
			}
			return;
		}

		// Only handle keys in model browser when not in chat input
		if (currentView !== 'models') return;
		if (document.activeElement === inputEl) return;

		if (modelMode === 'search') {
			handleModelSearch(e);
			return;
		}

		switch (e.key) {
			case 'j': case 'ArrowDown':
				e.preventDefault();
				modelCursor = Math.min(modelCursor + 1, filteredModels.length - 1);
				scrollModelIntoView();
				break;
			case 'k': case 'ArrowUp':
				e.preventDefault();
				modelCursor = Math.max(modelCursor - 1, 0);
				scrollModelIntoView();
				break;
			case 'g': e.preventDefault(); modelCursor = 0; scrollModelIntoView(); break;
			case 'G': e.preventDefault(); modelCursor = Math.max(0, filteredModels.length - 1); scrollModelIntoView(); break;
			case 'Enter': case 'l':
				e.preventDefault();
				if (filteredModels[modelCursor]) {
					$selectedModel = filteredModels[modelCursor].name;
					messages.set([]);
					streamingContent.set('');
					lastUsage.set(null);
					currentView = 'chat';
					statusMsg = `Model: ${filteredModels[modelCursor].name}`;
					tick().then(() => inputEl?.focus());
				}
				break;
			case '/':
				e.preventDefault();
				modelMode = 'search';
				modelSearch = '';
				break;
			case 'Escape':
				e.preventDefault();
				currentView = 'chat';
				tick().then(() => inputEl?.focus());
				break;
			case ':':
				e.preventDefault();
				// Focus the chat input with : prefix
				currentView = 'chat';
				inputValue = ':';
				tick().then(() => inputEl?.focus());
				break;
		}
	}

	function handleModelSearch(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.preventDefault();
			modelMode = 'normal';
			modelCursor = 0;
			return;
		}
		if (e.key === 'Backspace') {
			modelSearch = modelSearch.slice(0, -1);
			if (!modelSearch) modelMode = 'normal';
			modelCursor = 0;
			return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			modelSearch += e.key;
			modelCursor = 0;
		}
	}

	function scrollModelIntoView() {
		tick().then(() => document.querySelector('[data-model-cursor="true"]')?.scrollIntoView({ block: 'nearest' }));
	}

	// Status timer
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (statusMsg) {
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => { statusMsg = ''; }, 6000);
		}
	});

	$effect(() => { if (modelCursor >= filteredModels.length) modelCursor = Math.max(0, filteredModels.length - 1); });

	// =====================================================================
	// LIFECYCLE
	// =====================================================================
	onMount(() => {
		fetchModels();
		tick().then(() => inputEl?.focus());
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">LLM</span>
		{#if $selectedModel}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-300">{$selectedModel}</span>
			{#if currentModelObj?.provider}
				<span class="text-[9px] text-macula-400">{currentModelObj.provider}</span>
			{/if}
		{:else}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-500">no model</span>
		{/if}
		<div class="flex-1"></div>
		<button
			class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
				{currentView === 'chat' ? 'text-macula-400 bg-macula-600/20' : 'text-surface-500 hover:text-surface-300'}"
			onclick={() => { currentView = 'chat'; tick().then(() => inputEl?.focus()); }}
		>chat</button>
		<button
			class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
				{currentView === 'models' ? 'text-macula-400 bg-macula-600/20' : 'text-surface-500 hover:text-surface-300'}"
			onclick={() => { currentView = 'models'; modelCursor = 0; }}
		>models ({$models.length})</button>
	</div>

	{#if currentView === 'models'}
		<!-- Model browser -->
		<div class="flex-1 overflow-y-auto py-1">
			{#if filteredModels.length === 0}
				<div class="px-3 py-4 text-[11px] text-surface-600">
					{modelSearch ? 'No matches' : 'No models available — :refresh'}
				</div>
			{:else}
				{#each groupedModels as group}
					<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-1 first:mt-0">
						{group.provider} ({group.models.length})
					</div>
					{#each group.models as model}
						{@const idx = filteredModels.indexOf(model)}
						{@const isCursor = idx === modelCursor}
						{@const isSelected = model.name === $selectedModel}
						<button
							data-model-cursor={isCursor ? 'true' : 'false'}
							class="w-full text-left px-2 py-0.5 text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors
								{isCursor
									? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400'
									: 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
							onclick={() => { modelCursor = idx; }}
							ondblclick={() => {
								$selectedModel = model.name;
								messages.set([]); streamingContent.set(''); lastUsage.set(null);
								currentView = 'chat';
								tick().then(() => inputEl?.focus());
							}}
						>
							<span class="w-3 text-center shrink-0 text-[8px] {isSelected ? 'text-macula-400' : 'text-surface-600'}">
								{isSelected ? '\u25CF' : ' '}
							</span>
							<span class="flex-1 truncate font-mono text-[10px] {isSelected ? 'text-macula-400' : ''}">{model.name}</span>
							<span class="text-[9px] text-surface-600 shrink-0 w-12 text-right">{model.parameter_size ?? ''}</span>
							<span class="text-[9px] text-surface-600 shrink-0 w-16 text-right">{specialtyOf(model)}</span>
							<span class="text-[9px] text-amber-400/60 shrink-0 w-8 text-right">{costOf(model)}</span>
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Model browser status bar -->
		<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
			{#if modelMode === 'search'}
				<span class="text-macula-400">/{modelSearch}<span class="animate-pulse">_</span></span>
				<span class="text-surface-600">{filteredModels.length} matches</span>
			{:else}
				<span class="text-surface-500">models</span>
				<span class="text-surface-700">|</span>
				{#if filteredModels[modelCursor]}
					<span class="text-surface-400 truncate">{filteredModels[modelCursor].name}</span>
				{/if}
				<div class="flex-1"></div>
				<span class="text-surface-600">{modelCursor + 1}/{filteredModels.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600">Enter:select  /:filter  Esc:chat</span>
			{/if}
		</div>

	{:else}
		<!-- Chat view -->
		<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4">
			{#if $messages.length === 0 && !$isStreaming}
				<div class="flex items-center justify-center h-full">
					<div class="text-center text-surface-500 text-[11px] space-y-1">
						<div class="text-lg mb-2">{'\u25C6'}</div>
						{#if $selectedModel}
							<div>Using <span class="text-macula-400">{$selectedModel}</span></div>
						{:else}
							<div>No model — <span class="text-macula-400">Tab</span> to browse or <span class="text-macula-400">:model &lt;name&gt;</span></div>
						{/if}
						<div class="text-surface-600">Type a message below. Start with : for commands.</div>
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

		<!-- Input area (REPL-style) -->
		<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1.5 shrink-0">
			<div class="flex items-end gap-2">
				<span class="text-macula-400 text-[11px] py-1.5 shrink-0">{$isStreaming ? '\u25CF' : '\u276F'}</span>
				<textarea
					bind:this={inputEl}
					bind:value={inputValue}
					onkeydown={handleInputKeydown}
					oninput={autoResize}
					placeholder={$isStreaming ? 'streaming...' : $selectedModel ? 'message or :command' : ':model <name> to start'}
					disabled={$isStreaming}
					rows={1}
					class="flex-1 bg-transparent text-[12px] text-surface-100 placeholder:text-surface-600
						resize-none focus:outline-none disabled:opacity-50 font-mono leading-relaxed"
				></textarea>
			</div>
		</div>

		<!-- Status bar -->
		<div class="border-t border-surface-700/50 bg-surface-800/60 px-3 py-0.5 shrink-0 flex items-center gap-2 text-[9px] min-h-[20px]">
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				{#if $lastUsage}
					<span class="text-surface-600">
						{#if $lastUsage.prompt_tokens}p:{$lastUsage.prompt_tokens}{/if}
						{#if $lastUsage.completion_tokens} c:{$lastUsage.completion_tokens}{/if}
					</span>
					<span class="text-surface-700">|</span>
				{/if}
				<span class="text-surface-600">{$messages.length} msgs</span>
				<div class="flex-1"></div>
				<span class="text-surface-600">Tab:models  :help</span>
			{/if}
		</div>
	{/if}
</div>

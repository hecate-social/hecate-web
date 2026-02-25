<script lang="ts">
	import LlmBrowser from '$lib/components/llm/LlmBrowser.svelte';
	import ChatView from '$lib/components/llm/ChatView.svelte';
	import { selectedModel, activeView } from '$lib/stores/llm';

	function openChat(modelName: string) {
		$selectedModel = modelName;
		$activeView = 'chat';
	}
</script>

{#if $activeView === 'chat'}
	<ChatView onBack={() => ($activeView = 'browser')} />
{:else}
	<LlmBrowser onOpenChat={openChat} />
{/if}

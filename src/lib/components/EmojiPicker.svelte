<script lang="ts">
	let { onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void } = $props();

	const curated = [
		'\u2699\uFE0F', '\uD83D\uDEE0\uFE0F', '\uD83C\uDFAE', '\uD83D\uDC0D', '\uD83E\uDD16',
		'\uD83D\uDD78\uFE0F', '\uD83D\uDED2', '\uD83D\uDCBB', '\uD83C\uDF10', '\uD83D\uDD12',
		'\uD83D\uDCC1', '\uD83D\uDCCA', '\uD83C\uDFB5', '\uD83D\uDCF1', '\u2615',
		'\uD83D\uDE80', '\uD83D\uDCA1', '\uD83D\uDD25', '\u2B50', '\uD83C\uDF1F',
		'\uD83D\uDDE3\uFE0F', '\uD83D\uDCDA', '\uD83C\uDFE0', '\uD83C\uDF0D', '\uD83E\uDDE9',
		'\uD83C\uDFA8', '\uD83D\uDEA9', '\u26A1', '\uD83D\uDD2C', '\uD83E\uDDEA',
	];

	let customInput = $state('');

	function selectEmoji(emoji: string) {
		onSelect(emoji);
		onClose();
	}

	function handleCustomSubmit() {
		const trimmed = customInput.trim();
		if (trimmed) {
			selectEmoji(trimmed);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute z-50 bg-surface-700 border border-surface-500 rounded-lg shadow-xl p-2 w-[210px]"
	onclick={(e) => e.stopPropagation()}
>
	<div class="grid grid-cols-6 gap-1 mb-2">
		{#each curated as emoji}
			<button
				class="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-600 cursor-pointer text-base transition-colors"
				onclick={() => selectEmoji(emoji)}
			>
				{emoji}
			</button>
		{/each}
	</div>

	<div class="flex gap-1 border-t border-surface-600 pt-2">
		<input
			type="text"
			bind:value={customInput}
			placeholder="Custom..."
			class="flex-1 bg-surface-800 text-surface-100 text-xs px-2 py-1 rounded outline-none border border-surface-600 focus:border-hecate-500/50 placeholder:text-surface-500"
			onkeydown={(e) => {
				if (e.key === 'Enter') handleCustomSubmit();
			}}
		/>
		<button
			class="px-2 py-1 text-xs bg-hecate-600 hover:bg-hecate-500 text-white rounded cursor-pointer"
			onclick={handleCustomSubmit}
		>
			OK
		</button>
	</div>
</div>

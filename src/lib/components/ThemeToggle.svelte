<script lang="ts">
	import { theme } from '$lib/stores/theme.js';
</script>

<button
	onclick={() => theme.toggle()}
	class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
		text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors"
	title="Switch theme ({$theme === 'vivid' ? 'Vivid' : 'Subtle'})"
>
	{$theme === 'vivid' ? 'Vivid' : 'Subtle'}
</button>

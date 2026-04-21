<script lang="ts">
	// Legacy deep-link — /briefcase is now the unified briefcase view
	// (the tab-split was retired as part of the presence/privacy refactor).
	// Kept as a redirect so older links keep working.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/briefcase', { replaceState: true });
	});
</script>

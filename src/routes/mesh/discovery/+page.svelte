<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	// Discovery is now integrated into the main mesh page
	onMount(() => { goto('/mesh'); });
</script>

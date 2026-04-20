<script lang="ts">
	import { isTauri } from '$lib/tauri';
	let showDrag = $state(false);
	if (typeof window !== 'undefined') {
		showDrag = isTauri();
	}
</script>

<!-- Thin drag region for zen mode — 4px, just enough to grab the window in Tauri. -->
<div
	class="shrink-0 bg-surface-900"
	class:tauri-drag={showDrag}
	style="height: 4px;"
></div>

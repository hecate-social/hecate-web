<script lang="ts">
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ path: '/mesh', label: 'Status' },
		{ path: '/mesh/discovery', label: 'Discovery' },
	];

	function isActive(tabPath: string, currentPath: string): boolean {
		if (tabPath === '/mesh') return currentPath === '/mesh';
		return currentPath.startsWith(tabPath);
	}
</script>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header -->
	<div class="border-b border-surface-600 bg-surface-800/50 px-6 py-4 shrink-0">
		<div class="flex items-center gap-3 mb-3">
			<span class="text-xl">{'\uD83C\uDF10'}</span>
			<h1 class="text-sm font-semibold text-surface-100">Mesh</h1>
		</div>
		<!-- Sub-tabs -->
		<div class="flex gap-1 overflow-x-auto">
			{#each tabs as tab}
				<a
					href={tab.path}
					class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap
						{isActive(tab.path, $page.url.pathname)
							? 'bg-accent-600/20 text-accent-400'
							: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
				>
					{tab.label}
				</a>
			{/each}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto">
		{@render children()}
	</div>
</div>

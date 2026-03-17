<script lang="ts">
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ path: '/observer', label: 'System' },
		{ path: '/observer/processes', label: 'Processes' },
		{ path: '/observer/ets', label: 'ETS' },
		{ path: '/observer/supervision', label: 'Supervision' },
		{ path: '/observer/plugins', label: 'Plugins' },
		{ path: '/observer/stores', label: 'Stores' },
		{ path: '/observer/subscriptions', label: 'Subscriptions' },
	];

	function isActive(tabPath: string, currentPath: string): boolean {
		if (tabPath === '/observer') return currentPath === '/observer';
		return currentPath.startsWith(tabPath);
	}
</script>

<div class="flex flex-col h-full overflow-hidden">
	<!-- Header -->
	<div class="border-b border-surface-600 bg-surface-800/50 px-6 py-4 shrink-0">
		<div class="flex items-center gap-3 mb-3">
			<span class="text-xl">{'\uD83D\uDD2C'}</span>
			<h1 class="text-sm font-semibold text-surface-100">Observer</h1>
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

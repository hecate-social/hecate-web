<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { toggleGroupCollapsed, type SidebarGroup } from '$lib/stores/sidebar.js';

	let {
		group,
		ontoggle,
		children
	}: {
		group: SidebarGroup;
		ontoggle?: () => void;
		children: Snippet;
	} = $props();

	function toggle() {
		if (ontoggle) {
			ontoggle();
		} else {
			toggleGroupCollapsed(group.id);
		}
	}
</script>

<section class="w-full">
	<button
		class="flex items-center gap-2 w-full px-2 py-2 text-left cursor-pointer select-none
			text-surface-300 hover:text-surface-100 hover:bg-surface-800/60
			transition-colors duration-150 rounded-lg"
		onclick={toggle}
	>
		<span class="text-base leading-none">{group.icon || '\uD83D\uDCC1'}</span>
		<span class="text-xs font-semibold uppercase tracking-wider flex-1">{group.name}</span>
		<span class="text-[10px] text-surface-500 tabular-nums">
			{group.appIds.length}
		</span>
		<span
			class="text-[10px] text-surface-500 transition-transform duration-200
				{group.collapsed ? '' : 'rotate-90'}"
		>
			{'\u25B6'}
		</span>
	</button>

	{#if !group.collapsed}
		<div transition:slide={{ duration: 200 }} class="pb-3">
			{@render children()}
		</div>
	{/if}
</section>

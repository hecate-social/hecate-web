<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchSubscriptions, type SubscriptionGroup } from '$lib/stores/observer';

	let groups = $state<SubscriptionGroup[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function refresh() {
		try {
			const data = await fetchSubscriptions();
			groups = data.items;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	onMount(refresh);
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-surface-100">Subscriptions & PG Groups</h2>
			<span class="text-xs text-surface-500">{groups.length} groups</span>
		</div>
		<button onclick={refresh} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">Refresh</button>
	</div>

	{#if loading}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else if groups.length === 0}
		<div class="text-center text-surface-500 py-10 text-sm">No active subscriptions</div>
	{:else}
		<div class="space-y-3">
			{#each groups as group}
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-4">
					<div class="flex items-center justify-between mb-3">
						<span class="text-xs font-semibold font-mono text-accent-400">{group.group}</span>
						<span class="text-[10px] text-surface-500">{group.member_count} members</span>
					</div>
					<div class="space-y-1">
						{#each group.members as member}
							<div class="flex items-center gap-3 text-xs">
								<span class="inline-block w-1.5 h-1.5 rounded-full {member.alive ? 'bg-success-400' : 'bg-danger-400'}"></span>
								<span class="font-mono text-surface-300">{member.pid}</span>
								{#if member.registered_name}
									<span class="text-surface-200">{member.registered_name}</span>
								{/if}
								{#if member.initial_call}
									<span class="text-surface-500 font-mono">{member.initial_call}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

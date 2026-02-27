<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import {
		settings,
		fetchSettings,
		initiateRealmJoin,
		checkRealmJoinStatus,
		cancelRealmJoin,
		leaveRealm,
		type RealmJoinSession
	} from '$lib/stores/settings';

	type JoinStep = 'idle' | 'initiating' | 'waiting' | 'success' | 'error';

	let joinStep: JoinStep = $state('idle');
	let session: RealmJoinSession | null = $state(null);
	let errorMessage: string = $state('');
	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
	let leavingId: string | null = $state(null);

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function closeWebview() {
		try {
			await invoke('close_webview', { label: 'joining' });
		} catch {
			// already closed
		}
	}

	async function handleJoin() {
		joinStep = 'initiating';
		errorMessage = '';
		try {
			session = await initiateRealmJoin();
			joinStep = 'waiting';

			await invoke('open_webview', {
				label: 'joining',
				url: session.joining_url,
				title: 'Join Realm \u2014 Hecate',
				width: 800,
				height: 700
			});

			pollTimer = setInterval(async () => {
				try {
					const result = await checkRealmJoinStatus();
					if (result.status === 'joined') {
						stopPolling();
						joinStep = 'success';
						await closeWebview();
						await fetchSettings();
					} else if (result.status === 'failed') {
						stopPolling();
						await closeWebview();
						joinStep = 'error';
						errorMessage = 'Join session expired or failed. Please try again.';
					}
				} catch {
					// poll failure — keep trying
				}
			}, 3000);
		} catch (e) {
			joinStep = 'error';
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function handleCancel() {
		stopPolling();
		await cancelRealmJoin();
		await closeWebview();
		session = null;
		joinStep = 'idle';
	}

	async function handleLeave(membershipId: string) {
		leavingId = membershipId;
		await leaveRealm(membershipId);
		leavingId = null;
	}

	function handleRetry() {
		joinStep = 'idle';
		errorMessage = '';
		session = null;
	}

	function formatTimestamp(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
	<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Realms</h2>

	<!-- Active memberships -->
	{#if $settings?.realms && $settings.realms.length > 0}
		<div class="space-y-3">
			{#each $settings.realms as realm}
				<div class="flex items-center gap-3 p-3 rounded-lg bg-surface-700/50 border border-surface-600">
					<div class="flex-1 space-y-1">
						<div class="flex items-center gap-2">
							<span class="text-[10px] px-2 py-0.5 rounded-full bg-success-500/20 text-success-400 border border-success-500/30">
								{realm.realm_id}
							</span>
							<span class="text-[10px] text-surface-500">
								via {realm.oauth_provider}
							</span>
						</div>
						<div class="flex items-center gap-2 text-xs text-surface-300">
							<span>{realm.oauth_account}</span>
							<span class="text-surface-600">|</span>
							<span class="text-surface-500">Joined {formatTimestamp(realm.confirmed_at)}</span>
						</div>
					</div>
					<button
						onclick={() => handleLeave(realm.membership_id)}
						disabled={leavingId === realm.membership_id}
						class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
							bg-surface-700 text-surface-300 hover:bg-danger-500/20 hover:text-danger-400 border border-surface-600
							disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{leavingId === realm.membership_id ? '...' : 'Leave'}
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-xs text-surface-500">No realm memberships yet.</p>
	{/if}

	<!-- Join flow -->
	{#if joinStep === 'idle'}
		<button
			onclick={handleJoin}
			class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
				bg-accent-600 text-surface-50 hover:bg-accent-500"
		>
			Join a Realm
		</button>
	{:else if joinStep === 'initiating'}
		<div class="flex items-center gap-2 text-sm text-surface-400">
			<span class="animate-pulse">...</span>
			<span>Starting join session...</span>
		</div>
	{:else if joinStep === 'waiting' && session}
		<div class="space-y-3">
			<p class="text-xs text-surface-400">
				Log in via the browser window that just opened.
			</p>
			<div class="flex items-center justify-between">
				<span class="text-[10px] text-surface-500 animate-pulse">
					Waiting for login...
				</span>
				<button
					onclick={handleCancel}
					class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
						bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-600"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if joinStep === 'success'}
		<div class="flex items-center gap-2 text-sm text-success-400">
			<span>Joined successfully!</span>
		</div>
	{:else if joinStep === 'error'}
		<div class="space-y-3">
			<div class="text-xs text-danger-400">{errorMessage}</div>
			<button
				onclick={handleRetry}
				class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
					bg-accent-600 text-surface-50 hover:bg-accent-500"
			>
				Try again
			</button>
		</div>
	{/if}
</div>

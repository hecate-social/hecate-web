<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { fade } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import { isConnected } from '$lib/stores/daemon.js';
	import {
		settings,
		fetchSettings,
		initiateRealmJoin,
		checkRealmJoinStatus,
		cancelRealmJoin,
		type RealmJoinSession
	} from '$lib/stores/settings';

	type Step = 'welcome' | 'realm-url' | 'joining' | 'success';

	let step: Step = $state('welcome');
	let realmUrl: string = $state('https://macula.io');
	let session: RealmJoinSession | null = $state(null);
	let errorMessage: string = $state('');
	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
	let dismissTimer: ReturnType<typeof setTimeout> | null = $state(null);

	let visible = $derived(
		$isConnected && $settings !== null && $settings.realms.length === 0
	);

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

	async function startJoining() {
		step = 'joining';
		errorMessage = '';
		try {
			session = await initiateRealmJoin(realmUrl);

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
						await closeWebview();
						await fetchSettings();
						step = 'success';
						dismissTimer = setTimeout(() => {
							// settings store will have realms.length > 0, so visible becomes false
						}, 2500);
					} else if (result.status === 'failed') {
						stopPolling();
						await closeWebview();
						errorMessage = 'Join session expired or failed. Please try again.';
					}
				} catch {
					// poll failure — keep trying
				}
			}, 3000);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function handleCancel() {
		stopPolling();
		await cancelRealmJoin();
		await closeWebview();
		session = null;
		errorMessage = '';
		step = 'realm-url';
	}

	function handleRetry() {
		errorMessage = '';
		startJoining();
	}

	onDestroy(() => {
		stopPolling();
		if (dismissTimer) clearTimeout(dismissTimer);
	});
</script>

{#if visible}
	<div
		class="fixed inset-0 z-40 flex flex-col items-center justify-center bg-surface-950/95 backdrop-blur-sm"
		transition:fade={{ duration: 300 }}
	>
		<!-- Ambient glow -->
		<div
			class="absolute inset-0 pointer-events-none"
			style="background: radial-gradient(ellipse at center, rgba(139, 71, 255, 0.12) 0%, rgba(245, 158, 11, 0.06) 30%, transparent 60%);"
		></div>

		{#if step === 'welcome'}
			<!-- STEP 1: Welcome -->
			<div class="relative flex flex-col items-center gap-6 max-w-md px-6" transition:fade={{ duration: 200 }}>
				<!-- Hecate artwork -->
				<div class="splash-portrait">
					<img
						src="/artwork/silhouette-keybearer.jpg"
						alt="Hecate, keeper of the key"
						class="w-48 h-48 object-cover rounded-full"
						style="mask-image: radial-gradient(circle, black 50%, transparent 80%); -webkit-mask-image: radial-gradient(circle, black 50%, transparent 80%);"
					/>
				</div>

				<!-- Headline -->
				<h1
					class="text-3xl font-bold tracking-wide"
					style="background: linear-gradient(135deg, #fbbf24, #f59e0b, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
				>
					Welcome to Hecate
				</h1>

				<p class="text-sm text-surface-300 text-center leading-relaxed">
					Your node needs to join a <span class="text-amber-400 font-medium">Realm</span> to
					connect to the mesh and unlock its full capabilities.
				</p>

				<!-- What joining gives you -->
				<div class="grid grid-cols-3 gap-4 w-full mt-2">
					<div class="flex flex-col items-center gap-2 text-center">
						<div class="w-10 h-10 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
							<span class="text-purple-400 text-base">{'\u{1F511}'}</span>
						</div>
						<span class="text-[11px] text-surface-400 font-medium">Identity</span>
						<span class="text-[10px] text-surface-500 leading-tight">Cryptographic keys tied to your account</span>
					</div>
					<div class="flex flex-col items-center gap-2 text-center">
						<div class="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
							<span class="text-amber-400 text-base">{'\u{1F6E1}'}</span>
						</div>
						<span class="text-[11px] text-surface-400 font-medium">Trust</span>
						<span class="text-[10px] text-surface-500 leading-tight">Realm-verified membership for peer auth</span>
					</div>
					<div class="flex flex-col items-center gap-2 text-center">
						<div class="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
							<span class="text-emerald-400 text-base">{'\u{1F310}'}</span>
						</div>
						<span class="text-[11px] text-surface-400 font-medium">Connectivity</span>
						<span class="text-[10px] text-surface-500 leading-tight">Join the mesh and discover peers</span>
					</div>
				</div>

				<!-- CTA -->
				<button
					onclick={() => { step = 'realm-url'; }}
					class="mt-4 px-8 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer
						bg-gradient-to-r from-amber-500 to-purple-600 text-white
						hover:from-amber-400 hover:to-purple-500
						shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
				>
					Join a Realm
				</button>

				<p class="text-[10px] text-surface-600 italic mt-1">
					She who holds the key, lights the way.
				</p>
			</div>

		{:else if step === 'realm-url'}
			<!-- STEP 1.5: Realm URL -->
			<div class="relative flex flex-col items-center gap-5 max-w-sm px-6" transition:fade={{ duration: 200 }}>
				<h2
					class="text-xl font-bold tracking-wide"
					style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
				>
					Choose a Realm
				</h2>

				<p class="text-xs text-surface-400 text-center leading-relaxed">
					Enter the URL of the realm you want to join. Most users should use the default.
				</p>

				<div class="w-full space-y-3">
					<label class="block">
						<span class="text-[10px] text-surface-500 uppercase tracking-wider font-medium">Realm URL</span>
						<input
							type="url"
							bind:value={realmUrl}
							placeholder="https://macula.io"
							class="mt-1 w-full px-3 py-2.5 rounded-lg text-sm
								bg-surface-800 border border-surface-600 text-surface-100
								placeholder:text-surface-600
								focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30
								transition-colors"
						/>
					</label>
				</div>

				<div class="flex gap-3 w-full">
					<button
						onclick={() => { step = 'welcome'; }}
						class="flex-1 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
							bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-600"
					>
						Back
					</button>
					<button
						onclick={startJoining}
						disabled={!realmUrl.trim()}
						class="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer
							bg-gradient-to-r from-amber-500 to-purple-600 text-white
							hover:from-amber-400 hover:to-purple-500
							disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Join
					</button>
				</div>
			</div>

		{:else if step === 'joining'}
			<!-- STEP 2: Joining -->
			<div class="relative flex flex-col items-center gap-6 max-w-sm px-6" transition:fade={{ duration: 200 }}>
				<h2
					class="text-xl font-bold tracking-wide"
					style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
				>
					Joining Realm
				</h2>

				{#if errorMessage}
					<!-- Error state -->
					<div class="flex flex-col items-center gap-4 w-full">
						<div class="w-14 h-14 rounded-full bg-danger-500/15 border border-danger-500/30 flex items-center justify-center">
							<span class="text-danger-400 text-2xl">{'\u{2717}'}</span>
						</div>
						<p class="text-xs text-danger-400 text-center">{errorMessage}</p>
						<div class="flex gap-3">
							<button
								onclick={handleCancel}
								class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
									bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-600"
							>
								Back
							</button>
							<button
								onclick={handleRetry}
								class="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
									bg-accent-600 text-surface-50 hover:bg-accent-500"
							>
								Try again
							</button>
						</div>
					</div>
				{:else if session}
					<!-- Waiting for login -->
					<p class="text-xs text-surface-400 text-center">
						A browser window has opened. Log in to join the realm.
					</p>

					<!-- Waiting indicator -->
					<div class="flex flex-col items-center gap-3 mt-4">
						<div class="flex items-center gap-2">
							<span class="text-amber-400 animate-pulse text-sm">{'\u{25CF}'}</span>
							<span class="text-surface-400 text-xs">Waiting for login...</span>
						</div>

						<!-- Shimmer bar -->
						<div class="w-48 h-0.5 bg-surface-800 rounded-full overflow-hidden">
							<div class="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-amber-500 animate-shimmer rounded-full"></div>
						</div>
					</div>

					<button
						onclick={handleCancel}
						class="mt-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
							bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-600"
					>
						Cancel
					</button>
				{:else}
					<!-- Initiating (brief loading state) -->
					<div class="flex items-center gap-2 text-sm text-surface-400">
						<span class="animate-pulse">...</span>
						<span>Starting join session...</span>
					</div>
				{/if}
			</div>

		{:else if step === 'success'}
			<!-- STEP 3: Success -->
			<div class="relative flex flex-col items-center gap-5" transition:fade={{ duration: 200 }}>
				<!-- Green checkmark with glow -->
				<div class="success-glow w-20 h-20 rounded-full bg-success-500/15 border-2 border-success-500/40 flex items-center justify-center">
					<span class="text-success-400 text-4xl">{'\u{2713}'}</span>
				</div>

				<h2 class="text-xl font-bold text-surface-100">
					{#if $settings?.realms?.[0]?.oauth_account}
						Joined as {$settings.realms[0].oauth_account}
					{:else}
						Joined successfully
					{/if}
				</h2>

				{#if $settings?.realms?.[0]?.realm_id}
					<span
						class="text-[10px] px-3 py-1 rounded-full bg-success-500/15 text-success-400 border border-success-500/25"
					>
						{$settings.realms[0].realm_id} via {$settings.realms[0].oauth_provider}
					</span>
				{/if}

				<p class="text-sm text-surface-400">Your node is now part of the mesh.</p>

				<!-- Shimmer bar (brief) -->
				<div class="w-32 h-0.5 bg-surface-800 rounded-full overflow-hidden">
					<div class="h-full bg-gradient-to-r from-emerald-500 via-success-400 to-emerald-500 animate-shimmer rounded-full"></div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(200%); }
	}
	.animate-shimmer {
		width: 40%;
		animation: shimmer 1.5s ease-in-out infinite;
	}
	@keyframes portrait-glow {
		0%, 100% { filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.3)); }
		50% { filter: drop-shadow(0 0 24px rgba(168, 117, 255, 0.4)); }
	}
	.splash-portrait {
		animation: portrait-glow 3s ease-in-out infinite;
	}
	@keyframes success-pulse {
		0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.2); }
		50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.35); }
	}
	.success-glow {
		animation: success-pulse 1.5s ease-in-out infinite;
	}
</style>

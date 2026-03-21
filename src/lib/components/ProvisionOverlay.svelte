<script lang="ts">
	import { post } from '$lib/api';
	import Terminal from './Terminal.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import { fetchLanNodes } from '$lib/stores/lan';
	import { fetchSite } from '$lib/stores/site';

	interface Props {
		machine: {
			ip: string;
			hostname: string;
			mac: string;
			ssh: boolean;
			hecate: { running: boolean };
		};
		onClose: () => void;
	}

	let { machine, onClose }: Props = $props();

	type Phase = 'generate' | 'ready' | 'running' | 'done' | 'error';
	let phase: Phase = $state('generate');
	let displayCode = $state('');
	let joinToken = $state('');
	let expiresIn = $state(0);
	let sshUser = $state('rl');
	let errorMsg = $state('');
	let exitCode = $state<number | null>(null);

	$effect(() => {
		if (phase === 'generate') generateToken();
	});

	async function generateToken() {
		try {
			const data = await post<{
				ok: boolean;
				display_code: string;
				token: string;
				expires_in: number;
			}>('/api/site/join-code', {});
			displayCode = data.display_code;
			joinToken = data.token;
			expiresIn = data.expires_in;
			phase = 'ready';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			phase = 'error';
		}
	}

	function startProvisioning() {
		phase = 'running';
	}

	function onProcessExit(code: number) {
		exitCode = code;
		if (code === 0) {
			toastSuccess(`Hecate installed on ${machine.hostname}`);
			setTimeout(() => {
				fetchLanNodes();
				fetchSite();
			}, 3000);
		}
	}

	function advanceFromTerminal() {
		phase = (exitCode === 0 || exitCode === null) ? 'done' : 'error';
	}

	// Install command: uses the self-contained token (no callback needed)
	let installCommand = $derived(
		`curl -fsSL https://raw.githubusercontent.com/hecate-social/hecate-install/main/install.sh | bash -s -- --join-token ${joinToken}`
	);

	let sshArgs = $derived([
		'-o', 'StrictHostKeyChecking=no',
		'-o', 'UserKnownHostsFile=/dev/null',
		`${sshUser}@${machine.ip}`,
		installCommand
	]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="bg-surface-900 border border-surface-700 rounded-lg shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden">

		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
			<div class="flex items-center gap-3">
				<span class="text-lg">
					{machine.hecate.running ? '\u2705' : machine.ssh ? '\uD83D\uDD27' : '\u26AA'}
				</span>
				<div>
					<div class="text-sm font-semibold text-surface-100">{machine.hostname}</div>
					<div class="text-xs text-surface-500 font-mono">{machine.ip} &middot; {machine.mac}</div>
				</div>
			</div>
			<button
				class="text-surface-500 hover:text-surface-200 text-lg px-2 cursor-pointer"
				onclick={onClose}
			>&times;</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-y-auto">
			{#if phase === 'generate'}
				<div class="p-6 text-center text-surface-400 text-sm animate-pulse">
					Generating join token...
				</div>

			{:else if phase === 'ready'}
				<div class="p-6 space-y-5">
					<!-- Display code -->
					<div class="text-center space-y-2">
						<div class="text-xs text-surface-500 uppercase tracking-wider">Verification Code</div>
						<div class="text-3xl font-mono font-bold text-hecate-400 tracking-[0.3em]">{displayCode}</div>
						<div class="text-xs text-surface-600">Expires in {expiresIn}s &middot; self-contained token &middot; no callback</div>
					</div>

					<!-- SSH user -->
					<div class="space-y-2">
						<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-user">SSH User</label>
						<input
							id="ssh-user"
							type="text"
							bind:value={sshUser}
							class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
							placeholder="rl"
						/>
					</div>

					<!-- Command preview -->
					<div class="space-y-1">
						<div class="text-xs text-surface-500 uppercase tracking-wider">Will execute on {machine.hostname}</div>
						<div class="bg-surface-800 rounded p-3 text-xs font-mono text-surface-300 break-all select-all max-h-20 overflow-y-auto">
							{installCommand}
						</div>
						<div class="text-xs text-surface-600">Token is self-contained — no network call back to this machine</div>
					</div>

					<button
						class="w-full py-2.5 bg-hecate-600 hover:bg-hecate-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
						onclick={startProvisioning}
					>
						Connect &amp; Install
					</button>
				</div>

			{:else if phase === 'running'}
				<div class="h-[400px]">
					<Terminal
						command="ssh"
						args={sshArgs}
						onExit={onProcessExit}
					/>
				</div>
				{#if exitCode !== null}
					<div class="px-4 py-2 border-t border-surface-700 flex items-center justify-between">
						<span class="text-xs {exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}">
							{exitCode === 0 ? 'Completed successfully' : `Exited with code ${exitCode}`}
						</span>
						<button
							class="px-4 py-1.5 bg-hecate-600 hover:bg-hecate-500 text-white text-sm rounded transition-colors cursor-pointer"
							onclick={advanceFromTerminal}
						>{exitCode === 0 ? 'Continue' : 'Close'}</button>
					</div>
				{/if}

			{:else if phase === 'done'}
				<div class="p-6 text-center space-y-4">
					<div class="text-4xl">{'\u2705'}</div>
					<div class="text-lg font-semibold text-emerald-400">Installed!</div>
					<div class="text-sm text-surface-400">
						Hecate is now running on {machine.hostname}.
					</div>
					<button
						class="px-6 py-2 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm rounded transition-colors cursor-pointer"
						onclick={onClose}
					>Close</button>
				</div>

			{:else if phase === 'error'}
				<div class="p-6 text-center space-y-4">
					<div class="text-4xl">{'\u274C'}</div>
					<div class="text-lg font-semibold text-red-400">
						{exitCode !== null ? `Process exited with code ${exitCode}` : 'Error'}
					</div>
					{#if errorMsg}
						<div class="text-sm text-surface-400">{errorMsg}</div>
					{/if}
					<div class="flex gap-3 justify-center">
						<button
							class="px-6 py-2 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm rounded transition-colors cursor-pointer"
							onclick={() => { phase = 'generate'; errorMsg = ''; exitCode = null; }}
						>Retry</button>
						<button
							class="px-6 py-2 bg-surface-800 hover:bg-surface-700 text-surface-400 text-sm rounded transition-colors cursor-pointer"
							onclick={onClose}
						>Close</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

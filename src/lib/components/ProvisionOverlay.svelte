<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { post } from '$lib/api';
	import { toastSuccess } from '$lib/stores/toasts';
	import { fetchLanNodes } from '$lib/stores/lan';
	import { fetchSite } from '$lib/stores/site';
	import { Terminal } from 'xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import 'xterm/css/xterm.css';
	import { Command } from '@tauri-apps/plugin-shell';

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
	let sshUser = $state('');
	let sshPassword = $state('');
	let errorMsg = $state('');
	let copied = $state(false);
	let exitCode = $state<number | null>(null);

	let terminalEl: HTMLDivElement | undefined = $state();
	let term: Terminal | undefined;
	let fitAddon: FitAddon | undefined;
	let childProcess: Awaited<ReturnType<typeof Command.prototype.spawn>> | undefined;

	$effect(() => {
		if (phase === 'generate') generateToken();
	});

	async function generateToken() {
		try {
			const data = await post<{
				ok: boolean; display_code: string; token: string; expires_in: number;
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

	let installCommand = $derived(
		`curl -fsSL https://raw.githubusercontent.com/hecate-social/hecate-install/main/install.sh | bash -s -- --join-token ${joinToken}`
	);

	let fullSshCommand = $derived(
		sshPassword
			? `sshpass -p '${sshPassword}' ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR ${sshUser}@${machine.ip} '${installCommand.replace(/'/g, "'\\''")}'`
			: `ssh -o StrictHostKeyChecking=no ${sshUser}@${machine.ip} '${installCommand.replace(/'/g, "'\\''")}'`
	);

	async function startInstall() {
		if (!sshUser) { errorMsg = 'SSH user required'; return; }
		phase = 'running';

		// Wait for terminal element to mount and have dimensions
		await new Promise(r => setTimeout(r, 200));
		if (!terminalEl) return;

		term = new Terminal({
			theme: { background: '#1a1a2e', foreground: '#e0e0e0', cursor: '#f59e0b' },
			fontSize: 13,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			cursorBlink: true,
			convertEol: true,
			rows: 25,
			cols: 100,
		});

		fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(terminalEl);

		// Fit after a brief delay to ensure container has layout
		await new Promise(r => setTimeout(r, 50));
		fitAddon.fit();

		term.writeln('\x1b[90m$ ' + fullSshCommand.substring(0, 80) + '...\x1b[0m');

		// Spawn via Tauri — use 'bash' with -c
		try {
			const cmd = Command.create('bash', ['-c', fullSshCommand]);

			// Wire stdout → terminal
			cmd.stdout.on('data', (line: string) => {
				console.log('[provision] stdout:', line);
				term?.writeln(line);
			});

			// Wire stderr → terminal
			cmd.stderr.on('data', (line: string) => {
				console.log('[provision] stderr:', line);
				term?.writeln(line);
			});

			cmd.on('close', (data: { code: number }) => {
				console.log('[provision] exit:', data.code);
				exitCode = data.code;
				term?.writeln('');
				term?.writeln(data.code === 0
					? '\x1b[32mInstallation complete!\x1b[0m'
					: `\x1b[31mExited with code ${data.code}\x1b[0m`);
				if (data.code === 0) {
					toastSuccess(`Hecate installed on ${machine.hostname}`);
					setTimeout(() => { fetchLanNodes(); fetchSite(); }, 3000);
				}
			});

			cmd.on('error', (error: string) => {
				console.error('[provision] error:', error);
				term?.writeln(`\x1b[31mError: ${error}\x1b[0m`);
			});

			childProcess = await cmd.spawn();
			console.log('[provision] spawned pid:', childProcess.pid);

		} catch (err) {
			console.error('[provision] spawn failed:', err);
			term.writeln(`\x1b[31mFailed to spawn: ${err}\x1b[0m`);
			errorMsg = String(err);
		}
	}

	async function copyCommand() {
		await navigator.clipboard.writeText(fullSshCommand);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	onDestroy(() => {
		childProcess?.kill().catch(() => {});
		term?.dispose();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
	onclick={(e) => { if (e.target === e.currentTarget && phase !== 'running') onClose(); }}
>
	<div class="bg-surface-900 border border-surface-700 rounded-lg shadow-2xl w-[750px] max-h-[85vh] flex flex-col overflow-hidden">

		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
			<div class="flex items-center gap-3">
				<span class="text-lg">{machine.ssh ? '\uD83D\uDD27' : '\u26AA'}</span>
				<div>
					<div class="text-sm font-semibold text-surface-100">{machine.hostname}</div>
					<div class="text-xs text-surface-500 font-mono">{machine.ip}</div>
				</div>
			</div>
			<button class="text-surface-500 hover:text-surface-200 text-lg px-2 cursor-pointer" onclick={onClose}>&times;</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-hidden flex flex-col">
			{#if phase === 'generate'}
				<div class="p-6 text-center text-surface-400 text-sm animate-pulse">Generating join token...</div>

			{:else if phase === 'ready'}
				<div class="p-6 space-y-5 overflow-y-auto">
					<div class="text-center space-y-2">
						<div class="text-xs text-surface-500 uppercase tracking-wider">Verification Code</div>
						<div class="text-3xl font-mono font-bold text-hecate-400 tracking-[0.3em]">{displayCode}</div>
						<div class="text-xs text-surface-600">Expires in {expiresIn}s</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-user">SSH User</label>
							<input id="ssh-user" type="text" bind:value={sshUser}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
								placeholder="username" />
						</div>
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-pass">Password (optional)</label>
							<input id="ssh-pass" type="password" bind:value={sshPassword}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
								placeholder="for key auth leave empty" />
						</div>
					</div>

					<div class="space-y-1">
						<div class="flex items-center justify-between">
							<span class="text-xs text-surface-500 uppercase tracking-wider">Command</span>
							<button class="text-xs text-hecate-400 hover:text-hecate-300 cursor-pointer" onclick={copyCommand}>
								{copied ? 'Copied!' : 'Copy'}
							</button>
						</div>
						<div class="bg-surface-800 rounded p-3 text-xs font-mono text-surface-300 break-all select-all max-h-20 overflow-y-auto">
							{fullSshCommand}
						</div>
					</div>

					{#if errorMsg}
						<div class="text-sm text-red-400">{errorMsg}</div>
					{/if}

					<button
						class="w-full py-2.5 bg-hecate-600 hover:bg-hecate-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
						onclick={startInstall}
					>Install</button>
				</div>

			{:else if phase === 'running'}
				<div bind:this={terminalEl} class="flex-1 min-h-[400px]" style="background: #1a1a2e;"></div>
				{#if exitCode !== null}
					<div class="px-4 py-2 border-t border-surface-700 flex items-center justify-between shrink-0">
						<span class="text-xs {exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}">
							{exitCode === 0 ? 'Completed' : `Exited ${exitCode}`}
						</span>
						<button
							class="px-4 py-1.5 bg-hecate-600 hover:bg-hecate-500 text-white text-sm rounded transition-colors cursor-pointer"
							onclick={onClose}
						>Close</button>
					</div>
				{/if}

			{:else if phase === 'error'}
				<div class="p-6 text-center space-y-4">
					<div class="text-lg font-semibold text-red-400">Error</div>
					<div class="text-sm text-surface-400">{errorMsg}</div>
					<button class="px-6 py-2 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm rounded transition-colors cursor-pointer"
						onclick={() => { phase = 'generate'; errorMsg = ''; }}>Retry</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.xterm) { padding: 8px; }
</style>

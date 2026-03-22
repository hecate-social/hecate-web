<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { post } from '$lib/api';
	import { toastSuccess } from '$lib/stores/toasts';
	import { fetchLanNodes, triggerScan } from '$lib/stores/lan';
	import { addPendingNode } from '$lib/stores/site';
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

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	type InstallType = 'hecate-node' | 'ollama-host';
	type Phase = 'ready' | 'generate' | 'running' | 'error';

	let installType: InstallType = $state('hecate-node');
	let phase: Phase = $state('ready');
	let joinToken = $state('');
	let sshUser = $state('');
	let sshPassword = $state('');
	let nodeName = $state(`hecate@${machine.hostname}`);
	let errorMsg = $state('');
	let exitCode = $state<number | null>(null);

	let terminalEl: HTMLDivElement | undefined = $state();
	let term: Terminal | undefined;
	let fitAddon: FitAddon | undefined;
	let childProcess: Awaited<ReturnType<typeof Command.prototype.spawn>> | undefined;
	let sshUserInput: HTMLInputElement | undefined = $state();

	// Focus SSH user input on mount
	$effect(() => {
		if (phase === 'ready' && sshUserInput) {
			tick().then(() => sshUserInput?.focus());
		}
	});

	// ---------------------------------------------------------------------------
	// Token generation + install
	// ---------------------------------------------------------------------------
	async function startInstall() {
		if (!sshUser) { errorMsg = 'SSH user required'; return; }
		errorMsg = '';
		phase = 'generate';

		try {
			const data = await post<{
				ok: boolean; display_code: string; token: string; expires_in: number;
			}>('/api/site/join-code', {});
			joinToken = data.token;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			phase = 'error';
			return;
		}

		phase = 'running';
		await launchTerminal();
	}

	// ---------------------------------------------------------------------------
	// Commands
	// ---------------------------------------------------------------------------
	let installScript = $derived(
		installType === 'hecate-node'
			? 'install-hecate-node.sh'
			: 'install-hecate-node.sh' // future: separate ollama script
	);

	function buildSshCommand(token: string): string {
		const installCmd = `curl -fsSL https://raw.githubusercontent.com/hecate-social/hecate-install/main/${installScript} | bash -s -- --join-token ${token}`;
		const escaped = installCmd.replace(/'/g, "'\\''");
		return sshPassword
			? `sshpass -p '${sshPassword}' ssh -tt -o StrictHostKeyChecking=no -o LogLevel=ERROR ${sshUser}@${machine.ip} '${escaped}'`
			: `ssh -tt -o StrictHostKeyChecking=no ${sshUser}@${machine.ip} '${escaped}'`;
	}

	// ---------------------------------------------------------------------------
	// Terminal
	// ---------------------------------------------------------------------------
	async function launchTerminal() {
		await new Promise(r => setTimeout(r, 200));
		if (!terminalEl) return;

		term = new Terminal({
			theme: { background: '#1a1a2e', foreground: '#e0e0e0', cursor: '#f59e0b' },
			fontSize: 13,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			cursorBlink: true,
			convertEol: true,
			scrollback: 5000,
			rows: 25,
			cols: 100,
		});

		fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(terminalEl);

		await new Promise(r => setTimeout(r, 50));
		fitAddon.fit();

		const resizeObserver = new ResizeObserver(() => fitAddon?.fit());
		resizeObserver.observe(terminalEl);

		const fullCmd = buildSshCommand(joinToken);
		term.writeln(`\x1b[90m$ ssh ${sshUser}@${machine.ip} ...\x1b[0m`);
		term.writeln('');

		try {
			const cmd = Command.create('bash', ['-c', fullCmd]);

			cmd.stdout.on('data', (line: string) => { term?.writeln(line); });
			cmd.stderr.on('data', (line: string) => { term?.writeln(line); });

			cmd.on('close', (data: { code: number }) => {
				exitCode = data.code;
				term?.writeln('');
				term?.writeln(data.code === 0
					? '\x1b[32m=== Installation complete ===\x1b[0m'
					: `\x1b[31mExited with code ${data.code}\x1b[0m`);
				if (data.code === 0) {
					toastSuccess(`Hecate installed on ${machine.hostname}`);
					// Optimistic: show node immediately as pending
					addPendingNode(nodeName);
					// LAN needs a rescan to detect the newly running hecate.
					setTimeout(() => { triggerScan().then(() => fetchLanNodes()); }, 5000);
					// Site confirms via SSE (site_changed) — replaces pending with real entry.
				}
			});

			cmd.on('error', (error: string) => {
				term?.writeln(`\x1b[31mError: ${error}\x1b[0m`);
			});

			childProcess = await cmd.spawn();

			term.onData((data: string) => {
				childProcess?.write(data).catch(() => {});
			});

		} catch (err) {
			term.writeln(`\x1b[31mFailed to spawn: ${err}\x1b[0m`);
			errorMsg = String(err);
		}
	}

	function selectType(type: InstallType) {
		if (type === 'ollama-host') return;
		installType = type;
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

			<!-- Phase: Ready -->
			{#if phase === 'ready'}
				<div class="p-6 space-y-5">
					<!-- Install type toggle -->
					<div class="flex gap-2">
						<button
							class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all cursor-pointer
								{installType === 'hecate-node'
									? 'bg-hecate-600/20 text-hecate-300 ring-1 ring-hecate-500/40'
									: 'bg-surface-800 text-surface-500 hover:text-surface-300'}"
							onclick={() => selectType('hecate-node')}
						>Hecate Node</button>
						<button
							class="flex-1 py-2 px-3 rounded text-xs font-medium transition-all cursor-not-allowed
								bg-surface-800/50 text-surface-600 opacity-50"
							disabled
						>Ollama Host <span class="text-[10px] ml-1 opacity-70">soon</span></button>
					</div>

					<!-- Node name -->
					<div class="space-y-1">
						<label class="text-xs text-surface-500 uppercase tracking-wider" for="node-name">Node Name</label>
						<input id="node-name" type="text" bind:value={nodeName}
							class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
						/>
					</div>

					<!-- SSH credentials -->
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-user">SSH User</label>
							<input id="ssh-user" type="text" bind:value={sshUser} bind:this={sshUserInput}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
								placeholder="username"
								onkeydown={(e) => { if (e.key === 'Enter') startInstall(); }}
							/>
						</div>
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-pass">Password <span class="normal-case text-surface-600">(optional)</span></label>
							<input id="ssh-pass" type="password" bind:value={sshPassword}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-hecate-500"
								placeholder="key auth"
								onkeydown={(e) => { if (e.key === 'Enter') startInstall(); }}
							/>
						</div>
					</div>

					<div class="text-xs text-surface-600">
						May prompt for <span class="text-amber-400/70">sudo</span> — type in the terminal when asked.
					</div>

					{#if errorMsg}
						<div class="text-sm text-red-400">{errorMsg}</div>
					{/if}

					<button
						class="w-full py-2.5 bg-hecate-600 hover:bg-hecate-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
						onclick={startInstall}
					>Install</button>
				</div>

			<!-- Phase: Generating token -->
			{:else if phase === 'generate'}
				<div class="p-6 text-center text-surface-400 text-sm animate-pulse">Generating join token...</div>

			<!-- Phase: Running -->
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

			<!-- Phase: Error -->
			{:else if phase === 'error'}
				<div class="p-6 text-center space-y-4">
					<div class="text-sm text-red-400">{errorMsg}</div>
					<button class="px-6 py-2 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm rounded transition-colors cursor-pointer"
						onclick={() => { phase = 'ready'; errorMsg = ''; }}>Back</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.xterm) { padding: 8px; }
</style>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { toastSuccess } from '$lib/stores/toasts';
	import { fetchLanNodes } from '$lib/stores/lan';
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
			hecate: { running: boolean; version?: string };
		};
		onClose: () => void;
	}

	let { machine, onClose }: Props = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	type Phase = 'confirm' | 'running' | 'done' | 'error';

	let phase: Phase = $state('confirm');
	let sshUser = $state('');
	let sshPassword = $state('');
	let errorMsg = $state('');
	let exitCode = $state<number | null>(null);

	let terminalEl: HTMLDivElement | undefined = $state();
	let term: Terminal | undefined;
	let fitAddon: FitAddon | undefined;
	let childProcess: Awaited<ReturnType<typeof Command.prototype.spawn>> | undefined;
	let sshUserInput: HTMLInputElement | undefined = $state();

	// Focus SSH input on mount
	$effect(() => {
		if (phase === 'confirm' && sshUserInput) {
			tick().then(() => sshUserInput?.focus());
		}
	});

	// ---------------------------------------------------------------------------
	// Commands
	// ---------------------------------------------------------------------------
	let uninstallCommand = $derived(
		`curl -fsSL https://raw.githubusercontent.com/hecate-social/hecate-install/main/uninstall.sh | bash -s -- --force`
	);

	let fullSshCommand = $derived(
		sshPassword
			? `sshpass -p '${sshPassword}' ssh -tt -o StrictHostKeyChecking=no -o LogLevel=ERROR ${sshUser}@${machine.ip} '${uninstallCommand.replace(/'/g, "'\\''")}'`
			: `ssh -tt -o StrictHostKeyChecking=no ${sshUser}@${machine.ip} '${uninstallCommand.replace(/'/g, "'\\''")}'`
	);

	// ---------------------------------------------------------------------------
	// Uninstall execution
	// ---------------------------------------------------------------------------
	async function startUninstall() {
		if (!sshUser) { errorMsg = 'SSH user required'; return; }
		phase = 'running';

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

		term.writeln('\x1b[90m$ ssh ' + sshUser + '@' + machine.ip + ' ... uninstall.sh --force\x1b[0m');
		term.writeln('');

		try {
			const cmd = Command.create('bash', ['-c', fullSshCommand]);

			cmd.stdout.on('data', (line: string) => {
				term?.writeln(line);
			});
			cmd.stderr.on('data', (line: string) => {
				term?.writeln(line);
			});

			cmd.on('close', (data: { code: number }) => {
				exitCode = data.code;
				term?.writeln('');
				term?.writeln(data.code === 0
					? '\x1b[32m=== Uninstall complete ===\x1b[0m'
					: `\x1b[31mExited with code ${data.code}\x1b[0m`);
				if (data.code === 0) {
					toastSuccess(`Hecate removed from ${machine.hostname}`);
					// Site updates reactively via SSE (site_changed event).
					setTimeout(() => { fetchLanNodes(); }, 3000);
				}
			});

			cmd.on('error', (error: string) => {
				term?.writeln(`\x1b[31mError: ${error}\x1b[0m`);
			});

			childProcess = await cmd.spawn();

			// Wire terminal input → process stdin (for sudo prompts)
			term.onData((data: string) => {
				childProcess?.write(data).catch(() => {});
			});

		} catch (err) {
			term.writeln(`\x1b[31mFailed to spawn: ${err}\x1b[0m`);
			errorMsg = String(err);
		}
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
				<span class="text-lg text-red-400">&#x2715;</span>
				<div>
					<div class="text-sm font-semibold text-surface-100">{machine.hostname}</div>
					<div class="text-xs text-surface-500 font-mono">{machine.ip} · hecate v{machine.hecate?.version ?? '?'}</div>
				</div>
			</div>
			<button class="text-surface-500 hover:text-surface-200 text-lg px-2 cursor-pointer" onclick={onClose}>&times;</button>
		</div>

		<!-- Body -->
		<div class="flex-1 overflow-hidden flex flex-col">

			<!-- Phase: Confirm -->
			{#if phase === 'confirm'}
				<div class="p-6 space-y-5">
					<div class="bg-red-900/20 border border-red-800/40 rounded-lg p-4 space-y-2">
						<div class="text-sm font-semibold text-red-300">Uninstall Hecate</div>
						<div class="text-xs text-surface-400">
							This will stop and remove the hecate daemon, reconciler, containers, images, and all data from <span class="text-surface-200 font-mono">{machine.hostname}</span>. This action cannot be undone.
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-user-uninstall">SSH User</label>
							<input id="ssh-user-uninstall" type="text" bind:value={sshUser} bind:this={sshUserInput}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-red-500"
								placeholder="username"
								onkeydown={(e) => { if (e.key === 'Enter') startUninstall(); }}
							/>
						</div>
						<div class="space-y-1">
							<label class="text-xs text-surface-500 uppercase tracking-wider" for="ssh-pass-uninstall">Password <span class="normal-case text-surface-600">(optional)</span></label>
							<input id="ssh-pass-uninstall" type="password" bind:value={sshPassword}
								class="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-surface-100 font-mono focus:outline-none focus:border-red-500"
								placeholder="for key auth leave empty"
								onkeydown={(e) => { if (e.key === 'Enter') startUninstall(); }}
							/>
						</div>
					</div>

					<div class="bg-surface-800/50 rounded p-3 text-xs text-surface-500">
						The uninstall script may ask for <span class="text-amber-400/80">sudo</span> to remove Ollama and clean up system files. You can type into the terminal when prompted.
					</div>

					{#if errorMsg}
						<div class="text-sm text-red-400">{errorMsg}</div>
					{/if}

					<div class="flex gap-3">
						<button
							class="flex-1 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm font-medium rounded transition-colors cursor-pointer"
							onclick={onClose}
						>Cancel</button>
						<button
							class="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
							onclick={startUninstall}
						>Uninstall</button>
					</div>
				</div>

			<!-- Phase: Running -->
			{:else if phase === 'running'}
				<div bind:this={terminalEl} class="flex-1 min-h-[400px]" style="background: #1a1a2e;"></div>
				{#if exitCode !== null}
					<div class="px-4 py-2 border-t border-surface-700 flex items-center justify-between shrink-0">
						<span class="text-xs {exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}">
							{exitCode === 0 ? 'Uninstall complete' : `Exited ${exitCode}`}
						</span>
						<button
							class="px-4 py-1.5 bg-surface-700 hover:bg-surface-600 text-surface-200 text-sm rounded transition-colors cursor-pointer"
							onclick={onClose}
						>Close</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.xterm) { padding: 8px; }
</style>

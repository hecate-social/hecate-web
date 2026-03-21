<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Terminal } from 'xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import { Command } from '@tauri-apps/plugin-shell';

	interface Props {
		command: string;
		args: string[];
		onExit?: (code: number) => void;
	}

	let { command, args, onExit }: Props = $props();

	let terminalEl: HTMLDivElement | undefined = $state();
	let term: Terminal | undefined;
	let fitAddon: FitAddon | undefined;
	let childProcess: Awaited<ReturnType<typeof Command.prototype.spawn>> | undefined;
	let resizeObserver: ResizeObserver | undefined;

	onMount(async () => {
		if (!terminalEl) return;

		term = new Terminal({
			theme: {
				background: '#1a1a2e',
				foreground: '#e0e0e0',
				cursor: '#f59e0b',
			},
			fontSize: 13,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			cursorBlink: true,
			scrollback: 5000,
			convertEol: true,
		});

		fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(terminalEl);
		fitAddon.fit();

		resizeObserver = new ResizeObserver(() => fitAddon?.fit());
		resizeObserver.observe(terminalEl);

		term.write('\x1b[90mConnecting...\x1b[0m\r\n');

		await spawnProcess();
	});

	async function spawnProcess() {
		if (!term) return;

		try {
			const cmd = Command.create(command, args);

			cmd.on('close', (data) => {
				console.log('[terminal] close', data);
				term?.write(`\r\n\x1b[90m[exited ${data.code}]\x1b[0m\r\n`);
				onExit?.(data.code);
			});

			cmd.on('error', (error) => {
				console.error('[terminal] error', error);
				term?.write(`\r\n\x1b[31m${error}\x1b[0m\r\n`);
			});

			cmd.stdout.on('data', (line) => {
				console.log('[terminal] stdout:', line);
				term?.write(line + '\r\n');
			});

			cmd.stderr.on('data', (line) => {
				console.log('[terminal] stderr:', line);
				term?.write(line + '\r\n');
			});

			childProcess = await cmd.spawn();
			console.log('[terminal] spawned pid:', childProcess.pid);

		} catch (err) {
			console.error('[terminal] spawn failed:', err);
			term.write(`\x1b[31m${err}\x1b[0m\r\n`);
			onExit?.(-1);
		}
	}

	onDestroy(() => {
		childProcess?.kill();
		resizeObserver?.disconnect();
		term?.dispose();
	});
</script>

<div
	bind:this={terminalEl}
	class="w-full h-full min-h-[300px]"
	style="background: #1a1a2e;"
></div>

<style>
	:global(.xterm) {
		padding: 8px;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { health } from '$lib/stores/daemon';
	import {
		site, siteLoading, siteError, fetchSite,
		siteNodeCount, removeNode
	} from '$lib/stores/site';
	import {
		lanNodes, lanLoading, fetchLanNodes, triggerScan,
		hecateNodes, bareNodes
	} from '$lib/stores/lan';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import ProvisionOverlay from '$lib/components/ProvisionOverlay.svelte';

	// =====================================================================
	// STATE
	// =====================================================================
	type Mode = 'normal' | 'command' | 'confirm';
	let mode: Mode = $state('normal');
	let cursorIndex = $state(0);
	let statusMsg = $state('');
	let commandInput = $state('');
	let confirmPrompt = $state('');
	let confirmAction: (() => Promise<void> | void) | null = $state(null);
	let copyFeedback: string | null = $state(null);
	let provisionTarget: typeof $lanNodes[0] | null = $state(null);

	// =====================================================================
	// DATA ROWS
	// =====================================================================
	interface SiteRow {
		key: string;
		label: string;
		value: string;
		section: string;
		copyable?: boolean;
		action?: string;
	}

	let rows = $derived.by((): SiteRow[] => {
		const r: SiteRow[] = [];

		if ($site) {
			r.push({ key: 'site-id', label: 'Site ID', value: $site.site_id, section: 'SITE', copyable: true });
			r.push({ key: 'status', label: 'Status', value: $site.status_label ?? 'unknown', section: 'SITE' });
			if ($site.initiated_by) {
				r.push({ key: 'initiated-by', label: 'Initiated by', value: $site.initiated_by, section: 'SITE' });
			}
			if ($site.initiated_at) {
				r.push({ key: 'created', label: 'Created', value: formatDate($site.initiated_at), section: 'SITE' });
			}
		} else {
			r.push({ key: 'no-site', label: 'Site', value: 'initializing...', section: 'SITE' });
		}

		if ($site?.nodes && $site.nodes.length > 0) {
			for (const node of $site.nodes) {
				const isLocal = node.node_name === localNodeName();
				r.push({
					key: `node-${node.node_name}`,
					label: isLocal ? `${shortName(node.node_name)} (this)` : shortName(node.node_name),
					value: `joined ${formatDate(node.admitted_at)}`,
					section: 'NODES',
					copyable: true,
					action: isLocal ? undefined : 'x:remove',
				});
			}
		} else {
			r.push({ key: 'no-nodes', label: 'Nodes', value: 'waiting...', section: 'NODES' });
		}

		// LAN Discovery
		if ($lanNodes.length > 0) {
			for (const ln of $lanNodes) {
				const isHecate = ln.hecate?.running;
				const label = ln.hostname !== ln.ip ? ln.hostname : ln.ip;
				const status = isHecate
					? `hecate v${ln.hecate.version ?? '?'} · ${ln.hecate.status ?? 'unknown'}`
					: ln.ssh ? 'SSH available · no hecate' : 'no hecate · no SSH';
				r.push({
					key: `lan-${ln.ip}`,
					label: label,
					value: `${ln.ip} · ${ln.mac} · ${status}`,
					section: 'LAN',
					copyable: true,
					action: !isHecate && ln.ssh ? 'Enter:install' : undefined,
				});
			}
		} else if ($lanLoading) {
			r.push({ key: 'lan-scanning', label: 'LAN', value: 'scanning...', section: 'LAN' });
		} else {
			r.push({ key: 'lan-empty', label: 'LAN', value: 'no machines found · :scan to refresh', section: 'LAN' });
		}

		return r;
	});

	let selectedRow = $derived<SiteRow | null>(rows[cursorIndex] ?? null);

	let sections = $derived.by(() => {
		const map = new Map<string, SiteRow[]>();
		for (const row of rows) {
			if (!map.has(row.section)) map.set(row.section, []);
			map.get(row.section)!.push(row);
		}
		return [...map.entries()];
	});

	// =====================================================================
	// HELPERS
	// =====================================================================
	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function localNodeName(): string {
		return $health?.node_name ?? '';
	}

	function shortName(nodeName: string): string {
		return nodeName.split('@')[0] ?? nodeName;
	}

	function selfIp(): string {
		// Use hostname from node_name (e.g., "hecate_dev@host00.lab" → "host00.lab")
		// The target machine needs to reach us — hostname must resolve on LAN
		const nodeName = $health?.node_name ?? '';
		const host = nodeName.split('@')[1] ?? '';
		return host || 'localhost';
	}

	function getFullCopyValue(row: SiteRow): string {
		if (row.key.startsWith('node-')) return row.key.replace('node-', '');
		return row.value;
	}

	async function copyToClipboard(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		copyFeedback = label;
		statusMsg = `Copied ${label}`;
		setTimeout(() => { copyFeedback = null; }, 1500);
	}

	// =====================================================================
	// COMMANDS
	// =====================================================================
	interface Command {
		name: string; aliases: string[]; args: string; description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{ name: 'remove', aliases: ['rm'], args: '<node>', description: 'Remove a node from site',
			async exec(args) {
				const nodeName = args.trim();
				if (!nodeName && selectedRow?.key.startsWith('node-')) {
					const name = selectedRow.key.replace('node-', '');
					requestConfirm(`Remove node ${shortName(name)}?`, async () => {
						try {
							await removeNode(name);
							statusMsg = `Removed ${shortName(name)}`;
							toastSuccess(`Removed node ${shortName(name)}`);
						} catch (e) { statusMsg = `Failed: ${e}`; }
					});
				} else if (nodeName) {
					requestConfirm(`Remove node ${nodeName}?`, async () => {
						try {
							await removeNode(nodeName);
							statusMsg = `Removed ${nodeName}`;
							toastSuccess(`Removed node ${nodeName}`);
						} catch (e) { statusMsg = `Failed: ${e}`; }
					});
				} else {
					statusMsg = 'Usage: :remove <node-name>';
				}
			} },
		{ name: 'install', aliases: ['provision'], args: '', description: 'Install hecate on selected machine',
			exec() {
				if (!selectedRow?.key.startsWith('lan-')) { statusMsg = 'Select a LAN machine first'; return; }
				const ip = selectedRow.key.replace('lan-', '');
				const machine = $lanNodes.find((n) => n.ip === ip);
				if (!machine) { statusMsg = 'Machine not found'; return; }
				if (machine.hecate?.running) { statusMsg = 'Already running hecate'; return; }
				if (!machine.ssh) { statusMsg = 'No SSH access to this machine'; return; }
				provisionTarget = machine;
			} },
		{ name: 'scan', aliases: ['discover'], args: '', description: 'Scan LAN for machines',
			async exec() { statusMsg = 'Scanning LAN...'; await triggerScan(); statusMsg = 'Scan triggered'; } },
		{ name: 'refresh', aliases: ['r'], args: '', description: 'Refresh site + LAN',
			async exec() { statusMsg = 'Refreshing...'; await fetchSite(); await fetchLanNodes(); statusMsg = 'Refreshed'; } },
		{ name: 'copy', aliases: ['y'], args: '', description: 'Copy selected value',
			exec() {
				if (selectedRow?.copyable) copyToClipboard(getFullCopyValue(selectedRow), selectedRow.label);
				else statusMsg = 'Nothing to copy';
			} },
		{ name: 'q', aliases: ['quit', 'back'], args: '', description: 'Go back',
			exec() { history.back(); } },
		{ name: 'help', aliases: ['h', '?'], args: '', description: 'Show commands',
			exec() { statusMsg = commands.map(c => ':' + c.name).join('  '); } },
	];

	function findCommand(input: string): Command | undefined {
		return commands.find(c => c.name === input || c.aliases.includes(input));
	}

	function requestConfirm(prompt: string, action: () => Promise<void> | void) {
		confirmPrompt = prompt;
		confirmAction = action;
		mode = 'confirm';
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'confirm') { mode = 'normal'; confirmAction = null; confirmPrompt = ''; }
			else if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			return;
		}

		if (mode === 'command') return;
		if (mode === 'confirm') { handleConfirmKeys(e); return; }
		if (mode !== 'normal') return;

		// Don't handle keys when provision overlay is open
		if (provisionTarget) return;

		switch (e.key) {
			case 'j': case 'ArrowDown':
				e.preventDefault();
				cursorIndex = Math.min(cursorIndex + 1, rows.length - 1);
				scrollCursorIntoView();
				break;
			case 'k': case 'ArrowUp':
				e.preventDefault();
				cursorIndex = Math.max(cursorIndex - 1, 0);
				scrollCursorIntoView();
				break;
			case 'g':
				e.preventDefault(); cursorIndex = 0; scrollCursorIntoView(); break;
			case 'G':
				e.preventDefault(); cursorIndex = Math.max(0, rows.length - 1); scrollCursorIntoView(); break;
			case ':':
				e.preventDefault();
				mode = 'command'; commandInput = ''; statusMsg = '';
				break;
			case 'y':
				e.preventDefault();
				if (selectedRow?.copyable) copyToClipboard(getFullCopyValue(selectedRow), selectedRow.label);
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedRow?.key.startsWith('lan-')) {
					findCommand('install')?.exec('');
				}
				break;
			case 'x':
				e.preventDefault();
				if (selectedRow?.key.startsWith('node-')) {
					const name = selectedRow.key.replace('node-', '');
					if (name !== localNodeName()) {
						findCommand('remove')?.exec(name);
					}
				}
				break;
			case '?':
				e.preventDefault();
				statusMsg = 'j/k:nav  y:copy  x:remove  ::cmd  ?:help';
				break;
		}
	}

	function handleConfirmKeys(e: KeyboardEvent) {
		e.preventDefault();
		if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
			const action = confirmAction;
			mode = 'normal'; confirmAction = null; confirmPrompt = '';
			if (action) action();
		} else {
			mode = 'normal'; confirmAction = null; confirmPrompt = '';
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim();
		mode = 'normal'; commandInput = '';
		if (!raw) return;
		const spaceIdx = raw.indexOf(' ');
		const cmdName = spaceIdx >= 0 ? raw.substring(0, spaceIdx) : raw;
		const cmdArgs = spaceIdx >= 0 ? raw.substring(spaceIdx + 1) : '';
		const cmd = findCommand(cmdName);
		if (cmd) { try { await cmd.exec(cmdArgs); } catch (err) { statusMsg = `Error: ${err}`; } }
		else { statusMsg = `Unknown: ${cmdName}  (:help)`; }
	}

	function scrollCursorIntoView() {
		tick().then(() => {
			document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (statusMsg) {
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => { statusMsg = ''; }, 6000);
		}
	});

	$effect(() => { if (cursorIndex >= rows.length) cursorIndex = Math.max(0, rows.length - 1); });

	onMount(() => { fetchSite(); fetchLanNodes(); });
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-2xl mx-auto px-6 py-8 space-y-8">

			<!-- Header -->
			<div class="space-y-1">
				<div class="text-lg font-bold text-hecate-400 tracking-wide">Site</div>
				{#if $site}
					<div class="text-sm text-surface-400 font-mono">{$site.site_id}</div>
				{/if}
			</div>

			<!-- Content -->
			{#if $siteLoading && !$site}
				<div class="text-sm text-surface-500 animate-pulse py-4">Loading site info...</div>
			{:else if $siteError && !$site}
				<div class="text-sm text-red-400 py-4">{$siteError}</div>
			{:else}
				{#each sections as [sectionName, sectionRows]}
					<div class="space-y-1">
						<div class="text-xs text-surface-500 uppercase tracking-widest font-semibold pb-1 border-b border-surface-800">
							{sectionName}
						</div>
						<div class="space-y-0">
							{#each sectionRows as row}
								{@const idx = rows.indexOf(row)}
								{@const isCursor = idx === cursorIndex}
								<button
									data-cursor={isCursor ? 'true' : 'false'}
									class="w-full text-left px-3 py-2 flex items-center gap-4 rounded transition-all duration-100
										{isCursor
											? 'bg-hecate-600/20 ring-1 ring-hecate-500/40'
											: 'hover:bg-surface-800/50'}"
									onclick={() => { cursorIndex = idx; }}
								>
									<!-- Label -->
									<span class="w-32 shrink-0 text-xs uppercase tracking-wider
										{isCursor ? 'text-hecate-300' : 'text-surface-500'}"
									>{row.label}</span>

									<!-- Value -->
									<span class="flex-1 truncate font-mono text-sm
										{row.key === 'no-site' || row.key === 'no-nodes' || row.key === 'lan-empty' || row.key === 'lan-scanning'
											? 'text-surface-600 italic'
											: row.key.startsWith('lan-') && row.value.includes('hecate v')
											? (isCursor ? 'text-emerald-300' : 'text-emerald-400/80')
											: row.key.startsWith('lan-') && row.value.includes('SSH available')
											? (isCursor ? 'text-amber-300' : 'text-amber-400/70')
											: row.key.startsWith('lan-')
											? (isCursor ? 'text-surface-400' : 'text-surface-500')
											: isCursor ? 'text-surface-100' : 'text-surface-300'}"
									>{row.value}</span>

									<!-- Actions (right side) -->
									{#if copyFeedback === row.label}
										<span class="text-xs text-emerald-400 font-medium shrink-0">copied!</span>
									{:else if isCursor}
										<span class="flex items-center gap-2 shrink-0">
											{#if row.copyable}
												<span class="text-xs text-surface-600 bg-surface-800 px-1.5 py-0.5 rounded">y</span>
											{/if}
											{#if row.action}
												<span class="text-xs text-surface-600 bg-surface-800 px-1.5 py-0.5 rounded">{row.action}</span>
											{/if}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			{/if}

		</div>
	</div>

	<!-- Command bar -->
	<div class="border-t border-surface-700/50 bg-surface-850 px-4 py-1.5 shrink-0 flex items-center gap-3 text-xs min-h-[32px]">
		{#if mode === 'command'}
			<span class="text-hecate-400 font-bold">:</span>
			<input
				type="text" bind:value={commandInput}
				use:focusOnMount
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); }
					else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; }
				}}
				class="flex-1 bg-transparent border-none outline-none text-sm text-surface-100 font-mono"
				placeholder="command..."
			/>
		{:else if mode === 'confirm'}
			<span class="text-amber-400 font-medium">{confirmPrompt}</span>
			<span class="text-surface-500 text-xs">(y/N)</span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500">site</span>
				{#if selectedRow}
					<span class="text-surface-700">/</span>
					<span class="text-surface-400">{selectedRow.label}</span>
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600 font-mono">{cursorIndex + 1}/{rows.length}</span>
				<button
					class="text-surface-600 hover:text-surface-300 transition-colors cursor-pointer px-1"
					onclick={() => statusMsg = 'j/k:nav  y:copy  x:remove  ::cmd'}
				>?</button>
			{/if}
		{/if}
	</div>
</div>

{#if provisionTarget}
	<ProvisionOverlay
		machine={provisionTarget}
		onClose={() => { provisionTarget = null; }}
	/>
{/if}

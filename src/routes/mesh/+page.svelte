<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import {
		fetchMeshStatus, discoverSubscribers, connectMeshSSE,
		type MeshStatus, type MeshSubscriber, type MeshPeer, type MeshInitialEvent
	} from '$lib/stores/mesh';

	// =====================================================================
	// STATE
	// =====================================================================
	type View = 'peers' | 'status' | 'discovery';
	type Mode = 'normal' | 'command' | 'search';
	let currentView: View = $state('peers');
	let mode: Mode = $state('normal');
	let cursorIndex = $state(0);
	let statusMsg = $state('');
	let commandInput = $state('');
	let searchQuery = $state('');
	let copyFeedback: string | null = $state(null);

	// Connection state
	let sseConnected = $state(false);
	let meshConnected = $state(false);
	let selfInfo = $state<{ node_id?: string; identity?: string; realm?: string }>({});

	// Peers (real-time via SSE)
	let peers = $state<MeshPeer[]>([]);
	let peerLog = $state<{ time: number; type: 'connected' | 'disconnected'; node_id: string }[]>([]);

	// Viz: departing peers (for fade-out animation)
	let departingPeers = $state<{ node_id: string; x: number; y: number; removeAt: number }[]>([]);

	// Status (on-demand)
	let meshStatus = $state<MeshStatus | null>(null);
	let statusLoading = $state(false);

	// Discovery
	let discoveryTopic = $state('');
	let discoveryResults = $state<MeshSubscriber[]>([]);
	let discoverySearched = $state(false);
	let discovering = $state(false);

	// Cleanup
	let closeSSE: (() => void) | null = null;
	let vizFrame: number = 0;
	let sweepAngle = $state(0);
	let vizTime = $state(0);

	// Viz: selected peer in topology (highlights in list too)
	let vizHoveredPeer: string | null = $state(null);

	// =====================================================================
	// HELPERS
	// =====================================================================
	function truncateId(id: string, len = 16): string {
		if (id.length <= len) return id;
		return id.slice(0, 8) + '..' + id.slice(-6);
	}

	function timeSince(ts: number): string {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}

	async function copyToClipboard(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		copyFeedback = label;
		statusMsg = `Copied ${label}`;
		setTimeout(() => { copyFeedback = null; }, 1500);
	}

	// =====================================================================
	// TOPOLOGY LAYOUT (Canvas-based, GPU-accelerated)
	// =====================================================================
	let vizCanvas: HTMLCanvasElement | null = null;
	let vizCtx: CanvasRenderingContext2D | null = null;

	interface PeerNode {
		id: string;
		label: string;
		x: number;
		y: number;
		angle: number;
	}

	let peerNodes = $derived.by((): PeerNode[] => {
		const count = peers.length;
		if (count === 0) return [];
		const angleStep = (2 * Math.PI) / count;
		return peers.map((p, i) => {
			const a = angleStep * i - Math.PI / 2;
			return {
				id: p.node_id,
				label: truncateId(p.node_id, 10),
				x: 0.5 + Math.cos(a) * 0.35,  // normalized [0,1]
				y: 0.5 + Math.sin(a) * 0.42,
				angle: a,
			};
		});
	});

	function resizeCanvas() {
		if (!vizCanvas) return;
		const rect = vizCanvas.parentElement?.getBoundingClientRect();
		if (!rect) return;
		const dpr = window.devicePixelRatio || 1;
		vizCanvas.width = rect.width * dpr;
		vizCanvas.height = rect.height * dpr;
		vizCanvas.style.width = rect.width + 'px';
		vizCanvas.style.height = rect.height + 'px';
		vizCtx = vizCanvas.getContext('2d');
		if (vizCtx) vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function drawViz(now: number) {
		if (!vizCtx || !vizCanvas) return;
		const w = vizCanvas.clientWidth;
		const h = vizCanvas.clientHeight;
		if (!w || !h) return;
		const ctx = vizCtx;
		const cx = w / 2;
		const cy = h / 2;

		// Clear
		ctx.clearRect(0, 0, w, h);

		// Grid circles
		ctx.strokeStyle = 'rgba(var(--color-hecate-400-rgb, 139,192,128), 0.06)';
		ctx.lineWidth = 0.5;
		for (const r of [30, 60, 90, 120]) {
			const sr = r * (h / 240);
			ctx.beginPath();
			ctx.arc(cx, cy, sr, 0, Math.PI * 2);
			ctx.stroke();
		}
		// Crosshairs
		ctx.beginPath();
		ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
		ctx.moveTo(0, cy); ctx.lineTo(w, cy);
		ctx.lineWidth = 0.3;
		ctx.stroke();

		// Sweep line
		const sweepEndX = cx + Math.cos(sweepAngle) * Math.min(w, h) * 0.55;
		const sweepEndY = cy + Math.sin(sweepAngle) * Math.min(w, h) * 0.55;
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(sweepEndX, sweepEndY);
		ctx.strokeStyle = 'rgba(var(--color-hecate-400-rgb, 139,192,128), 0.15)';
		ctx.lineWidth = 1;
		ctx.stroke();

		// Connection lines to peers
		const hecateColor = getComputedStyle(vizCanvas).getPropertyValue('--color-hecate-400').trim() || '#8bc080';
		const successColor = getComputedStyle(vizCanvas).getPropertyValue('--color-success-400').trim() || '#4ade80';

		for (const node of peerNodes) {
			const nx = node.x * w;
			const ny = node.y * h;
			const isSelected = node.id === selectedPeerId || node.id === vizHoveredPeer;

			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.lineTo(nx, ny);
			ctx.strokeStyle = isSelected ? hecateColor + 'a0' : hecateColor + '33';
			ctx.lineWidth = isSelected ? 1.2 : 0.6;
			if (!isSelected) {
				ctx.setLineDash([3, 4]);
				ctx.lineDashOffset = -(now / 100) % 14;
			}
			ctx.stroke();
			ctx.setLineDash([]);

			// Data flow particles for selected
			if (isSelected) {
				const t = ((now / 1500) % 1);
				const px = cx + (nx - cx) * t;
				const py = cy + (ny - cy) * t;
				ctx.beginPath();
				ctx.arc(px, py, 1.5, 0, Math.PI * 2);
				ctx.fillStyle = hecateColor;
				ctx.fill();
				const t2 = ((now / 1500 + 0.5) % 1);
				const px2 = nx + (cx - nx) * t2;
				const py2 = ny + (cy - ny) * t2;
				ctx.beginPath();
				ctx.arc(px2, py2, 1.5, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		// Departing peers (ripple)
		for (const dp of departingPeers) {
			const elapsed = now - (dp.removeAt - 1500);
			const progress = Math.min(elapsed / 1500, 1);
			ctx.beginPath();
			ctx.arc(dp.x * w, dp.y * h, (6 + progress * 30) * (h / 240), 0, Math.PI * 2);
			ctx.strokeStyle = `rgba(248,113,113,${0.5 * (1 - progress)})`;
			ctx.lineWidth = 1 - progress;
			ctx.stroke();
		}

		// Center node glow
		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28 * (h / 240));
		grad.addColorStop(0, hecateColor + '99');
		grad.addColorStop(0.5, hecateColor + '26');
		grad.addColorStop(1, hecateColor + '00');
		ctx.fillStyle = grad;
		ctx.fillRect(cx - 30, cy - 30, 60, 60);

		// Center dot
		const pulse = 5.5 + Math.sin(now / 500) * 0.5;
		ctx.beginPath();
		ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
		ctx.fillStyle = hecateColor + '80';
		ctx.fill();
		ctx.strokeStyle = hecateColor;
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// "self" label
		ctx.fillStyle = hecateColor + 'b3';
		ctx.font = '7px monospace';
		ctx.textAlign = 'center';
		ctx.fillText('self', cx, cy + 16);

		// Peer nodes
		for (let i = 0; i < peerNodes.length; i++) {
			const node = peerNodes[i];
			const nx = node.x * w;
			const ny = node.y * h;
			const isSelected = node.id === selectedPeerId || node.id === vizHoveredPeer;
			const r = isSelected ? 5 : 4;

			// Selection ring
			if (isSelected) {
				const rr = 10 + Math.sin(now / 300) * 2;
				ctx.beginPath();
				ctx.arc(nx, ny, rr, 0, Math.PI * 2);
				ctx.strokeStyle = hecateColor + '80';
				ctx.lineWidth = 0.5;
				ctx.stroke();
			}

			// Dot
			ctx.beginPath();
			ctx.arc(nx, ny, r, 0, Math.PI * 2);
			ctx.fillStyle = isSelected ? hecateColor : successColor;
			ctx.fill();

			// Label
			ctx.fillStyle = isSelected ? hecateColor + 'e6' : 'rgba(160,170,180,0.5)';
			ctx.font = '6px monospace';
			ctx.textAlign = 'center';
			ctx.fillText(node.label, nx, ny < cy ? ny - 9 : ny + 13);
		}

		// Empty state
		if (peers.length === 0) {
			ctx.fillStyle = 'rgba(160,170,180,0.4)';
			ctx.font = '8px monospace';
			ctx.textAlign = 'center';
			ctx.fillText(meshConnected ? 'scanning for peers...' : 'mesh offline', cx, cy + 40);
		}
	}

	// =====================================================================
	// ANIMATION LOOP
	// =====================================================================
	function startVizLoop() {
		let last = performance.now();
		resizeCanvas();
		function frame(now: number) {
			const dt = (now - last) / 1000;
			last = now;
			sweepAngle = (sweepAngle + dt * 0.4) % (2 * Math.PI);
			vizTime = now;

			// Clean up departed peers
			departingPeers = departingPeers.filter(d => d.removeAt > now);

			drawViz(now);
			vizFrame = requestAnimationFrame(frame);
		}
		vizFrame = requestAnimationFrame(frame);
	}

	// =====================================================================
	// SSE CONNECTION
	// =====================================================================
	function startSSE() {
		closeSSE = connectMeshSSE((type, data) => {
			switch (type) {
				case 'open':
					sseConnected = true;
					statusMsg = 'Stream connected';
					break;
				case 'initial': {
					const init = data as MeshInitialEvent;
					meshConnected = init.connected;
					selfInfo = init.self ?? {};
					peers = (init.peers ?? []).map(p => ({
						...p,
						connected_at: p.connected_at ?? Date.now()
					}));
					statusMsg = `${peers.length} peer${peers.length !== 1 ? 's' : ''} online`;
					break;
				}
				case 'peer_connected': {
					const peer = data as MeshPeer;
					if (!peers.find(p => p.node_id === peer.node_id)) {
						peers = [...peers, { ...peer, connected_at: Date.now() }];
						peerLog = [{ time: Date.now(), type: 'connected' as const, node_id: peer.node_id }, ...peerLog].slice(0, 50);
						statusMsg = `+ ${truncateId(peer.node_id)}`;
					}
					break;
				}
				case 'peer_disconnected': {
					const peer = data as MeshPeer;
					// Capture normalized position for fade-out animation
					const existing = peerNodes.find(n => n.id === peer.node_id);
					if (existing) {
						departingPeers = [...departingPeers, {
							node_id: peer.node_id,
							x: existing.x,   // normalized [0,1]
							y: existing.y,
							removeAt: performance.now() + 1500
						}];
					}
					peers = peers.filter(p => p.node_id !== peer.node_id);
					peerLog = [{ time: Date.now(), type: 'disconnected' as const, node_id: peer.node_id }, ...peerLog].slice(0, 50);
					statusMsg = `- ${truncateId(peer.node_id)}`;
					break;
				}
				case 'error':
					sseConnected = false;
					statusMsg = 'Stream disconnected, reconnecting...';
					break;
			}
		});
	}

	// =====================================================================
	// DATA ROWS
	// =====================================================================
	interface Row {
		key: string;
		label: string;
		value: string;
		section: string;
		copyable?: boolean;
		highlight?: 'success' | 'danger' | 'dim' | 'hecate';
		peerId?: string;
	}

	let peerRows = $derived.by((): Row[] => {
		const r: Row[] = [];
		if (peers.length === 0) {
			r.push({ key: 'no-peers', label: '', value: 'No peers connected', section: 'PEERS', highlight: 'dim' });
		} else {
			for (const peer of peers) {
				r.push({
					key: `peer-${peer.node_id}`,
					label: truncateId(peer.node_id),
					value: peer.endpoint ?? 'direct',
					section: 'PEERS',
					copyable: true,
					peerId: peer.node_id,
				});
			}
		}
		if (peerLog.length > 0) {
			const visible = peerLog.slice(0, 8);
			for (const entry of visible) {
				r.push({
					key: `log-${entry.time}-${entry.node_id}`,
					label: entry.type === 'connected' ? '+' : '-',
					value: `${truncateId(entry.node_id)}  ${timeSince(entry.time)}`,
					section: 'ACTIVITY',
					highlight: entry.type === 'connected' ? 'success' : 'danger',
				});
			}
		}
		return r;
	});

	let statusRows = $derived.by((): Row[] => {
		if (!meshStatus) {
			if (statusLoading) return [{ key: 'loading', label: '', value: 'Loading...', section: 'STATUS', highlight: 'dim' }];
			return [{ key: 'empty', label: '', value: ':status to load', section: 'STATUS', highlight: 'dim' }];
		}
		const r: Row[] = [];
		r.push({
			key: 'connected', label: 'Connection',
			value: meshStatus.connected ? '\u25CF connected' : '\u25CB disconnected',
			section: 'STATUS', highlight: meshStatus.connected ? 'success' : 'danger'
		});
		r.push({ key: 'node-id', label: 'Node ID', value: meshStatus.node_id ?? '--', section: 'NODE', copyable: true });
		r.push({ key: 'realm', label: 'Realm', value: meshStatus.realm || '--', section: 'NODE' });
		r.push({ key: 'identity', label: 'Identity', value: meshStatus.identity || '--', section: 'NODE', copyable: true });
		for (const server of meshStatus.bootstrap) {
			r.push({ key: `boot-${server}`, label: 'Bootstrap', value: server, section: 'BOOTSTRAP', copyable: true });
		}
		for (const topic of meshStatus.subscriptions) {
			r.push({ key: `sub-${topic}`, label: 'Topic', value: topic, section: 'SUBSCRIPTIONS', copyable: true });
		}
		if (meshStatus.subscriptions.length === 0) {
			r.push({ key: 'no-subs', label: 'Subscriptions', value: 'none', section: 'SUBSCRIPTIONS', highlight: 'dim' });
		}
		return r;
	});

	let discoveryRows = $derived.by((): Row[] => {
		const r: Row[] = [];
		if (discoveryTopic) {
			r.push({ key: 'topic', label: 'Topic', value: discoveryTopic, section: 'QUERY', copyable: true });
		}
		if (!discoverySearched) {
			r.push({ key: 'hint', label: '', value: ':discover <topic> to search', section: 'QUERY', highlight: 'dim' });
			return r;
		}
		if (discoveryResults.length === 0) {
			r.push({ key: 'no-results', label: '', value: 'No subscribers found', section: 'RESULTS', highlight: 'dim' });
		} else {
			for (const sub of discoveryResults) {
				r.push({
					key: `sub-${sub.node_id}`,
					label: truncateId(sub.node_id),
					value: sub.endpoint,
					section: 'SUBSCRIBERS',
					copyable: true,
				});
			}
		}
		return r;
	});

	let rows = $derived(
		currentView === 'peers' ? peerRows :
		currentView === 'status' ? statusRows :
		discoveryRows
	);

	let selectedRow = $derived<Row | null>(rows[cursorIndex] ?? null);

	let sections = $derived.by(() => {
		const map = new Map<string, Row[]>();
		for (const row of rows) {
			if (!map.has(row.section)) map.set(row.section, []);
			map.get(row.section)!.push(row);
		}
		return [...map.entries()];
	});

	// =====================================================================
	// VIZ ↔ LIST INTERACTION
	// =====================================================================
	function selectPeerInList(nodeId: string) {
		if (currentView !== 'peers') return;
		const idx = rows.findIndex(r => r.peerId === nodeId);
		if (idx >= 0) { cursorIndex = idx; scrollIntoView(); }
	}

	// Determine which peer is "selected" in list (for viz highlight)
	let selectedPeerId = $derived(selectedRow?.peerId ?? null);

	// =====================================================================
	// COMMANDS
	// =====================================================================
	interface Command {
		name: string; aliases: string[]; args: string; description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{ name: 'peers', aliases: ['p'], args: '', description: 'Live peer view (default)',
			exec() { currentView = 'peers'; cursorIndex = 0; } },
		{ name: 'status', aliases: ['s'], args: '', description: 'Show full mesh status',
			async exec() {
				currentView = 'status'; cursorIndex = 0; statusLoading = true;
				try { meshStatus = await fetchMeshStatus(); }
				catch { statusMsg = 'Failed to fetch status'; }
				finally { statusLoading = false; }
			} },
		{ name: 'discover', aliases: ['d', 'find'], args: '<topic>', description: 'Discover topic subscribers',
			async exec(args) {
				if (!args.trim()) { statusMsg = 'discover: missing topic'; return; }
				discoveryTopic = args.trim();
				discovering = true; discoverySearched = false; discoveryResults = [];
				currentView = 'discovery'; cursorIndex = 0;
				statusMsg = `Discovering ${discoveryTopic}...`;
				try {
					const result = await discoverSubscribers(discoveryTopic);
					discoveryResults = result.subscribers;
					discoverySearched = true;
					statusMsg = `${result.subscribers.length} subscriber${result.subscribers.length !== 1 ? 's' : ''}`;
				} catch (e) {
					statusMsg = `Discovery failed: ${e instanceof Error ? e.message : e}`;
					discoverySearched = true;
				} finally { discovering = false; }
			} },
		{ name: 'copy', aliases: ['y'], args: '', description: 'Copy selected value',
			exec() {
				if (selectedRow?.copyable) copyToClipboard(selectedRow.value, selectedRow.label || selectedRow.key);
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

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			return;
		}
		if (mode === 'command') return;
		if (mode === 'search') { handleSearchKeys(e); return; }
		if (mode !== 'normal') return;

		switch (e.key) {
			case 'j': case 'ArrowDown':
				e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, rows.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp':
				e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, rows.length - 1); scrollIntoView(); break;
			case 'y':
				e.preventDefault();
				if (selectedRow?.copyable) copyToClipboard(selectedRow.value, selectedRow.label || selectedRow.key);
				break;
			case '1': e.preventDefault(); currentView = 'peers'; cursorIndex = 0; break;
			case '2': e.preventDefault(); currentView = 'status'; commands[1].exec(''); break;
			case '3': e.preventDefault(); currentView = 'discovery'; cursorIndex = 0; break;
			case '/':
				e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':':
				e.preventDefault(); mode = 'command'; commandInput = ''; statusMsg = ''; break;
			case '?':
				e.preventDefault();
				statusMsg = 'j/k:nav  y:copy  1/2/3:view  /:search  ::cmd  :discover <topic>';
				break;
		}
	}

	function handleSearchKeys(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; return; }
		if (e.key === 'Backspace') {
			searchQuery = searchQuery.slice(0, -1);
			if (!searchQuery) mode = 'normal';
			return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
			e.preventDefault(); searchQuery += e.key;
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

	function scrollIntoView() {
		tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' }));
	}

	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 6000); } });
	$effect(() => { if (cursorIndex >= rows.length) cursorIndex = Math.max(0, rows.length - 1); });

	// =====================================================================
	// LIFECYCLE
	// =====================================================================
	let resizeObs: ResizeObserver | null = null;

	onMount(() => {
		startSSE();
		startVizLoop();
		if (vizCanvas?.parentElement) {
			resizeObs = new ResizeObserver(() => resizeCanvas());
			resizeObs.observe(vizCanvas.parentElement);
		}
	});

	onDestroy(() => {
		if (closeSSE) closeSSE();
		if (vizFrame) cancelAnimationFrame(vizFrame);
		if (resizeObs) resizeObs.disconnect();
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-hecate-400 uppercase tracking-wider text-[10px]">Mesh</span>
		<span class="text-surface-600">&middot;</span>
		{#if sseConnected}
			<span class="text-[10px] text-success-400" title="SSE stream active">&#x25CF; live</span>
		{:else}
			<span class="text-[10px] text-amber-400 animate-pulse">&#x25CB; connecting</span>
		{/if}
		<span class="text-surface-600">&middot;</span>
		<span class="text-[10px] {meshConnected ? 'text-success-400' : 'text-danger-400'}">
			{meshConnected ? 'mesh up' : 'mesh down'}
		</span>
		{#if peers.length > 0}
			<span class="text-surface-600">&middot;</span>
			<span class="text-[10px] text-hecate-400 font-mono">{peers.length} peer{peers.length !== 1 ? 's' : ''}</span>
		{/if}
		{#if selfInfo.node_id}
			<span class="text-surface-600">&middot;</span>
			<span class="text-[9px] text-surface-500 font-mono" title={selfInfo.node_id}>{truncateId(selfInfo.node_id, 12)}</span>
		{/if}
		<div class="flex-1"></div>
		{#each [['peers', '1'], ['status', '2'], ['discovery', '3']] as [view, key]}
			<button
				class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
					{currentView === view ? 'text-hecate-400 bg-hecate-600/20' : 'text-surface-500 hover:text-surface-300'}"
				onclick={() => { currentView = view as View; cursorIndex = 0; if (view === 'status') commands[1].exec(''); }}
			><span class="text-surface-600 mr-0.5">{key}</span>{view}</button>
		{/each}
	</div>

	<!-- ================================================================= -->
	<!-- TOPOLOGY VISUALIZATION                                            -->
	<!-- ================================================================= -->
	{#if currentView === 'peers'}
		<div class="shrink-0 border-b border-surface-800 overflow-hidden relative mesh-viz-container">
			<canvas
				bind:this={vizCanvas}
				class="w-full h-full"
			></canvas>

			<!-- Corner stats overlay -->
			<div class="absolute top-2 left-3 text-[9px] font-mono text-surface-600 leading-tight pointer-events-none">
				<div>nodes: <span class="text-hecate-400/70">{peers.length + 1}</span></div>
				<div>links: <span class="text-hecate-400/70">{peers.length}</span></div>
			</div>
			{#if selfInfo.realm}
				<div class="absolute top-2 right-3 text-[9px] font-mono text-surface-600 pointer-events-none">
					{selfInfo.realm}
				</div>
			{/if}
			{#if selfInfo.identity}
				<div class="absolute bottom-2 left-3 text-[8px] font-mono text-surface-600/50 pointer-events-none truncate max-w-[60%]">
					{selfInfo.identity}
				</div>
			{/if}
		</div>
	{/if}

	<!-- ================================================================= -->
	<!-- LIST CONTENT                                                       -->
	<!-- ================================================================= -->
	<div class="flex-1 overflow-y-auto py-1">
		{#if rows.length === 0}
			<div class="px-3 py-4 text-[11px] text-surface-600">
				{#if currentView === 'peers'}
					Waiting for mesh events...
				{:else}
					No data
				{/if}
			</div>
		{:else}
			{#each sections as [sectionName, sectionRows]}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-1 first:mt-0">
					{sectionName}
					{#if sectionName === 'PEERS'}
						<span class="normal-case text-hecate-400/60">({peers.length})</span>
					{/if}
					{#if sectionName === 'ACTIVITY'}
						<span class="normal-case text-surface-600">(recent)</span>
					{/if}
					{#if sectionName === 'SUBSCRIBERS'}
						<span class="normal-case">({discoveryResults.length})</span>
					{/if}
				</div>
				{#each sectionRows as row}
					{@const idx = rows.indexOf(row)}
					{@const isCursor = idx === cursorIndex}
					{@const matchSearch = searchQuery && (
						row.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
						row.value.toLowerCase().includes(searchQuery.toLowerCase())
					)}
					<div
						data-cursor={isCursor ? 'true' : 'false'}
						class="px-2 py-0.5 text-[11px] flex items-center gap-2 transition-colors
							{isCursor
								? 'bg-hecate-600/30 text-surface-50 border-l-2 border-hecate-400'
								: 'text-surface-300 border-l-2 border-transparent'}
							{matchSearch ? 'bg-amber-500/10' : ''}"
						role="button"
						tabindex="-1"
						onclick={() => { cursorIndex = idx; }}
					>
						{#if row.section === 'PEERS' && !row.highlight}
							<span class="text-success-500 text-[8px]">&#x25CF;</span>
						{/if}
						{#if row.section === 'ACTIVITY'}
							<span class="text-[10px] {row.highlight === 'success' ? 'text-success-400' : 'text-danger-400'} w-3 text-center shrink-0">
								{row.label}
							</span>
						{:else}
							<span class="w-24 shrink-0 text-surface-500 text-right text-[10px] truncate">{row.label}</span>
						{/if}
						<span class="flex-1 truncate font-mono text-[10px]
							{row.highlight === 'success' ? 'text-success-400' :
							 row.highlight === 'danger' ? 'text-danger-400' :
							 row.highlight === 'dim' ? 'text-surface-600' :
							 row.highlight === 'hecate' ? 'text-hecate-400' :
							 ''}">{row.value}</span>
						{#if row.copyable && isCursor}
							<span class="text-[9px] text-surface-600 shrink-0">y:copy</span>
						{/if}
						{#if copyFeedback === (row.label || row.key)}
							<span class="text-[9px] text-success-400 shrink-0">copied!</span>
						{/if}
					</div>
				{/each}
			{/each}
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-hecate-400">:</span>
			<input
				type="text" bind:value={commandInput}
				use:focusOnMount
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); }
					else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; }
				}}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100"
				placeholder="Command..."
			/>
		{:else if mode === 'search'}
			<span class="text-hecate-400">/{searchQuery}<span class="animate-pulse">_</span></span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{currentView}</span>
				<span class="text-surface-700">|</span>
				{#if selectedRow}
					<span class="text-surface-400 truncate">{selectedRow.label || selectedRow.key}</span>
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				{#if discovering}
					<span class="text-amber-400 animate-pulse">discovering...</span>
					<span class="text-surface-700">|</span>
				{/if}
				<span class="text-surface-600">{cursorIndex + 1}/{rows.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer"
					onclick={() => statusMsg = 'j/k:nav  y:copy  1/2/3:view  /:search  ::cmd'}>?</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.mesh-viz-container {
		height: 42%;
		min-height: 180px;
		max-height: 320px;
		background:
			radial-gradient(ellipse at center, rgba(124, 34, 255, 0.03) 0%, transparent 70%),
			var(--color-surface-900);
	}
</style>

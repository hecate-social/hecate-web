<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import MetricsChart from '$lib/components/observer/MetricsChart.svelte';
	import {
		systemOverview, metricsHistory,
		fetchSystemOverview, startMetricsStream, stopMetricsStream,
	} from '$lib/stores/observer/system';

	let loading = $state(true);
	let cursorIndex = $state(0);
	let mode: 'normal' | 'command' = $state('normal');
	let commandInput = $state('');
	let statusMsg = $state('');

	function formatBytes(bytes: number): string {
		if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	function formatUptime(ms: number): string {
		const secs = Math.floor(ms / 1000);
		const days = Math.floor(secs / 86400);
		const hours = Math.floor((secs % 86400) / 3600);
		const mins = Math.floor((secs % 3600) / 60);
		if (days > 0) return `${days}d ${hours}h ${mins}m`;
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins}m`;
	}

	interface Row { key: string; label: string; value: string; section: string; }

	let rows = $derived.by((): Row[] => {
		const sys = $systemOverview;
		if (!sys) return [];
		const r: Row[] = [];
		r.push({ key: 'memory', label: 'Memory', value: formatBytes(sys.memory.total), section: 'OVERVIEW' });
		r.push({ key: 'procs', label: 'Processes', value: `${sys.processes.count.toLocaleString()} / ${sys.processes.limit.toLocaleString()}`, section: 'OVERVIEW' });
		r.push({ key: 'sched', label: 'Schedulers', value: `${sys.schedulers.online} / ${sys.schedulers.total}`, section: 'OVERVIEW' });
		r.push({ key: 'uptime', label: 'Uptime', value: formatUptime(sys.uptime_ms), section: 'OVERVIEW' });
		r.push({ key: 'otp', label: 'OTP', value: sys.otp_release, section: 'SYSTEM' });
		r.push({ key: 'erts', label: 'ERTS', value: sys.erts_version, section: 'SYSTEM' });
		r.push({ key: 'boot', label: 'Boot', value: sys.boot_phase, section: 'SYSTEM' });
		r.push({ key: 'atoms', label: 'Atoms', value: `${sys.atoms.count.toLocaleString()} / ${sys.atoms.limit.toLocaleString()}`, section: 'SYSTEM' });
		r.push({ key: 'ports', label: 'Ports', value: `${sys.ports.count.toLocaleString()} / ${sys.ports.limit.toLocaleString()}`, section: 'SYSTEM' });
		for (const [k, v] of Object.entries(sys.memory)) {
			if (k === 'total') continue;
			r.push({ key: `mem-${k}`, label: k, value: `${formatBytes(v)} (${((v / sys.memory.total) * 100).toFixed(1)}%)`, section: 'MEMORY' });
		}
		for (const g of sys.pg_groups) r.push({ key: `pg-${g.name}`, label: g.name, value: `${g.member_count} members`, section: 'PG GROUPS' });
		return r;
	});

	let sections = $derived.by(() => {
		const map = new Map<string, Row[]>();
		for (const row of rows) {
			if (!map.has(row.section)) map.set(row.section, []);
			map.get(row.section)!.push(row);
		}
		return [...map.entries()];
	});

	const memoryValues = $derived($metricsHistory.map(m => m.memory.total));
	const processValues = $derived($metricsHistory.map(m => m.process_count));
	const reductionValues = $derived($metricsHistory.map(m => m.reductions_delta));
	const avgSchedUtil = $derived($metricsHistory.map(m => {
		const u = m.scheduler_utilization;
		return u.length > 0 ? u.reduce((s, x) => s + x.utilization, 0) / u.length : 0;
	}));

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); if (mode === 'command') { mode = 'normal'; commandInput = ''; } return; }
		if (mode === 'command') return;
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, rows.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, rows.length - 1); scrollIntoView(); break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'j/k:nav  ::cmd  ?:help'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (!raw) return;
		if (raw === 'q' || raw === 'back') { history.back(); return; }
		if (raw === 'r' || raw === 'refresh') { await fetchSystemOverview(); statusMsg = 'Refreshed'; return; }
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	$effect(() => { if (cursorIndex >= rows.length) cursorIndex = Math.max(0, rows.length - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 6000); } });

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		await fetchSystemOverview();
		loading = false;
		pollTimer = setInterval(fetchSystemOverview, 5000);
		startMetricsStream();
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		stopMetricsStream();
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-hecate-400 uppercase tracking-wider text-[10px]">System</span>
		{#if $systemOverview}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-500">{formatBytes($systemOverview.memory.total)}</span>
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-500">{$systemOverview.processes.count} procs</span>
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-500">{formatUptime($systemOverview.uptime_ms)}</span>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto py-1 min-h-0">
		{#if loading}
			<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
		{:else}
			{#if $metricsHistory.length > 2}
				<div class="px-2 py-1 grid grid-cols-4 gap-2">
					<MetricsChart values={memoryValues} label="Memory" unit="" color="#6366f1" />
					<MetricsChart values={processValues} label="Procs" unit="" color="#22c55e" />
					<MetricsChart values={reductionValues} label="Red/2s" unit="" color="#f59e0b" />
					<MetricsChart values={avgSchedUtil} label="Sched%" unit="%" color="#ec4899" />
				</div>
			{/if}
			{#each sections as [sectionName, sectionRows]}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-1 first:mt-0">{sectionName}</div>
				{#each sectionRows as row}
					{@const idx = rows.indexOf(row)}
					<div data-cursor={idx === cursorIndex ? 'true' : 'false'}
						class="px-2 py-0.5 text-[11px] flex items-center gap-2 transition-colors
							{idx === cursorIndex ? 'bg-hecate-600/30 text-surface-50 border-l-2 border-hecate-400' : 'text-surface-300 border-l-2 border-transparent'}">
						<span class="w-20 shrink-0 text-surface-500 text-right text-[10px] capitalize">{row.label}</span>
						<span class="flex-1 truncate font-mono text-[10px]">{row.value}</span>
					</div>
				{/each}
			{/each}
		{/if}
	</div>

	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-hecate-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command..." />
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500">system</span>
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{rows.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  ::cmd'}>?</span>
			{/if}
		{/if}
	</div>
</div>

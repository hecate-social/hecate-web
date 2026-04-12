<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import { health } from '$lib/stores/daemon';
	import {
		settings, settingsLoading, settingsError, fetchSettings,
		initiateRealmJoin, checkRealmJoinStatus, cancelRealmJoin, leaveRealm,
		type RealmJoinSession
	} from '$lib/stores/settings';
	import { nodeIdentity, fetchNodeIdentity } from '$lib/stores/nodeIdentity';
	import { openWebview, closeWebview } from '$lib/tauri';
	import { toastSuccess, toastError } from '$lib/stores/toasts';

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

	// Realm join state
	let joinPollTimer: ReturnType<typeof setInterval> | null = null;

	// =====================================================================
	// DATA ROWS
	// =====================================================================
	interface SettingsRow {
		key: string;
		label: string;
		value: string;
		section: string;
		copyable?: boolean;
		action?: string; // action hint shown on cursor
	}

	let rows = $derived.by((): SettingsRow[] => {
		const r: SettingsRow[] = [];

		// Node section
		if ($nodeIdentity?.initialized) {
			r.push({ key: 'mri', label: 'MRI', value: $nodeIdentity.mri ?? '', section: 'NODE', copyable: true });
			r.push({ key: 'pubkey', label: 'Public Key', value: truncateKey($nodeIdentity.public_key ?? ''), section: 'NODE', copyable: true });
			r.push({ key: 'hostname', label: 'Hostname', value: $settings?.identity?.hostname ?? '', section: 'NODE' });
			r.push({ key: 'user', label: 'User', value: $settings?.identity?.linux_user ?? '', section: 'NODE' });
		} else {
			r.push({ key: 'node-init', label: 'Node', value: 'initializing...', section: 'NODE' });
		}

		// Realms section
		if ($settings?.realms && $settings.realms.length > 0) {
			for (const realm of $settings.realms) {
				r.push({
					key: `realm-${realm.membership_id}`,
					label: realm.realm_id,
					value: `${realm.oauth_account} via ${realm.oauth_provider} · joined ${formatDate(realm.confirmed_at)}`,
					section: 'REALMS',
					action: 'x:leave',
				});
			}
		} else {
			r.push({ key: 'no-realms', label: 'Realms', value: 'none — :join to connect', section: 'REALMS' });
		}
		r.push({ key: 'join-realm', label: '+ Join Realm', value: ':join [url]', section: 'REALMS', action: 'Enter:join' });

		// Daemon section
		if ($health) {
			r.push({ key: 'status', label: 'Status', value: $health.status, section: 'DAEMON' });
			r.push({ key: 'version', label: 'Version', value: $health.version, section: 'DAEMON' });
			r.push({ key: 'service', label: 'Service', value: $health.service, section: 'DAEMON' });
			r.push({ key: 'uptime', label: 'Uptime', value: formatUptime($health.uptime_seconds), section: 'DAEMON' });
		}

		return r;
	});

	let selectedRow = $derived<SettingsRow | null>(rows[cursorIndex] ?? null);

	// Group rows by section for display
	let sections = $derived.by(() => {
		const map = new Map<string, SettingsRow[]>();
		for (const row of rows) {
			if (!map.has(row.section)) map.set(row.section, []);
			map.get(row.section)!.push(row);
		}
		return [...map.entries()];
	});

	// =====================================================================
	// HELPERS
	// =====================================================================
	function formatUptime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}

	function truncateKey(key: string): string {
		if (key.length <= 20) return key;
		return key.slice(0, 10) + '...' + key.slice(-6);
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	async function copyToClipboard(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		copyFeedback = label;
		statusMsg = `Copied ${label}`;
		setTimeout(() => { copyFeedback = null; }, 1500);
	}

	function getFullCopyValue(row: SettingsRow): string {
		if (row.key === 'pubkey') return $nodeIdentity?.public_key ?? '';
		return row.value;
	}

	// =====================================================================
	// COMMANDS
	// =====================================================================
	interface Command {
		name: string; aliases: string[]; args: string; description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{ name: 'join', aliases: ['realm', 'connect'], args: '[url]', description: 'Join a realm',
			async exec(args) {
				const url = args.trim() || 'https://macula.io';
				statusMsg = `Joining ${url}...`;
				try {
					const session = await initiateRealmJoin(url);
					await openWebview('joining', session.joining_url, 'Join Realm \u2014 Hecate');
					statusMsg = 'Waiting for login in browser...';
					joinPollTimer = setInterval(async () => {
						try {
							const status = await checkRealmJoinStatus();
							if (status.status === 'joined') {
								stopJoinPolling();
								await closeWebview('joining');
								await fetchSettings();
								statusMsg = 'Joined realm successfully!';
								toastSuccess('Joined realm');
							} else if (status.status === 'failed') {
								stopJoinPolling();
								await closeWebview('joining');
								statusMsg = 'Join failed — try again with :join';
							}
						} catch { /* keep polling */ }
					}, 2000);
				} catch (e) {
					statusMsg = `Join failed: ${e instanceof Error ? e.message : e}`;
				}
			} },
		{ name: 'leave', aliases: [], args: '[realm-id]', description: 'Leave a realm',
			async exec(args) {
				const realmId = args.trim();
				const realm = realmId
					? $settings?.realms?.find(r => r.realm_id === realmId)
					: selectedRow?.key.startsWith('realm-')
						? $settings?.realms?.find(r => `realm-${r.membership_id}` === selectedRow?.key)
						: null;
				if (!realm) { statusMsg = 'No realm selected — use :leave <realm-id>'; return; }
				requestConfirm(`Leave realm ${realm.realm_id}?`, async () => {
					await leaveRealm(realm.membership_id);
					await fetchSettings();
					statusMsg = `Left ${realm.realm_id}`;
					toastSuccess(`Left realm ${realm.realm_id}`);
				});
			} },
		{ name: 'cancel', aliases: [], args: '', description: 'Cancel join in progress',
			async exec() { stopJoinPolling(); await cancelRealmJoin(); await closeWebview('joining'); statusMsg = 'Join cancelled'; } },
		{ name: 'copy', aliases: ['y'], args: '', description: 'Copy selected value',
			exec() {
				if (selectedRow?.copyable) copyToClipboard(getFullCopyValue(selectedRow), selectedRow.label);
				else statusMsg = 'Nothing to copy';
			} },
		{ name: 'refresh', aliases: ['r'], args: '', description: 'Refresh settings',
			async exec() { statusMsg = 'Refreshing...'; await fetchSettings(); await fetchNodeIdentity(); statusMsg = 'Refreshed'; } },
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

	function stopJoinPolling() {
		if (joinPollTimer) { clearInterval(joinPollTimer); joinPollTimer = null; }
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

		if (mode === 'command') return; // input handles keys
		if (mode === 'confirm') { handleConfirmKeys(e); return; }
		if (mode !== 'normal') return;

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
				if (selectedRow?.key === 'join-realm') {
					mode = 'command'; commandInput = 'join ';
				} else if (selectedRow?.key.startsWith('realm-')) {
					// Show realm detail in status
					const realm = $settings?.realms?.find(r => `realm-${r.membership_id}` === selectedRow?.key);
					if (realm) statusMsg = `${realm.realm_id} · ${realm.oauth_account} · x:leave`;
				}
				break;
			case 'x':
				e.preventDefault();
				if (selectedRow?.key.startsWith('realm-')) {
					const realm = $settings?.realms?.find(r => `realm-${r.membership_id}` === selectedRow?.key);
					if (realm) requestConfirm(`Leave realm ${realm.realm_id}?`, async () => {
						await leaveRealm(realm.membership_id);
						await fetchSettings();
						statusMsg = `Left ${realm.realm_id}`;
						toastSuccess(`Left realm ${realm.realm_id}`);
					});
				}
				break;
			case '?':
				e.preventDefault();
				statusMsg = 'j/k:nav  y:copy  Enter:action  x:leave  ::cmd  ?:help';
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

	// Status timer
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (statusMsg) {
			if (statusTimer) clearTimeout(statusTimer);
			statusTimer = setTimeout(() => { statusMsg = ''; }, 6000);
		}
	});

	// Clamp cursor
	$effect(() => { if (cursorIndex >= rows.length) cursorIndex = Math.max(0, rows.length - 1); });

	// =====================================================================
	// LIFECYCLE
	// =====================================================================
	onMount(() => {
		fetchSettings();
		fetchNodeIdentity();
	});

	onDestroy(() => { stopJoinPolling(); });
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">Settings</span>
		{#if $health}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] {$health.status === 'healthy' ? 'text-success-400' : 'text-warning-400'}">{$health.status}</span>
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-500">v{$health.version}</span>
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto py-1">
		{#if $settingsLoading && !$settings}
			<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading settings...</div>
		{:else if $settingsError && !$settings}
			<div class="px-3 py-4 text-[11px] text-danger-400">{$settingsError}</div>
		{:else}
			{#each sections as [sectionName, sectionRows]}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-1 first:mt-0">
					{sectionName}
				</div>
				{#each sectionRows as row}
					{@const idx = rows.indexOf(row)}
					{@const isCursor = idx === cursorIndex}
					<div
						data-cursor={isCursor ? 'true' : 'false'}
						class="px-2 py-0.5 text-[11px] flex items-center gap-2 transition-colors
							{isCursor
								? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400'
								: 'text-surface-300 border-l-2 border-transparent'}"
						role="button"
						tabindex="-1"
						onclick={() => { cursorIndex = idx; }}
					>
						<!-- Label -->
						<span class="w-24 shrink-0 text-surface-500 text-right text-[10px]">{row.label}</span>
						<!-- Value -->
						<span class="flex-1 truncate font-mono text-[10px] {
							row.key === 'status' && row.value === 'healthy' ? 'text-success-400' :
							row.key === 'join-realm' ? 'text-macula-400' :
							row.key.startsWith('realm-') ? 'text-surface-300' :
							''
						}">{row.value}</span>
						<!-- Copyable indicator -->
						{#if row.copyable && isCursor}
							<span class="text-[9px] text-surface-600 shrink-0">y:copy</span>
						{/if}
						{#if row.action && isCursor}
							<span class="text-[9px] text-surface-600 shrink-0">{row.action}</span>
						{/if}
						{#if copyFeedback === row.label}
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
			<span class="text-macula-400">:</span>
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
		{:else if mode === 'confirm'}
			<span class="text-amber-400">{confirmPrompt}</span>
			<span class="text-surface-500">(y/N)</span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">settings</span>
				<span class="text-surface-700">|</span>
				{#if selectedRow}
					<span class="text-surface-400 truncate">{selectedRow.label}</span>
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{rows.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  y:copy  Enter:action  x:leave  ::cmd'}>?</span>
			{/if}
		{/if}
	</div>
</div>

<script lang="ts">
	import { connectionStatus } from '../stores/daemon.js';
	import { hasUpdate, updateVersion, updateState, showUpdateModal } from '../stores/updater.js';
	import { settings } from '../stores/settings';
	import { toggleSidebar } from '../stores/sidebar.js';
	import { txActive, rxActive } from '../stores/traffic.js';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { getVersion } from '@tauri-apps/api/app';

	let realmId = $derived($settings?.realms?.[0]?.realm_id ?? null);

	function daemonLed(): string {
		switch ($connectionStatus) {
			case 'connected':
				return 'text-health-ok';
			case 'connecting':
				return 'text-health-loading animate-pulse';
			default:
				return 'text-health-err';
		}
	}

	async function minimize() {
		await getCurrentWindow().minimize();
	}

	async function toggleMaximize() {
		await getCurrentWindow().toggleMaximize();
	}

	async function close() {
		await getCurrentWindow().close();
	}

	let appVersion = $state('...');
	getVersion().then((v) => (appVersion = v));
</script>

<nav
	data-tauri-drag-region
	class="flex items-center bg-surface-800 border-b border-surface-600 shrink-0 select-none h-10"
>
	<!-- Sidebar toggle -->
	<button
		onclick={toggleSidebar}
		class="w-10 h-10 flex items-center justify-center text-surface-400
			hover:text-surface-100 hover:bg-surface-700 transition-colors"
		aria-label="Toggle sidebar"
	>
		<svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
			<rect y="0" width="14" height="1.5" rx="0.5" />
			<rect y="4" width="14" height="1.5" rx="0.5" />
			<rect y="8" width="14" height="1.5" rx="0.5" />
		</svg>
	</button>

	<!-- Sigil + Brand -->
	<a
		href="/"
		class="flex items-center gap-1.5 px-2 h-10 hover:bg-surface-700/50 transition-colors"
	>
		<span class="text-base">{'\u{1F525}\u{1F5DD}\u{FE0F}\u{1F525}'}</span>
		<span class="text-sm font-bold text-hecate-400">Hecate</span>
		<span class="text-[10px] text-surface-400 font-mono">v{appVersion}</span>
		<span class={daemonLed()}>{'\u{25CF}'}</span>
		<span class="flex items-center gap-px ml-1 text-[9px] font-mono leading-none select-none">
			<span class={$txActive ? 'text-amber-400' : 'text-surface-600'}>{'\u{25B2}'}</span>
			<span class={$rxActive ? 'text-emerald-400' : 'text-surface-600'}>{'\u{25BC}'}</span>
		</span>
	</a>

	<!-- Realm badge -->
	{#if realmId}
		<a
			href="/settings"
			class="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full
				bg-surface-700/60 border border-surface-600 hover:border-surface-500
				text-[10px] text-surface-400 hover:text-surface-200 transition-colors"
		>
			<svg class="size-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
			</svg>
			<span class="font-medium">{realmId}</span>
		</a>
	{/if}

	<!-- Drag region spacer -->
	<div class="flex-1" data-tauri-drag-region></div>

	<!-- App update badge -->
	{#if $updateState !== 'idle'}
		<span
			class="px-2 py-1 rounded text-[10px] font-semibold bg-hecate-600 text-white animate-pulse mr-1"
		>
			Updating...
		</span>
	{:else if $hasUpdate}
		<button
			class="px-2 py-1 rounded text-[10px] font-semibold bg-hecate-600 hover:bg-hecate-500 text-white cursor-pointer mr-1"
			onclick={() => showUpdateModal.set(true)}
		>
			Update v{$updateVersion}
		</button>
	{/if}

	<!-- Window controls -->
	<div class="flex items-center h-10">
		<button
			onclick={minimize}
			class="w-10 h-10 flex items-center justify-center text-surface-400
				hover:text-surface-100 hover:bg-surface-700 transition-colors"
			aria-label="Minimize"
		>
			<svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
				<rect width="10" height="1" />
			</svg>
		</button>
		<button
			onclick={toggleMaximize}
			class="w-10 h-10 flex items-center justify-center text-surface-400
				hover:text-surface-100 hover:bg-surface-700 transition-colors"
			aria-label="Maximize"
		>
			<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
				<rect x="0.5" y="0.5" width="9" height="9" />
			</svg>
		</button>
		<button
			onclick={close}
			class="w-10 h-10 flex items-center justify-center text-surface-400
				hover:text-surface-100 hover:bg-danger-600 transition-colors"
			aria-label="Close"
		>
			<svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.2">
				<line x1="0" y1="0" x2="10" y2="10" />
				<line x1="10" y1="0" x2="0" y2="10" />
			</svg>
		</button>
	</div>
</nav>

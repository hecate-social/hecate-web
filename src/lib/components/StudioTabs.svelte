<script lang="ts">
	import { page } from '$app/state';
	import { health, connectionStatus } from '../stores/daemon.js';
	import { studioTabs } from '$lib/studios';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { getVersion } from '@tauri-apps/api/app';
	import { hasUpdate, updateVersion, updateState, showUpdateModal } from '../stores/updater.js';

	function isActive(studioPath: string): boolean {
		const current = page.url?.pathname ?? '/';
		if (studioPath === '/') return current === '/';
		return current.startsWith(studioPath);
	}

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
	class="flex items-center bg-surface-800 border-b border-surface-600 shrink-0 select-none"
>
	<!-- Sigil + Brand -->
	<a
		href="/"
		class="flex items-center gap-1.5 px-3 h-10 hover:bg-surface-700/50 transition-colors
			{isActive('/') && page.url?.pathname === '/'
			? 'bg-surface-700'
			: ''}"
	>
		<span class="text-base">{'\u{1F525}\u{1F5DD}\u{FE0F}\u{1F525}'}</span>
		<span class="text-sm font-bold text-hecate-400">Hecate</span>
		<span class="text-[10px] text-surface-400 font-mono">
			v{appVersion}
		</span>
		<span class={daemonLed()}>{'\u{25CF}'}</span>
	</a>

	<!-- Separator -->
	<div class="w-px h-5 bg-surface-600"></div>

	<!-- Studio Tabs -->
	{#each $studioTabs as studio, i}
		<a
			href={studio.path}
			class="flex items-center gap-1.5 px-3 h-10 text-xs transition-colors border-b-2
				{isActive(studio.path)
				? 'bg-surface-700 text-surface-50 font-bold border-hecate-500'
				: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 border-transparent'}"
		>
			<span class="text-sm">{studio.icon}</span>
			<span>{studio.name}</span>
		</a>
		{#if i < $studioTabs.length - 1}
			<div class="w-px h-4 bg-surface-700"></div>
		{/if}
	{/each}

	<!-- Drag region spacer -->
	<div class="flex-1"></div>

	<!-- Update badge -->
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

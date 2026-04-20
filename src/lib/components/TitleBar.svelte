<script lang="ts">
	import { viewstate } from '../stores/daemon';
	import { hasUpdate, updateVersion, updateState, showUpdateModal } from '../stores/updater.js';
	import { txActive, rxActive } from '../stores/traffic.js';
	import { variantClass, iconChar } from '$lib/viewstate';
	import { isTauri } from '$lib/tauri';
	import { get as apiGet } from '$lib/api';

	let showWindowControls = $state(false);
	let appVersion = $state('...');

	let hdr = $derived($viewstate.header);

	async function minimize() {
		if (!isTauri()) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().minimize();
	}

	async function toggleMaximize() {
		if (!isTauri()) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().toggleMaximize();
	}

	async function close() {
		if (!isTauri()) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().close();
	}

	// Detect Tauri at mount time
	if (typeof window !== 'undefined') {
		showWindowControls = isTauri();
		if (isTauri()) {
			import('@tauri-apps/api/app').then(({ getVersion }) =>
				getVersion().then((v: string) => (appVersion = v))
			);
		} else {
			apiGet<{ version?: string }>('/api/health')
				.then((h) => { if (h.version) appVersion = h.version; })
				.catch(() => {});
		}
	}
</script>

<nav
	class="flex items-center bg-surface-800 border-b border-surface-600 shrink-0 select-none h-10"
	class:tauri-drag={showWindowControls}
>
	<!-- Sigil + Brand -->
	<a
		href="/"
		class="flex items-center gap-1.5 px-2 h-10 hover:bg-surface-700/50 transition-colors"
	>
		<img src="/macula-symbol-dark.svg" alt="" class="w-5 h-5" />
		<span class="text-base font-bold text-macula-400">Hecate</span>
		<span class="text-xs text-surface-400 font-mono">v{appVersion}</span>
		<span class={variantClass[hdr.daemon.variant]}>{iconChar[hdr.daemon.icon]}</span>
		<span class="flex items-center gap-0.5 ml-1.5 text-sm font-mono leading-none select-none">
			<span class={$txActive ? 'text-amber-400' : 'text-surface-600'}>{'\u{25B2}'}</span>
			<span class={$rxActive ? 'text-emerald-400' : 'text-surface-600'}>{'\u{25BC}'}</span>
		</span>
	</a>

	<!-- Connection status → links to /mesh -->
	<a
		href="/mesh"
		class="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full
			bg-surface-700/60 border border-surface-600 hover:border-surface-500
			text-xs text-surface-400 hover:text-surface-200 transition-colors"
		title="Mesh connection"
	>
		<span class={variantClass[hdr.mesh.variant]}>{iconChar[hdr.mesh.icon]}</span>
		<span class="font-medium">{hdr.mesh.label ?? 'Local'}</span>
		{#if hdr.mesh.sublabel}
			<span class="text-surface-500">{'\u{00B7}'} {hdr.mesh.sublabel}</span>
		{/if}
	</a>

	<!-- Realm badge -->
	{#if hdr.realm.visible}
		<a
			href="/settings"
			class="flex items-center gap-1 ml-1.5 px-2 py-0.5 rounded-full
				bg-surface-700/60 border border-surface-600 hover:border-surface-500
				text-xs text-surface-400 hover:text-surface-200 transition-colors"
		>
			<svg class="size-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
			</svg>
			<span class="font-medium">{hdr.realm.label}</span>
		</a>
	{/if}

	<!-- Drag region spacer -->
	<div class="flex-1"></div>

	<!-- App update badge -->
	{#if $updateState !== 'idle'}
		<span
			class="px-2 py-1 rounded text-xs font-semibold bg-macula-600 text-white animate-pulse mr-1"
		>
			Updating...
		</span>
	{:else if $hasUpdate}
		<button
			class="px-2 py-1 rounded text-xs font-semibold bg-macula-600 hover:bg-macula-500 text-white cursor-pointer mr-1"
			onclick={() => showUpdateModal.set(true)}
		>
			Update v{$updateVersion}
		</button>
	{/if}

	<!-- Window controls (Tauri only) -->
	{#if showWindowControls}
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
	{/if}
</nav>

<style>
	.tauri-drag {
		-webkit-app-region: drag;
	}
	.tauri-drag button, .tauri-drag a {
		-webkit-app-region: no-drag;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fileViews,
		viewLoading,
		viewError,
		loadFileViews
	} from '$lib/stores/briefcase-viewstate';
	import { uploadRealmFile } from '$lib/stores/briefcase-realm';
	import BriefcaseRow from '$lib/components/briefcase/BriefcaseRow.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import { isTauri } from '$lib/tauri';

	// Filter chips driven by viewstate `presence`.
	type Filter = 'all' | 'mine' | 'remote' | 'downloading' | 'cached';
	let filter = $state<Filter>('all');

	let dragOver = $state(false);
	let uploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	onMount(() => {
		loadFileViews();

		// Block the WebView's default "navigate to dropped file" behaviour.
		// Without this, a drop OUTSIDE our dropzone (or a drop that sneaks
		// past our zone) causes WebKit to render the file inline at the
		// bottom of the page. Must preventDefault on BOTH dragover and drop.
		const blockDefault = (e: DragEvent) => e.preventDefault();
		window.addEventListener('dragover', blockDefault);
		window.addEventListener('drop', blockDefault);

		if (!isTauri()) {
			return () => {
				window.removeEventListener('dragover', blockDefault);
				window.removeEventListener('drop', blockDefault);
			};
		}

		// WebKit2GTK doesn't reliably deliver OS-initiated drag/drop as
		// HTML5 events, so we subscribe to Tauri's native drag-drop
		// events (paths → readFile → File objects → handleFiles).
		let unlisten: (() => void) | null = null;
		(async () => {
			const { getCurrentWebview } = await import('@tauri-apps/api/webview');
			const webview = getCurrentWebview();
			unlisten = await webview.onDragDropEvent(async (event) => {
				const p = event.payload;
				if (p.type === 'enter' || p.type === 'over') {
					dragOver = true;
				} else if (p.type === 'leave') {
					dragOver = false;
				} else if (p.type === 'drop') {
					dragOver = false;
					if (p.paths.length === 0) return;
					const files = await Promise.all(p.paths.map(tauriPathToFile));
					await handleFiles(files);
				}
			});
		})();

		return () => {
			if (unlisten) unlisten();
			window.removeEventListener('dragover', blockDefault);
			window.removeEventListener('drop', blockDefault);
		};
	});

	let filteredFiles = $derived.by(() => {
		const all = $fileViews;
		if (filter === 'all')         return all;
		if (filter === 'mine')        return all.filter((f) => f.presence === 'local');
		if (filter === 'remote')      return all.filter((f) => f.presence === 'remote');
		if (filter === 'downloading') return all.filter((f) => f.presence === 'downloading');
		if (filter === 'cached')      return all.filter((f) => f.presence === 'cached');
		return all;
	});

	let counts = $derived.by(() => {
		const all = $fileViews;
		return {
			all: all.length,
			mine:        all.filter((f) => f.presence === 'local').length,
			remote:      all.filter((f) => f.presence === 'remote').length,
			downloading: all.filter((f) => f.presence === 'downloading').length,
			cached:      all.filter((f) => f.presence === 'cached').length
		};
	});

	async function handleFiles(files: FileList | File[]) {
		if (!files || files.length === 0) return;
		uploading = true;
		try {
			for (const f of Array.from(files)) {
				try {
					await uploadRealmFile(f);
					toastSuccess(`Uploaded ${f.name}`);
					await loadFileViews();
				} catch (e) {
					toastError(`Upload failed: ${f.name} — ${String(e)}`);
				}
			}
		} finally {
			uploading = false;
		}
	}

	async function tauriPathToFile(path: string): Promise<File> {
		const { readFile } = await import('@tauri-apps/plugin-fs');
		const bytes = await readFile(path);
		const name = path.split(/[\\/]/).pop() || 'file';
		return new File([bytes], name);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}
	function onDragLeave() {
		dragOver = false;
	}
	async function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			await handleFiles(e.dataTransfer.files);
		}
	}

	async function onPickClick() {
		if (isTauri()) {
			try {
				const { open } = await import('@tauri-apps/plugin-dialog');
				const selected = await open({ multiple: true, directory: false });
				if (!selected) return;
				const paths = Array.isArray(selected) ? selected : [selected];
				const files = await Promise.all(paths.map(tauriPathToFile));
				await handleFiles(files);
				return;
			} catch (e) {
				toastError(`File picker failed: ${String(e)}`);
				return;
			}
		}
		fileInput?.click();
	}

	function onPick(e: Event) {
		const t = e.target as HTMLInputElement;
		if (t.files) handleFiles(t.files);
		t.value = '';
	}
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onPickClick();
		}
	}

	// Called by BriefcaseRow when an action completes (POST /share,
	// DELETE /cache, completed download, etc.) so the table refreshes
	// to show the new state.
	function refresh(): Promise<void> {
		return loadFileViews();
	}
</script>

<div class="p-6 max-w-5xl mx-auto">
	<header class="flex items-center justify-between mb-4">
		<div>
			<h1 class="text-2xl font-bold">Briefcase</h1>
			<p class="text-sm opacity-60">
				Your files. Private by default — Share to publish to the realm.
			</p>
		</div>
		<button
			class="inline-flex items-center px-3 py-1 text-xs rounded border
				bg-surface-800 text-surface-300 border-surface-600
				hover:border-surface-500 hover:text-surface-50
				transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			onclick={refresh}
			disabled={$viewLoading}
		>
			{$viewLoading ? 'Loading…' : 'Refresh'}
		</button>
	</header>

	<!-- Filter chips -->
	<div class="flex items-center gap-1 mb-4 flex-wrap">
		{#each [
			{ id: 'all',         label: `All (${counts.all})` },
			{ id: 'mine',        label: `Mine (${counts.mine})` },
			{ id: 'remote',      label: `From realm (${counts.remote})` },
			{ id: 'downloading', label: `Downloading (${counts.downloading})` },
			{ id: 'cached',      label: `Cached (${counts.cached})` }
		] as chip}
			<button
				class="px-3 py-1 text-xs rounded-full border transition-colors
					{filter === chip.id
						? 'bg-macula-600/20 text-macula-200 border-macula-500/50'
						: 'bg-surface-800 text-surface-400 border-surface-600 hover:border-surface-500'}"
				onclick={() => (filter = chip.id as Filter)}
			>
				{chip.label}
			</button>
		{/each}
	</div>

	<!-- Drop zone -->
	<div
		class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
			{dragOver ? 'border-macula-400 bg-macula-600/5' : 'border-surface-600'}"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={onPickClick}
		onkeydown={onKeyDown}
		role="button"
		tabindex="0"
		aria-label="Drop files or click to pick"
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			class="hidden"
			onchange={onPick}
		/>
		{#if uploading}
			<p class="text-lg font-medium">Uploading…</p>
			<p class="text-sm opacity-60 mt-2">Your files are landing in your briefcase.</p>
		{:else}
			<p class="text-lg font-medium">Drop files here or click to pick</p>
			<p class="text-sm opacity-60 mt-2">
				Private by default. Use the Share action to publish to the realm.
			</p>
		{/if}
	</div>

	{#if $viewError}
		<div class="mt-4 px-3 py-2 rounded border border-danger-600/40 bg-danger-600/10 text-sm text-danger-400">
			{$viewError}
		</div>
	{/if}

	<!-- File list -->
	<section class="mt-6">
		{#if filteredFiles.length === 0 && !$viewLoading}
			<p class="opacity-60 text-sm italic px-1">
				{#if $fileViews.length === 0}
					No files yet. Drop one above to get started.
				{:else}
					No files match this filter.
				{/if}
			</p>
		{:else}
			<div class="overflow-x-auto rounded-lg border border-surface-700">
				<table class="w-full text-sm">
					<thead class="text-[11px] uppercase tracking-wide text-surface-400 bg-surface-800/60">
						<tr>
							<th class="text-left font-medium px-3 py-2">Path</th>
							<th class="text-left font-medium px-3 py-2">State</th>
							<th class="text-left font-medium px-3 py-2">Type</th>
							<th class="text-right font-medium px-3 py-2">Size</th>
							<th class="text-left font-medium px-3 py-2">Uploaded</th>
							<th class="text-right font-medium px-3 py-2">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-surface-800">
						{#each filteredFiles as f (f.file_id)}
							<BriefcaseRow file={f} onChange={refresh} />
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

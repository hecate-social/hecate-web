<script lang="ts">
	import { onMount } from 'svelte';
	import {
		realmFiles, realmLoading, realmError,
		loadRealmFiles, uploadRealmFile, shareRealmFile, unshareRealmFile,
		fileContentUrl, formatSize,
		type RealmFile, type Privacy
	} from '$lib/stores/briefcase-realm';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import { isTauri } from '$lib/tauri';

	// Filter chips
	type Filter = 'all' | 'private' | 'shared';
	let filter = $state<Filter>('all');

	let dragOver = $state(false);
	let uploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	onMount(() => {
		loadRealmFiles();
	});

	let filteredFiles = $derived.by(() => {
		if (filter === 'all') return $realmFiles;
		return $realmFiles.filter((f) => f.privacy === filter);
	});

	let counts = $derived.by(() => {
		const all = $realmFiles.length;
		const priv = $realmFiles.filter((f) => f.privacy === 'private').length;
		const shared = $realmFiles.filter((f) => f.privacy === 'shared').length;
		return { all, private: priv, shared };
	});

	async function handleFiles(files: FileList | File[]) {
		if (!files || files.length === 0) return;
		uploading = true;
		try {
			for (const f of Array.from(files)) {
				try {
					await uploadRealmFile(f);
					toastSuccess(`Uploaded ${f.name}`);
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

	async function onShare(f: RealmFile) {
		try {
			await shareRealmFile(f.file_id);
			toastSuccess(`Shared ${f.path} to realm`);
		} catch (e) {
			toastError(`Share failed: ${String(e)}`);
		}
	}

	async function onUnshare(f: RealmFile) {
		try {
			await unshareRealmFile(f.file_id);
			toastSuccess(`Unshared ${f.path}`);
		} catch (e) {
			toastError(`Unshare failed: ${String(e)}`);
		}
	}

	function privacyLabel(p: Privacy): string {
		return p === 'shared' ? 'Shared' : 'Private';
	}
	function privacyClass(p: Privacy): string {
		return p === 'shared'
			? 'bg-macula-600/20 text-macula-300 border-macula-600/40'
			: 'bg-surface-700/50 text-surface-400 border-surface-600';
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
			class="btn btn-sm btn-ghost"
			onclick={loadRealmFiles}
			disabled={$realmLoading}
		>
			{$realmLoading ? 'Loading…' : 'Refresh'}
		</button>
	</header>

	<!-- Filter chips -->
	<div class="flex items-center gap-1 mb-4">
		{#each [
			{ id: 'all', label: `All (${counts.all})` },
			{ id: 'private', label: `Private (${counts.private})` },
			{ id: 'shared', label: `Shared (${counts.shared})` }
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
				Private by default. Use the Share button to publish to the realm.
			</p>
		{/if}
	</div>

	{#if $realmError}
		<div class="alert alert-error mt-4">
			<span>{$realmError}</span>
		</div>
	{/if}

	<!-- File list -->
	<section class="mt-6">
		{#if filteredFiles.length === 0 && !$realmLoading}
			<p class="opacity-60 text-sm italic px-1">
				{#if $realmFiles.length === 0}
					No files yet. Drop one above to get started.
				{:else}
					No files match this filter.
				{/if}
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th>Path</th>
							<th>State</th>
							<th>Type</th>
							<th>Size</th>
							<th>Uploaded</th>
							<th class="text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredFiles as f (f.file_id)}
							<tr>
								<td class="font-mono text-sm">{f.path}</td>
								<td>
									<span class="px-2 py-0.5 text-xs rounded-full border {privacyClass(f.privacy)}">
										{privacyLabel(f.privacy)}
									</span>
								</td>
								<td class="text-xs opacity-70">{f.mime_type || '—'}</td>
								<td class="text-xs">{formatSize(f.size)}</td>
								<td class="text-xs opacity-70">
									{new Date(f.uploaded_at).toLocaleString()}
								</td>
								<td class="text-right space-x-1">
									{#if f.privacy === 'private'}
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => onShare(f)}
											title="Publish to realm"
										>
											Share
										</button>
									{:else}
										<button
											class="btn btn-xs btn-ghost"
											onclick={() => onUnshare(f)}
											title="Revoke sharing"
										>
											Unshare
										</button>
									{/if}
									<a
										class="btn btn-xs btn-ghost"
										href={fileContentUrl(f.file_id)}
										download={f.path}
									>
										Download
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		realmFiles, realmLoading, realmError,
		loadRealmFiles, uploadRealmFile, fileContentUrl, formatSize,
		type RealmFile
	} from '$lib/stores/briefcase-realm';
	import { toastSuccess, toastError } from '$lib/stores/toasts';
	import { isTauri } from '$lib/tauri';

	let dragOver = false;
	let uploading = false;
	let fileInput: HTMLInputElement | undefined;

	onMount(() => {
		loadRealmFiles();
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

	/** Read a file from a Tauri-reported path into a browser File object. */
	async function tauriPathToFile(path: string): Promise<File> {
		const { readFile } = await import('@tauri-apps/plugin-fs');
		const bytes = await readFile(path);
		const name = path.split(/[\\/]/).pop() || 'file';
		return new File([bytes], name);
	}

	async function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}
	async function onDragLeave() {
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
		// In Tauri, prefer the native dialog — the HTML file input .click()
		// is unreliable across WebView versions.
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
		// Browser fallback
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
</script>

<div class="p-6 max-w-5xl mx-auto">
	<header class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold">Briefcase — Realm Synced</h1>
			<p class="text-sm opacity-60">
				Files here sync across every peer in your realm.
			</p>
		</div>
		<button
			class="btn btn-sm btn-ghost"
			on:click={loadRealmFiles}
			disabled={$realmLoading}
		>
			{$realmLoading ? 'Loading…' : 'Refresh'}
		</button>
	</header>

	<!-- Drop zone -->
	<div
		class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors {dragOver
			? 'border-primary bg-primary/5'
			: 'border-base-300'}"
		on:dragover={onDragOver}
		on:dragleave={onDragLeave}
		on:drop={onDrop}
		on:click={onPickClick}
		on:keydown={onKeyDown}
		role="button"
		tabindex="0"
		aria-label="Drop files or click to pick"
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			class="hidden"
			on:change={onPick}
		/>
		{#if uploading}
			<p class="text-lg font-medium">Uploading…</p>
			<p class="text-sm opacity-60 mt-2">Your files are being shared with the realm.</p>
		{:else}
			<p class="text-lg font-medium">Drop files here or click to pick</p>
			<p class="text-sm opacity-60 mt-2">
				They'll appear on every peer in your realm.
			</p>
		{/if}
	</div>

	{#if $realmError}
		<div class="alert alert-error mt-4">
			<span>{$realmError}</span>
		</div>
	{/if}

	<!-- File list -->
	<section class="mt-8">
		<h2 class="text-lg font-semibold mb-3">
			Files ({$realmFiles.length})
		</h2>
		{#if $realmFiles.length === 0 && !$realmLoading}
			<p class="opacity-60 text-sm italic">
				No files yet. Drop one above to get started.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th>Path</th>
							<th>Type</th>
							<th>Size</th>
							<th>Uploaded</th>
							<th class="text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each $realmFiles as f (f.file_id)}
							<tr>
								<td class="font-mono text-sm">{f.path}</td>
								<td class="text-xs opacity-70">{f.mime_type || '—'}</td>
								<td class="text-xs">{formatSize(f.size)}</td>
								<td class="text-xs opacity-70">
									{new Date(f.uploaded_at).toLocaleString()}
								</td>
								<td class="text-right">
									<a
										class="btn btn-xs btn-ghost"
										href={fileContentUrl(f.file_id)}
										download={f.path}
									>
										download
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

// Tauri detection and capability bridge
//
// When running inside Tauri (hecate-web), native capabilities are available.
// When running in a plain browser (daemon-served UI), we gracefully degrade.

declare global {
	interface Window {
		__TAURI_INTERNALS__?: unknown;
	}
}

export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Open a URL — uses Tauri shell plugin if available, falls back to window.open */
export async function openExternal(url: string): Promise<void> {
	if (isTauri()) {
		const { open } = await import('@tauri-apps/plugin-shell');
		await open(url);
	} else {
		window.open(url, '_blank', 'noopener');
	}
}

/** Open a secondary webview (realm join, etc.) — falls back to window.open */
export async function openWebview(label: string, url: string, title: string): Promise<void> {
	if (isTauri()) {
		const { invoke } = await import('@tauri-apps/api/core');
		await invoke('open_webview', { label, url, title, width: 800, height: 700 });
	} else {
		window.open(url, label, 'width=800,height=700,noopener');
	}
}

/** Close a secondary webview — no-op in browser (user closes the tab) */
export async function closeWebview(label: string): Promise<void> {
	if (isTauri()) {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			await invoke('close_webview', { label });
		} catch {
			// already closed
		}
	}
}

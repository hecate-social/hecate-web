// Type declarations for optional Tauri APIs.
// These modules are only loaded dynamically when running inside Tauri.
// The actual packages are NOT installed — these stubs satisfy TypeScript.

declare module '@tauri-apps/api/core' {
	export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare module '@tauri-apps/api/event' {
	export type UnlistenFn = () => void;
	export interface Event<T> {
		payload: T;
	}
	export function listen<T>(
		event: string,
		handler: (event: Event<T>) => void
	): Promise<UnlistenFn>;
}

declare module '@tauri-apps/api/window' {
	interface WebviewWindow {
		minimize(): Promise<void>;
		toggleMaximize(): Promise<void>;
		close(): Promise<void>;
	}
	export function getCurrentWindow(): WebviewWindow;
}

declare module '@tauri-apps/api/app' {
	export function getVersion(): Promise<string>;
}

declare module '@tauri-apps/plugin-shell' {
	export function open(url: string): Promise<void>;
}

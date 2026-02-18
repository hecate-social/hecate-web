// Plugin runtime setup — exposes Svelte modules on window for dynamically loaded
// plugin components. Plugin component.js files use bare import specifiers
// (e.g. `import * as e from "svelte/internal/client"`) which cannot resolve in a
// blob URL context. The plugin loader rewrites these to window global references.
//
// This file is a plain .ts module (not .svelte) to bypass Svelte's
// import_svelte_internal_forbidden check. The @ts-ignore suppresses the missing
// declaration file warning for svelte/internal/client.

import * as SvelteRuntime from 'svelte';
// @ts-ignore — no public type declarations for svelte internals
import * as SvelteInternalClient from 'svelte/internal/client';

export function initPluginRuntime(): void {
	(window as any).__hecate_svelte = SvelteRuntime;
	(window as any).__hecate_svelte_internal_client = SvelteInternalClient;
}

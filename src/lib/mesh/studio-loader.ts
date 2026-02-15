// Mesh studio loader — v2 feature
// Downloads, verifies (content-addressed), and caches mesh studio bundles
// Studios are loaded into sandboxed iframes with postMessage bridge

export interface StudioManifest {
	name: string;
	version: string;
	author: string;
	icon: string;
	description: string;
	entry: string;
	permissions: string[];
	signature: string;
}

// Placeholder — will be implemented in v2
export async function discoverStudios(): Promise<StudioManifest[]> {
	return [];
}

export async function loadStudio(_manifest: StudioManifest): Promise<string> {
	throw new Error('Mesh studios not yet implemented');
}

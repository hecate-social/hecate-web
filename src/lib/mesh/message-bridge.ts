// postMessage bridge for sandboxed mesh studio iframes — v2 feature
// Proxies StudioContext API calls between shell and iframe studios
// Studios declare required permissions in manifest; user approves on first load

export interface BridgeMessage {
	type: 'api-request' | 'api-response' | 'event' | 'notification';
	id: string;
	payload: unknown;
}

// Placeholder — will be implemented in v2
export function createMessageBridge(_iframe: HTMLIFrameElement): void {
	// Will listen for postMessage events from iframe
	// Validate against declared permissions
	// Proxy API calls through the shell's StudioContext
}

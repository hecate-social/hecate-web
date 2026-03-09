import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { Agent } from 'node:http';

// Unix socket path for dev proxy (matches hecate_socket:get_socket_path/0)
const SOCKET_PATH = process.env.HECATE_SOCKET_PATH
	?? `${process.env.HOME}/.hecate/hecate-daemon/sockets/api.sock`;

const socketAgent = new Agent({ socketPath: SOCKET_PATH } as never);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	test: {
		include: ['src/**/*.test.ts']
	},

	build: {
		rollupOptions: {
			// Tauri APIs are only loaded dynamically when running inside Tauri.
			// Mark them external so Rollup doesn't fail on missing packages.
			external: [
				'@tauri-apps/api/core',
				'@tauri-apps/api/event',
				'@tauri-apps/api/window',
				'@tauri-apps/api/app',
				'@tauri-apps/plugin-shell'
			]
		}
	},

	server: {
		port: 1420,
		strictPort: true,
		hmr: {
			overlay: false
		},
		proxy: {
			'/api': {
				target: 'http://localhost',
				agent: socketAgent
			},
			'/plugin': {
				target: 'http://localhost',
				agent: socketAgent,
				bypass(req) {
					const url = req.url ?? '';
					// Only proxy /plugin/{name}/api/* and /plugin/{name}/ui/*
					// Let SvelteKit handle /plugin/{name} page routes
					const parts = url.split('/').filter(Boolean); // ['plugin', 'name', 'api'|'ui', ...]
					if (parts.length >= 3 && (parts[2] === 'api' || parts[2] === 'ui')) {
						return undefined; // proxy it
					}
					return url; // skip proxy, let SvelteKit handle it
				}
			},
			'/health': {
				target: 'http://localhost',
				agent: socketAgent
			}
		}
	}
});

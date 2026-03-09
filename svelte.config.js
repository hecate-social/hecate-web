import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: '../hecate-daemon/priv/static',
			assets: '../hecate-daemon/priv/static',
			fallback: 'index.html'
		})
	}
};

export default config;

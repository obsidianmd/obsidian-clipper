import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await esbuild.build({
	entryPoints: [path.join(root, 'src/api.ts')],
	bundle: true,
	platform: 'neutral',
	format: 'esm',
	outfile: path.join(root, 'dist/api.mjs'),
	external: [
		'defuddle',
		'defuddle/full',
		'dayjs',
	],
	define: {
		'DEBUG_MODE': 'false',
	},
	alias: {
		'webextension-polyfill': path.join(root, 'src/utils/cli-stubs.ts'),
	},
	logLevel: 'info',
});

console.log('API built successfully → dist/api.mjs');

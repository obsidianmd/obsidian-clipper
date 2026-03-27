import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const defuddleDir = path.join(root, 'node_modules/defuddle/dist');

// Polyfill code that must run before ANY module code.
// Turndown (bundled in defuddle/full) checks `window.DOMParser` at module
// init time, so we must provide it before require() runs.
const polyfillBanner = `
#!/usr/bin/env node
;(function() {
  var linkedom = require("linkedom");
  var _parseHTML = linkedom.parseHTML;

  var LP = function() {};
  LP.prototype.parseFromString = function(html) {
    return _parseHTML(html).document;
  };

  if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
  if (!globalThis.DOMParser) globalThis.DOMParser = LP;
  if (!globalThis.window.DOMParser) globalThis.window.DOMParser = LP;
  if (typeof globalThis.document === "undefined") {
    globalThis.document = _parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document;
  }
  if (typeof globalThis.navigator === "undefined") {
    var _platform = process.platform === "win32" ? "Win32" : process.platform === "darwin" ? "MacIntel" : "Linux x86_64";
    globalThis.navigator = { userAgent: "Node.js/" + process.version, platform: _platform, userAgentData: null };
  }
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = function() {
      return { display: "block", visibility: "visible", getPropertyValue: function() { return ""; } };
    };
  }
})();
`.trim();

await esbuild.build({
	entryPoints: [path.join(root, 'src/cli.ts')],
	bundle: true,
	platform: 'node',
	target: 'node18',
	format: 'cjs',
	outfile: path.join(root, 'dist/cli.cjs'),
	banner: {
		js: polyfillBanner,
	},
	external: [
		'linkedom',
	],
	define: {
		'DEBUG_MODE': 'false',
	},
	alias: {
		'webextension-polyfill': path.join(root, 'src/utils/cli-stubs.ts'),
		'defuddle/full': path.join(defuddleDir, 'index.full.js'),
		'defuddle': path.join(defuddleDir, 'index.js'),
	},
	logLevel: 'info',
});

console.log('CLI built successfully → dist/cli.cjs');

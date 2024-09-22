const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const package = require('./package.json');

const firefoxConfig = {
	entry: {
		'background-firefox': './src/background-firefox.ts',
	},
};
const safariConfig = {
	entry: {
		'background-safari': './src/background-safari.ts',
	},
};

// Remove .DS_Store files
function removeDSStore(dir) {
	const files = fs.readdirSync(dir);
	files.forEach(file => {
		const filePath = path.join(dir, file);
		if (fs.statSync(filePath).isDirectory()) {
			removeDSStore(filePath);
		} else if (file === '.DS_Store') {
			fs.unlinkSync(filePath);
		}
	});
}

module.exports = (env, argv) => {
	const isFirefox = env.BROWSER === 'firefox';
	const isSafari = env.BROWSER === 'safari';
	const outputDir = isFirefox ? 'dist_firefox' : (isSafari ? 'dist_safari' : 'dist');
	const browserName = isFirefox ? 'firefox' : (isSafari ? 'safari' : 'chrome');

	return {
		mode: 'production',
		entry: {
			popup: './src/core/popup.ts',
			settings: './src/core/settings.ts',
			content: './src/content.ts',
			background: './src/background.ts',
			styles: './src/style.scss',
			...(isFirefox ? firefoxConfig.entry : {}),
			...(isSafari ? safariConfig.entry : {}),
		},
		output: {
			path: path.resolve(__dirname, outputDir),
			filename: '[name].js',
			module: true,
		},
		devtool: 'source-map',
		experiments: {
			outputModule: true,
		},
		resolve: {
			extensions: ['.ts', '.js']
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
				{
					test: /\.scss$/,
					use: [
						MiniCssExtractPlugin.loader,
						{
							loader: 'css-loader',
							options: {
								sourceMap: true
							}
						},
						{
							loader: 'sass-loader',
							options: {
								sourceMap: true
							}
						}
					]
				}
			]
		},
		plugins: [
			new CopyPlugin({
				patterns: [
					{ 
						from: isFirefox ? "src/manifest.firefox.json" : 
							  (isSafari ? "src/manifest.safari.json" : "src/manifest.chrome.json"), 
						to: "manifest.json" 
					},
					{ from: "src/popup.html", to: "popup.html" },
					{ from: "src/settings.html", to: "settings.html" },
					{ from: "src/icons", to: "icons" },
					{ from: "node_modules/webextension-polyfill/dist/browser-polyfill.min.js", to: "browser-polyfill.min.js" }
				],
			}),
			new MiniCssExtractPlugin({
				filename: 'style.css'
			}),
			{
				apply: (compiler) => {
					compiler.hooks.afterEmit.tap('RemoveDSStore', (compilation) => {
						removeDSStore(path.resolve(__dirname, outputDir));
					});
				}
				},
			new ZipPlugin({
				path: path.resolve(__dirname, 'builds'),
				filename: `obsidian-web-clipper-${package.version}-${browserName}.zip`,
			})
		]
	};
};

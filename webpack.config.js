const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const package = require('./package.json');

module.exports = (env, argv) => {
	const isFirefox = env.BROWSER === 'firefox';
	const outputDir = isFirefox ? 'dist_firefox' : 'dist';
	const browserName = isFirefox ? 'firefox' : 'chrome';

	return {
		mode: 'production',
		entry: {
			popup: './src/core/popup.ts',
			settings: './src/core/settings.ts',
			content: './src/content.ts',
			background: './src/background.ts',
			styles: './src/style.scss'
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
						'css-loader',
						'sass-loader'
					]
				}
			]
		},
		plugins: [
			new CopyPlugin({
				patterns: [
					{ 
						from: isFirefox ? "src/manifest.firefox.json" : "src/manifest.chrome.json", 
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
			new ZipPlugin({
				path: './',
				filename: `obsidian-web-clipper-${browserName}.${package.version}.zip`,
			})
		]
	};
};

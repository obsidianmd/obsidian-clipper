const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
	mode: 'production',
	entry: {
		popup: './src/popup.ts',
		settings: './src/settings.ts',
		content: './src/content.ts',
		background: './src/background.js',
		styles: './src/style.scss'
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
		module: true,
	},
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
				{ from: "src/manifest.json", to: "manifest.json" },
				{ from: "src/popup.html", to: "popup.html" },
				{ from: "src/settings.html", to: "settings.html" },
				{ from: "src/icons", to: "icons" }
			],
		}),
		new MiniCssExtractPlugin({
			filename: 'style.css'
		})
	]
};

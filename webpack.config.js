const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
	mode: 'development', // or 'production'
	entry: {
		popup: './src/popup.js',
		settings: './src/settings-main.js',
		content: './src/content.js',
		background: './src/background.js',
		styles: './src/style.scss'
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js'
	},
	devtool: 'inline-source-map', // Use this or 'source-map'
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env']
					}
				}
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
	],
	resolve: {
		extensions: ['.js']
	},
	devServer: {
		hot: true,
	}
};
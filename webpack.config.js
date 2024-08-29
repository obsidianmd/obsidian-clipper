const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development', // or 'production'
  entry: {
    popup: './src/popup.js',
    settings: './src/settings.js',
    content: './src/content.js',
    background: './src/background.js'
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
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/manifest.json", to: "manifest.json" },
        { from: "src/popup.html", to: "popup.html" },
        { from: "src/settings.html", to: "settings.html" },
        { from: "src/style.css", to: "style.css" },
        { from: "src/icons", to: "icons" }
      ],
    }),
  ],
  devServer: {
    hot: true,
  }
};
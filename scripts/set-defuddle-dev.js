const fs = require('fs');
const path = require('path');

// Read the package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Update the defuddle dependency to use local version
packageJson.dependencies.defuddle = 'file:../defuddle';

// Write the updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, '\t') + '\n');

// Run npm install to update the dependency
const { execSync } = require('child_process');
try {
	execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (error) {
	console.error('Failed to install dependencies:', error);
	process.exit(1);
} 
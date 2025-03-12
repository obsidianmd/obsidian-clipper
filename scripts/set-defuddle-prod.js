const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read the package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get the production version from the current dependencies
const productionVersion = packageJson.dependencies.defuddle;

// Update the defuddle dependency to use npm version
// This ensures we're using the same version as defined in package.json
packageJson.dependencies.defuddle = productionVersion;

// Write the updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, '\t') + '\n');

// Path to defuddle in node_modules
const defuddlePath = path.join(__dirname, '..', 'node_modules', 'defuddle');

// Safely remove the old defuddle directory if it exists
try {
	if (fs.existsSync(defuddlePath)) {
		if (process.platform === 'win32') {
			execSync(`rmdir /s /q "${defuddlePath}"`, { stdio: 'inherit' });
		} else {
			execSync(`rm -rf "${defuddlePath}"`, { stdio: 'inherit' });
		}
	}
} catch (error) {
	console.error('Failed to remove old defuddle directory:', error);
	process.exit(1);
}

// Run npm install to update the dependency
try {
	execSync('npm install --no-save', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (error) {
	console.error('Failed to install dependencies:', error);
	process.exit(1);
} 
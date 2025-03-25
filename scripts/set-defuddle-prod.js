const { execSync } = require('child_process');
const path = require('path');

// Run commands from the project root
const projectRoot = path.join(__dirname, '..');

try {
	// Remove defuddle module and reinstall dependencies
	execSync('rm -rf node_modules/defuddle && npm install', { 
		stdio: 'inherit',
		cwd: projectRoot
	});
} catch (error) {
	console.error('Failed to update defuddle:', error);
	process.exit(1);
} 
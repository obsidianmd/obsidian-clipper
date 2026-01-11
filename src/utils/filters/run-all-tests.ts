// Run all filter tests
// Usage: npx tsx src/utils/filters/run-all-tests.ts

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
	.filter(file => file.endsWith('.test.ts'))
	.sort();

console.log(`\nRunning ${testFiles.length} filter test files...\n`);
console.log('='.repeat(50));

let totalPassed = 0;
let totalFailed = 0;
let failedFiles: string[] = [];

for (const file of testFiles) {
	const filePath = join(__dirname, file);
	try {
		const output = execSync(`npx tsx "${filePath}"`, {
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		});

		// Extract results from output
		const match = output.match(/=== Results: (\d+) passed, (\d+) failed ===/);
		if (match) {
			const passed = parseInt(match[1]);
			const failed = parseInt(match[2]);
			totalPassed += passed;
			totalFailed += failed;

			const status = failed > 0 ? '✗' : '✓';
			console.log(`${status} ${file}: ${passed} passed, ${failed} failed`);

			if (failed > 0) {
				failedFiles.push(file);
			}
		}
	} catch (error: any) {
		console.log(`✗ ${file}: ERROR`);
		if (error.stdout) {
			console.log(error.stdout);
		}
		if (error.stderr) {
			console.log(error.stderr);
		}
		failedFiles.push(file);
		totalFailed++;
	}
}

console.log('='.repeat(50));
console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed across ${testFiles.length} files`);

if (failedFiles.length > 0) {
	console.log('\nFailed files:');
	failedFiles.forEach(f => console.log(`  - ${f}`));
	process.exit(1);
}

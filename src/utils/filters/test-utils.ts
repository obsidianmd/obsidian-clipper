// Shared test utilities for filter tests
// Run individual filter tests with: npx tsx src/utils/filters/<filter>.test.ts

// Mock DEBUG_MODE for filters that use debugLog
(global as any).DEBUG_MODE = false;

// ============================================================================
// Test Runner
// ============================================================================

let passed = 0;
let failed = 0;
let currentSuite = '';

export function describe(name: string, fn: () => void): void {
	currentSuite = name;
	console.log(`\n=== ${name} ===\n`);
	fn();
}

export function test(name: string, fn: () => void): void {
	try {
		fn();
		passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error}`);
	}
}

// Alias for test
export const it = test;

// ============================================================================
// Assertions
// ============================================================================

export function expect(actual: any) {
	const assertions = {
		toBe(expected: any) {
			if (actual !== expected) {
				throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
			}
		},
		toEqual(expected: any) {
			const actualStr = JSON.stringify(actual);
			const expectedStr = JSON.stringify(expected);
			if (actualStr !== expectedStr) {
				throw new Error(`Expected ${expectedStr}, got ${actualStr}`);
			}
		},
		toContain(expected: string) {
			if (typeof actual !== 'string' || !actual.includes(expected)) {
				throw new Error(`Expected "${actual}" to contain "${expected}"`);
			}
		},
		notToContain(expected: string) {
			if (typeof actual === 'string' && actual.includes(expected)) {
				throw new Error(`Expected "${actual}" not to contain "${expected}"`);
			}
		},
		toMatch(pattern: RegExp) {
			if (!pattern.test(String(actual))) {
				throw new Error(`Expected "${actual}" to match ${pattern}`);
			}
		},
		toBeTrue() {
			if (actual !== true) {
				throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
			}
		},
		toBeFalse() {
			if (actual !== false) {
				throw new Error(`Expected false, got ${JSON.stringify(actual)}`);
			}
		},
		toBeArray() {
			if (!Array.isArray(actual)) {
				throw new Error(`Expected array, got ${typeof actual}`);
			}
		},
		toHaveLength(expected: number) {
			const length = Array.isArray(actual) ? actual.length :
				typeof actual === 'string' ? actual.length :
				Object.keys(actual).length;
			if (length !== expected) {
				throw new Error(`Expected length ${expected}, got ${length}`);
			}
		},
		not: {
			toContain(expected: string) {
				if (typeof actual === 'string' && actual.includes(expected)) {
					throw new Error(`Expected "${actual}" not to contain "${expected}"`);
				}
			},
			toBe(expected: any) {
				if (actual === expected) {
					throw new Error(`Expected not ${JSON.stringify(expected)}`);
				}
			}
		}
	};
	return assertions;
}

// ============================================================================
// Summary Reporter
// ============================================================================

export function summary(): void {
	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
	if (failed > 0) {
		process.exit(1);
	}
}

// Reset counters (useful when running multiple test files)
export function reset(): void {
	passed = 0;
	failed = 0;
}

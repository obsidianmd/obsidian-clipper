#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function encodeNativeMessage(message) {
	const body = Buffer.from(JSON.stringify(message), 'utf8');
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.byteLength, 0);
	return Buffer.concat([header, body]);
}

function decodeNativeMessage(buffer) {
	if (buffer.byteLength < 4) throw new Error('Missing native response header');
	const length = buffer.readUInt32LE(0);
	if (buffer.byteLength < 4 + length) {
		throw new Error(`Incomplete native response: expected ${length} bytes, got ${buffer.byteLength - 4}`);
	}
	const body = buffer.subarray(4, 4 + length);
	return JSON.parse(body.toString('utf8'));
}

const cwd = new URL('..', import.meta.url);
const hostExe = new URL('obsidian-clipper-codex-host.exe', import.meta.url);
const hostCmd = new URL('obsidian-clipper-codex-host.cmd', import.meta.url);
const useExe = process.platform === 'win32' && existsSync(hostExe);
const child = useExe
	? spawn(fileURLToPath(hostExe), [], { cwd, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
	: spawn(process.platform === 'win32' ? 'cmd.exe' : 'node', process.platform === 'win32'
		? ['/c', fileURLToPath(hostCmd)]
		: ['native/obsidian-clipper-codex-host.mjs'], {
			cwd,
			stdio: ['pipe', 'pipe', 'inherit'],
			windowsHide: true,
		});

const chunks = [];
child.stdout.on('data', chunk => chunks.push(chunk));
child.on('close', code => {
	if (code !== 0) {
		console.error(`Host exited with code ${code}`);
		process.exit(code ?? 1);
	}

	const response = decodeNativeMessage(Buffer.concat(chunks));
	console.log(JSON.stringify(response, null, 2));

	if (!response.ok || !String(response.content || '').includes('CODEX_UI_OK')) {
		process.exit(1);
	}
});

child.stdin.end(encodeNativeMessage({
	type: 'interpreter',
	model: '',
	promptContext: 'Title: Codex UI smoke test\nContent: Return the exact requested token only.',
	promptVariables: [{ key: 'prompt_1', prompt: 'Return exactly CODEX_UI_OK.' }],
}));

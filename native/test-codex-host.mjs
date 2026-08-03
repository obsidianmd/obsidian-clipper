#!/usr/bin/env node
import { spawn } from 'node:child_process';

function encodeNativeMessage(message) {
	const body = Buffer.from(JSON.stringify(message), 'utf8');
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.byteLength, 0);
	return Buffer.concat([header, body]);
}

function decodeNativeMessage(buffer) {
	if (buffer.byteLength < 4) throw new Error('Missing native response header');
	const length = buffer.readUInt32LE(0);
	const body = buffer.subarray(4, 4 + length);
	return JSON.parse(body.toString('utf8'));
}

const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'node', process.platform === 'win32'
	? ['/c', 'native\\obsidian-clipper-codex-host.cmd']
	: ['native/obsidian-clipper-codex-host.mjs'], {
	cwd: new URL('..', import.meta.url),
	stdio: ['pipe', 'pipe', 'inherit'],
});

const chunks = [];
child.stdout.on('data', chunk => chunks.push(chunk));
child.on('close', code => {
	if (code !== 0) {
		console.error(`Host exited with code ${code}`);
		process.exit(code ?? 1);
	}
	console.log(JSON.stringify(decodeNativeMessage(Buffer.concat(chunks)), null, 2));
});

child.stdin.end(encodeNativeMessage({ type: 'ping' }));

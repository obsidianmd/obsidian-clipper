#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOST_NAME = 'com.obsidian_clipper.codex';
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 900 * 1024;
const MAX_IMAGE_ATTACHMENTS = 4;

function readExact(stream, length) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let received = 0;

		function cleanup() {
			stream.off('readable', onReadable);
			stream.off('end', onEnd);
			stream.off('error', onError);
		}

		function onError(error) {
			cleanup();
			reject(error);
		}

		function onEnd() {
			cleanup();
			if (received === 0) resolve(null);
			else reject(new Error(`Unexpected EOF while reading ${length} bytes`));
		}

		function onReadable() {
			let chunk;
			while ((chunk = stream.read(length - received)) !== null) {
				chunks.push(chunk);
				received += chunk.length;
				if (received === length) {
					cleanup();
					resolve(Buffer.concat(chunks, length));
					return;
				}
			}
		}

		stream.on('readable', onReadable);
		stream.on('end', onEnd);
		stream.on('error', onError);
		onReadable();
	});
}

async function readNativeMessage() {
	const lengthBuffer = await readExact(process.stdin, 4);
	if (!lengthBuffer) return null;

	const length = lengthBuffer.readUInt32LE(0);
	if (length > MAX_MESSAGE_BYTES) {
		throw new Error(`Native message too large: ${length} bytes`);
	}

	const bodyBuffer = await readExact(process.stdin, length);
	if (!bodyBuffer) return null;
	return JSON.parse(bodyBuffer.toString('utf8'));
}

function writeNativeMessage(message) {
	let body = Buffer.from(JSON.stringify(message), 'utf8');
	if (body.byteLength > MAX_RESPONSE_BYTES) {
		body = Buffer.from(JSON.stringify({
			ok: false,
			host: HOST_NAME,
			error: `Response exceeded ${MAX_RESPONSE_BYTES} bytes`,
		}), 'utf8');
	}

	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.byteLength, 0);
	process.stdout.write(header);
	process.stdout.write(body);
}

function run(command, args, options) {
	return new Promise((resolve) => {
		const resolved = resolveCommand(command, args);
		const child = spawn(resolved.command, resolved.args, {
			cwd: options.cwd,
			env: { ...process.env, ...(options.env ?? {}) },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});

		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', chunk => { stdout += chunk; });
		child.stderr.on('data', chunk => { stderr += chunk; });
		child.on('error', error => resolve({ code: -1, stdout, stderr: String(error.message || error) }));
		child.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
		if (options.stdin !== undefined) {
			child.stdin.end(options.stdin);
		} else {
			child.stdin.end();
		}
	});
}

function resolveCommand(command, args) {
	if (process.platform !== 'win32') return { command, args };

	const normalized = command.replaceAll('/', '\\').toLowerCase();
	const isCodexShim = normalized === 'codex' || normalized.endsWith('\\codex') || normalized.endsWith('\\codex.cmd');
	if (isCodexShim) {
		const npmPrefix = process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '';
		const codexEntry = join(npmPrefix, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
		if (existsSync(codexEntry)) {
			return { command: 'node.exe', args: [codexEntry, ...args] };
		}
	}

	if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
		return { command: 'node.exe', args: [command, ...args] };
	}

	return {
		command: 'cmd.exe',
		args: ['/d', '/s', '/c', quoteForCmd(command, args)],
	};
}

function quoteForCmd(command, args) {
	return [command, ...args]
		.map(arg => `"${String(arg).replaceAll('"', '\\"')}"`)
		.join(' ');
}

function buildInterpreterPrompt(payload) {
	const promptVariables = Array.isArray(payload.promptVariables) ? payload.promptVariables : [];
	const imageAttachments = Array.isArray(payload.imageAttachments) ? payload.imageAttachments : [];
	const promptSpec = {};
	for (const variable of promptVariables) {
		if (variable?.key && variable?.prompt) {
			promptSpec[variable.key] = variable.prompt;
		}
	}

	return [
		'You are the interpreter backend for Obsidian Web Clipper.',
		'Return exactly one JSON object and no surrounding text.',
		'The JSON object must have this shape:',
		'{"prompts_responses":{"prompt_1":"Markdown string","prompt_2":"Markdown string"}}',
		'Use exactly the keys from the prompt variables JSON below.',
		'For each variable, answer variable.prompt using the clip context as the source material.',
		imageAttachments.length > 0
			? 'Use the attached image(s) as additional visual context when the prompt asks about visible layout, screenshots, charts, diagrams, or page appearance.'
			: 'No image attachments were provided.',
		'Do not invent facts not present in the clip context.',
		'Keep values concise unless the prompt asks otherwise.',
		'If a prompt asks for exact text, return that exact text as the value for that key.',
		'',
		`Prompt keys: ${Object.keys(promptSpec).join(', ') || '(none)'}`,
		'',
		'Clip context:',
		'```markdown',
		String(payload.promptContext || ''),
		'```',
		'',
		'Prompt variables JSON:',
		'```json',
		JSON.stringify(promptVariables, null, 2),
		'```',
		'',
		`Attached image count: ${imageAttachments.length}`,
	].join('\n');
}

function parseImageAttachment(attachment, index) {
	if (!attachment || typeof attachment.dataUrl !== 'string') return null;

	const match = attachment.dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\r\n]+)$/i);
	if (!match) return null;

	const extensionByMime = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/jpg': 'jpg',
		'image/webp': 'webp',
	};
	const extension = extensionByMime[match[1].toLowerCase()] || 'png';
	const safeName = String(attachment.name || `image-${index + 1}.${extension}`)
		.replace(/[^a-z0-9._-]/gi, '-')
		.replace(/-+/g, '-')
		.slice(0, 80);

	return {
		filename: safeName.includes('.') ? safeName : `${safeName}.${extension}`,
		buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
	};
}

async function writeImageAttachments(workdir, payload) {
	const attachments = Array.isArray(payload.imageAttachments) ? payload.imageAttachments.slice(0, MAX_IMAGE_ATTACHMENTS) : [];
	const imagePaths = [];

	for (let index = 0; index < attachments.length; index += 1) {
		const parsed = parseImageAttachment(attachments[index], index);
		if (!parsed) continue;

		const imagePath = join(workdir, parsed.filename);
		await writeFile(imagePath, parsed.buffer);
		imagePaths.push(imagePath);
	}

	return imagePaths;
}

async function removeWorkdir(workdir) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await rm(workdir, { recursive: true, force: true });
			return;
		} catch {
			await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
		}
	}
}

async function handleInterpreter(payload) {
	const workdir = await mkdtemp(join(tmpdir(), 'obsidian-clipper-codex-'));
	const outputPath = join(workdir, 'codex-result.json');

	try {
		await writeFile(join(workdir, 'prompt-context.md'), String(payload.promptContext || ''), 'utf8');
		await writeFile(join(workdir, 'prompt-variables.json'), JSON.stringify(payload.promptVariables || [], null, 2), 'utf8');
		const imagePaths = await writeImageAttachments(workdir, payload);

		const args = [
			'exec',
			'--cd', workdir,
			'--sandbox', 'read-only',
			'--skip-git-repo-check',
			'--output-last-message', outputPath,
		];

		if (payload.model) {
			args.push('--model', String(payload.model));
		}

		for (const imagePath of imagePaths) {
			args.push('--image', imagePath);
		}

		args.push('-');

		const result = await run(payload.codexPath || process.env.CODEX_BIN || 'codex', args, {
			cwd: workdir,
			stdin: buildInterpreterPrompt(payload),
		});
		if (result.code !== 0) {
			return {
				ok: false,
				host: HOST_NAME,
				code: result.code,
				error: result.stderr || result.stdout || 'Codex CLI failed',
			};
		}

		const content = await readFile(outputPath, 'utf8').catch(() => result.stdout);
		return {
			ok: true,
			host: HOST_NAME,
			content,
			stdout: result.stdout.slice(0, 8192),
		};
	} finally {
		if (!payload.keepTemp) {
			await removeWorkdir(workdir);
		}
	}
}

async function main() {
	try {
		const message = await readNativeMessage();
		if (!message) return;
		process.stdin.destroy();

		if (message.type === 'ping') {
			writeNativeMessage({ ok: true, host: HOST_NAME, pong: true });
			return;
		}

		if (message.type !== 'interpreter') {
			writeNativeMessage({ ok: false, host: HOST_NAME, error: `Unsupported message type: ${message.type}` });
			return;
		}

		writeNativeMessage(await handleInterpreter(message));
	} catch (error) {
		writeNativeMessage({ ok: false, host: HOST_NAME, error: error instanceof Error ? error.message : String(error) });
	}
}

main();

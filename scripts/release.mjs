#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHmac, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORES = { chrome, edge, firefox, safari, github };
const FIREFOX_ID = 'clipper@obsidian.md';
const SAFARI_BUNDLE_ID = 'md.obsidian.Obsidian-Web-Clipper';
const XCODE_PROJECT = join(ROOT, 'xcode/Obsidian Web Clipper/Obsidian Web Clipper.xcodeproj');
const SAFARI_PLATFORMS = [
	{ platform: 'IOS', scheme: 'Obsidian Web Clipper (iOS)', destination: 'generic/platform=iOS' },
	{ platform: 'MAC_OS', scheme: 'Obsidian Web Clipper (macOS)', destination: 'generic/platform=macOS' },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const selected = args.filter(arg => !arg.startsWith('--'));
const unknown = selected.filter(name => !STORES[name]);
if (unknown.length) {
	console.error(`Unknown store: ${unknown.join(', ')}. Choose from ${Object.keys(STORES).join(', ')}.`);
	process.exit(1);
}

loadEnv(join(ROOT, '.env'));
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

let failed = false;
for (const name of selected.length ? selected : Object.keys(STORES)) {
	console.log(`\n== ${name} ${version}${dryRun ? ' (dry run)' : ''}`);
	try {
		await STORES[name]();
	} catch (error) {
		failed = true;
		console.error(`✗ ${name}: ${error.message}`);
	}
}
process.exit(failed ? 1 : 0);

async function chrome() {
	requireEnv('CHROME_PUBLISHER_ID', 'CHROME_EXTENSION_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN');
	const publisher = env('CHROME_PUBLISHER_ID');
	const item = env('CHROME_EXTENSION_ID');
	const file = buildZip('chrome');
	const token = await googleAccessToken();
	const base = `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${item}`;
	const headers = { Authorization: `Bearer ${token}` };

	const status = await request('GET', `${base}:fetchStatus`, { headers });
	console.log(`Current status: ${JSON.stringify(status)}`);
	if (dryRun) return console.log(`Would upload ${file} and submit for review.`);

	const upload = await request('POST', `https://chromewebstore.googleapis.com/upload/v2/publishers/${publisher}/items/${item}:upload`, {
		headers: { ...headers, 'Content-Type': 'application/zip' },
		body: readFileSync(file),
	});
	if (upload.uploadState === 'FAILED') throw new Error(`Upload failed: ${JSON.stringify(upload)}`);
	if (upload.uploadState === 'IN_PROGRESS') {
		await poll('Chrome upload', async () => {
			const current = await request('GET', `${base}:fetchStatus`, { headers });
			return !JSON.stringify(current).includes('IN_PROGRESS') && current;
		});
	}
	console.log('Uploaded.');

	const result = await request('POST', `${base}:publish`, {
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
	});
	console.log(`✓ Submitted for review: ${JSON.stringify(result)}`);
}

async function googleAccessToken() {
	const response = await request('POST', 'https://oauth2.googleapis.com/token', {
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env('CHROME_CLIENT_ID'),
			client_secret: env('CHROME_CLIENT_SECRET'),
			refresh_token: env('CHROME_REFRESH_TOKEN'),
			grant_type: 'refresh_token',
		}),
	});
	return response.access_token;
}

async function edge() {
	requireEnv('EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY');
	const product = env('EDGE_PRODUCT_ID');
	const headers = { Authorization: `ApiKey ${env('EDGE_API_KEY')}`, 'X-ClientID': env('EDGE_CLIENT_ID') };
	const file = buildZip('chrome');
	const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${product}/submissions`;
	// Edge has no read-only call to check credentials.
	if (dryRun) return console.log(`Would upload ${file} and submit for review.`);

	const uploadOperation = await requestOperation('POST', `${base}/draft/package`, {
		headers: { ...headers, 'Content-Type': 'application/zip' },
		body: readFileSync(file),
	});
	await pollEdgeOperation(`${base}/draft/package/operations/${uploadOperation}`, headers, 'Edge upload');
	console.log('Uploaded.');

	const submitOperation = await requestOperation('POST', base, {
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify({ notes: `Web Clipper ${version}\n\n${releaseNotes('edge')}`.slice(0, 2000) }),
	});
	await pollEdgeOperation(`${base}/operations/${submitOperation}`, headers, 'Edge submission');
	console.log('✓ Submitted for review.');
}

async function pollEdgeOperation(url, headers, label) {
	const result = await poll(label, async () => {
		const operation = await request('GET', url, { headers });
		return operation.status !== 'InProgress' && operation;
	});
	if (result.status !== 'Succeeded') throw new Error(`${label} ${result.status}: ${JSON.stringify(result)}`);
}

async function firefox() {
	requireEnv('AMO_JWT_ISSUER', 'AMO_JWT_SECRET');
	const file = buildZip('firefox');
	const base = 'https://addons.mozilla.org/api/v5';
	const addon = `${base}/addons/addon/${encodeURIComponent(FIREFOX_ID)}`;
	const headers = () => ({ Authorization: `JWT ${amoToken()}` });

	const current = await request('GET', `${addon}/`, { headers: headers() });
	console.log(`Current listed version: ${current.current_version?.version}`);
	const notes = releaseNotes('firefox');
	if (dryRun) {
		try {
			console.log(`Would upload ${file} with source ${sourceZip()} and submit for review.`);
		} catch (error) {
			console.log(`Would upload ${file} and submit for review. Source zip not ready: ${error.message}`);
		}
		return;
	}
	const source = sourceZip();

	const form = new FormData();
	form.append('upload', fileBlob(file), `firefox-${version}.zip`);
	form.append('channel', 'listed');
	const upload = await request('POST', `${base}/addons/upload/`, { headers: headers(), body: form });
	const validated = await poll('Firefox validation', async () => {
		const result = await request('GET', `${base}/addons/upload/${upload.uuid}/`, { headers: headers() });
		return result.processed && result;
	});
	if (!validated.valid) throw new Error(`Validation failed: ${JSON.stringify(validated.validation)}`);
	console.log('Uploaded and validated.');

	const created = await request('POST', `${addon}/versions/`, {
		headers: { ...headers(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ upload: upload.uuid, release_notes: { 'en-US': notes } }),
	});
	const sourceForm = new FormData();
	sourceForm.append('source', fileBlob(source), `obsidian-web-clipper-${version}-source.zip`);
	await request('PATCH', `${addon}/versions/${created.id}/`, { headers: headers(), body: sourceForm });
	console.log(`✓ Version ${created.version} submitted for review with source code.`);
}

function amoToken() {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64url(JSON.stringify({ iss: env('AMO_JWT_ISSUER'), jti: randomUUID(), iat: now, exp: now + 60 }));
	const signature = base64url(createHmac('sha256', env('AMO_JWT_SECRET')).update(`${header}.${payload}`).digest());
	return `${header}.${payload}.${signature}`;
}

// AMO reviewers rebuild from this archive, so it must match the build.
// Same archive as the "Source code (zip)" on the GitHub release.
function sourceZip() {
	const dirty = git('status', '--porcelain', '--untracked-files=no').trim();
	if (dirty) throw new Error('Commit or stash changes first: the source zip must match the build.');
	const tagged = git('tag', '--points-at', 'HEAD').split('\n').includes(version);
	if (!tagged) throw new Error(`Tag HEAD as ${version} first: the source zip is the archive of that tag.`);
	const file = join(ROOT, 'builds', `obsidian-clipper-${version}.zip`);
	git('archive', '--format=zip', `--prefix=obsidian-clipper-${version}/`, '-o', file, version);
	return file;
}

async function safari() {
	requireEnv('ASC_KEY_ID', 'ASC_ISSUER_ID');
	if (!optionalEnv('ASC_PRIVATE_KEY') && !optionalEnv('ASC_KEY_PATH')) throw new Error('Missing ASC_PRIVATE_KEY or ASC_KEY_PATH in .env');
	const build = currentProjectVersion();
	buildZip('safari');

	const apps = await asc('GET', `/v1/apps?filter[bundleId]=${SAFARI_BUNDLE_ID}`);
	const app = apps.data[0];
	if (!app) throw new Error(`No App Store Connect app with bundle ID ${SAFARI_BUNDLE_ID}`);
	console.log(`App ${app.attributes.name} (${app.id}), version ${version} build ${build}`);
	if (dryRun) return console.log('Would archive and upload iOS and macOS builds, then submit both for review.');

	const work = mkdtempSync(join(tmpdir(), 'clipper-safari-'));
	const exportOptions = join(work, 'ExportOptions.plist');
	writeFileSync(exportOptions, exportOptionsPlist());
	// Signs with the Apple ID in Xcode → Settings → Accounts. An App Manager API key can't use cloud signing.
	for (const { scheme, destination, platform } of SAFARI_PLATFORMS) {
		if (await findBuild(app.id, platform, build)) {
			console.log(`${platform} build ${build} is already uploaded.`);
			continue;
		}
		const archive = join(work, `${platform}.xcarchive`);
		console.log(`Archiving ${scheme}…`);
		run('xcodebuild', ['archive', '-project', XCODE_PROJECT, '-scheme', scheme, '-destination', destination, '-archivePath', archive, '-allowProvisioningUpdates']);
		console.log(`Uploading ${scheme}…`);
		run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', exportOptions, '-exportPath', join(work, platform), '-allowProvisioningUpdates']);
	}

	for (const { platform } of SAFARI_PLATFORMS) {
		await submitSafariVersion(app.id, platform, build);
	}
}

async function submitSafariVersion(appId, platform, build) {
	const processed = await poll(`${platform} build processing`, async () => {
		const found = await findBuild(appId, platform, build);
		const state = found?.attributes.processingState;
		if (state === 'FAILED' || state === 'INVALID') throw new Error(`${platform} build ${build} is ${state}`);
		return state === 'VALID' && found;
	}, { interval: 30_000, timeout: 60 * 60_000 });

	const existing = await asc('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=${platform}&filter[versionString]=${version}`);
	const appVersion = existing.data[0] ?? (await asc('POST', '/v1/appStoreVersions', {
		data: {
			type: 'appStoreVersions',
			attributes: { platform, versionString: version },
			relationships: { app: { data: { type: 'apps', id: appId } } },
		},
	})).data;

	await asc('PATCH', `/v1/appStoreVersions/${appVersion.id}/relationships/build`, { data: { type: 'builds', id: processed.id } });

	const localizations = await asc('GET', `/v1/appStoreVersions/${appVersion.id}/appStoreVersionLocalizations`);
	for (const localization of localizations.data) {
		await asc('PATCH', `/v1/appStoreVersionLocalizations/${localization.id}`, {
			data: { type: 'appStoreVersionLocalizations', id: localization.id, attributes: { whatsNew: releaseNotes('safari').slice(0, 4000) } },
		});
	}

	const open = await asc('GET', `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=${platform}&filter[state]=READY_FOR_REVIEW`);
	const submission = open.data[0] ?? (await asc('POST', '/v1/reviewSubmissions', {
		data: {
			type: 'reviewSubmissions',
			attributes: { platform },
			relationships: { app: { data: { type: 'apps', id: appId } } },
		},
	})).data;
	await asc('POST', '/v1/reviewSubmissionItems', {
		data: {
			type: 'reviewSubmissionItems',
			relationships: {
				reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
				appStoreVersion: { data: { type: 'appStoreVersions', id: appVersion.id } },
			},
		},
	});
	await asc('PATCH', `/v1/reviewSubmissions/${submission.id}`, {
		data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } },
	});
	console.log(`✓ ${platform} ${version} (${build}) submitted for review.`);
}

async function findBuild(appId, platform, build) {
	const builds = await asc('GET', `/v1/builds?filter[app]=${appId}&filter[version]=${build}&filter[preReleaseVersion.platform]=${platform}`);
	return builds.data[0];
}

function asc(method, path, body) {
	return request(method, `https://api.appstoreconnect.apple.com${path}`, {
		headers: { Authorization: `Bearer ${ascToken()}`, ...(body && { 'Content-Type': 'application/json' }) },
		body: body && JSON.stringify(body),
	});
}

function ascToken() {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' }));
	const payload = base64url(JSON.stringify({ iss: env('ASC_ISSUER_ID'), iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
	const key = createPrivateKey(ascPrivateKey());
	const signature = base64url(sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }));
	return `${header}.${payload}.${signature}`;
}

// Pasted keys can lose their PEM line breaks.
function ascPrivateKey() {
	const text = optionalEnv('ASC_PRIVATE_KEY');
	if (!text) return readFileSync(env('ASC_KEY_PATH'), 'utf8');
	const body = text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
	return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function exportOptionsPlist() {
	// Otherwise Xcode overrides the numbers from bump-version.sh.
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>destination</key><string>upload</string>
	<key>teamID</key><string>6JSW4SJWN9</string>
	<key>manageAppVersionAndBuildNumber</key><false/>
	<key>uploadSymbols</key><true/>
</dict>
</plist>
`;
}

function currentProjectVersion() {
	const pbxproj = readFileSync(join(XCODE_PROJECT, 'project.pbxproj'), 'utf8');
	const versions = new Set([...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1]));
	if (versions.size !== 1 || !versions.has(version)) {
		throw new Error(`Xcode MARKETING_VERSION is ${[...versions].join(', ')}, expected ${version}. Run scripts/bump-version.sh.`);
	}
	return pbxproj.match(/CURRENT_PROJECT_VERSION = (\d+);/)[1];
}

function buildZip(browser) {
	const file = join(ROOT, 'builds', `obsidian-web-clipper-${version}-${browser}.zip`);
	if (!existsSync(file)) throw new Error(`Missing ${file}. Run npm run build:${browser}.`);
	const manifest = JSON.parse(execFileSync('unzip', ['-p', file, 'manifest.json'], { encoding: 'utf8' }));
	if (manifest.version !== version) throw new Error(`${file} contains version ${manifest.version}, expected ${version}.`);
	return file;
}

// Runs last, so the release goes up even when a store is still reviewing an older version.
async function github() {
	const files = ['chrome', 'firefox', 'safari'].map(buildZip);
	const notes = changelogFile('github');
	let exists = true;
	try {
		execFileSync('gh', ['release', 'view', version, '--json', 'url'], { cwd: ROOT, stdio: 'ignore' });
	} catch {
		exists = false;
	}
	if (exists) return console.log(`Release ${version} is already on GitHub.`);
	if (dryRun) return console.log(`Would create release ${version} from ${notes} with ${files.length} zips.`);

	run('gh', ['release', 'create', version, '--title', version, '--verify-tag', '--latest', '--notes-file', notes, ...files]);
	console.log(`✓ Published release ${version} on GitHub.`);
}

// A store-specific changelog, like changelogs/1.8.0-firefox.md, replaces the shared one.
function changelogFile(store) {
	const storeFile = join(ROOT, 'changelogs', `${version}-${store}.md`);
	const file = existsSync(storeFile) ? storeFile : join(ROOT, 'changelogs', `${version}.md`);
	if (!existsSync(file)) {
		const available = existsSync(join(ROOT, 'changelogs')) ? readdirSync(join(ROOT, 'changelogs')).join(', ') : 'none';
		throw new Error(`Missing ${file} (found: ${available}). Run scripts/generate-changelog.sh.`);
	}
	return file;
}

function releaseNotes(store) {
	return readFileSync(changelogFile(store), 'utf8')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^## (.+)$/gm, '$1:')
		.trim();
}

async function request(method, url, { headers = {}, body } = {}) {
	let response;
	for (let attempt = 1; !response; attempt++) {
		try {
			response = await fetch(url, { method, headers, body });
		} catch (error) {
			if (attempt === 3) throw new Error(`${method} ${url} → ${error.cause?.message || error.message}`);
			await new Promise(done => setTimeout(done, 2000 * attempt));
		}
	}
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${url} → ${response.status} ${text.slice(0, 500)}`);
	return text ? JSON.parse(text) : {};
}

async function requestOperation(method, url, options) {
	const response = await fetch(url, { method, ...options });
	if (response.status !== 202) throw new Error(`${method} ${url} → ${response.status} ${(await response.text()).slice(0, 500)}`);
	return response.headers.get('location').split('/').pop();
}

async function poll(label, check, { interval = 5000, timeout = 15 * 60_000 } = {}) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const result = await check();
		if (result) return result;
		process.stdout.write(`Waiting for ${label}…\r`);
		await new Promise(done => setTimeout(done, interval));
	}
	throw new Error(`Timed out waiting for ${label}`);
}

function loadEnv(file) {
	if (!existsSync(file)) return;
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
	}
}

function requireEnv(...names) {
	const missing = names.filter(name => !optionalEnv(name));
	if (missing.length) throw new Error(`Missing ${missing.join(', ')} in .env`);
}

function env(name) {
	const value = optionalEnv(name);
	if (!value) throw new Error(`Missing ${name} in .env`);
	return value;
}

function optionalEnv(name) {
	const value = process.env[name];
	if (!value?.startsWith('op://')) return value ?? '';
	try {
		process.env[name] = execFileSync('op', ['read', '--no-newline', value], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (error) {
		throw new Error(`Couldn't read ${name} from 1Password: ${error.stderr?.toString().trim() || error.message}`);
	}
	return process.env[name];
}

function fileBlob(file) {
	return new Blob([readFileSync(file)], { type: 'application/zip' });
}

function base64url(value) {
	return Buffer.from(value).toString('base64url');
}

function git(...gitArgs) {
	return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
}

function run(command, commandArgs) {
	execFileSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit' });
}

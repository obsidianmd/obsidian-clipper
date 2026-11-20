// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Exercise the actual handler without starting the popup's browser listeners.
const source = readFileSync('src/core/popup.ts', 'utf8');
const ast = ts.createSourceFile('popup.ts', source, ts.ScriptTarget.Latest, true);
const handler = ast.statements.find(statement =>
	ts.isFunctionDeclaration(statement) && statement.name?.text === 'handleClipObsidian');
if (!handler) throw new Error('handleClipObsidian was not found');
const handlerCode = ts.transpileModule(handler.getText(ast), {
	compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

function setup(isSidePanel = false) {
	document.body.innerHTML = `
		<select id="vault-select"><option>Test vault</option></select>
		<textarea id="note-content-field">Content</textarea>
		<input id="note-name-field" value="Test note">
		<input id="path-name-field" value="Clippings">
		<button id="clip-btn">Add to Obsidian</button>
		<button id="interpret-btn"></button>`;
	const dependencies = {
		document,
		window: { close: vi.fn() },
		setTimeout,
		console: { error: vi.fn() },
		currentTemplate: { behavior: 'create', vault: '' },
		isSidePanel,
		generalSettings: { interpreterEnabled: false },
		collectPromptVariables: vi.fn(() => [] as string[]),
		waitForInterpreter: vi.fn(async () => {}),
		getPropertiesFromDOM: vi.fn(() => []),
		generateFrontmatter: vi.fn(async () => '---\n---\n'),
		saveToObsidian: vi.fn(async () => {}),
		getCurrentTabInfo: vi.fn(async () => ({ url: 'https://example.com', title: 'Example' })),
		incrementStat: vi.fn(async () => {}),
		setLocalStorage: vi.fn(async () => {}),
		showError: vi.fn(),
	};
	const clip = new Function(...Object.keys(dependencies), `
		let isClipping = false;
		let lastSelectedVault = null;
		${handlerCode}
		return handleClipObsidian;
	`)(...Object.values(dependencies)) as () => Promise<void>;
	const button = document.getElementById('clip-btn') as HTMLButtonElement;
	button.onclick = () => { void clip(); };
	return { ...dependencies, clip, button };
}

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('Obsidian clipping concurrency', () => {
	it('saves only once for rapid button clicks and quick-clip calls', async () => {
		const app = setup();
		const pending = deferred();
		app.generateFrontmatter.mockImplementation(async () => {
			await pending.promise;
			return '---\n---\n';
		});
		app.button.click();
		app.button.click();
		await app.clip(); // The shortcut bypasses the disabled button.
		expect(app.generateFrontmatter).toHaveBeenCalledOnce();
		expect(app.button.disabled).toBe(true);
		pending.resolve();
		await vi.waitFor(() => expect(app.setLocalStorage).toHaveBeenCalledOnce());
		expect(app.saveToObsidian).toHaveBeenCalledExactlyOnceWith(
			'---\n---\nContent', 'Test note', 'Clippings', 'Test vault', 'create');
	});

	it('keeps the popup locked throughout its closing delay', async () => {
		vi.useFakeTimers();
		const app = setup();
		await app.clip();
		await app.clip();
		await vi.advanceTimersByTimeAsync(499);
		await app.clip();
		expect(app.saveToObsidian).toHaveBeenCalledOnce();
		expect(app.button.disabled).toBe(true);
		expect(app.window.close).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(app.window.close).toHaveBeenCalledOnce();
	});

	it('blocks concurrent side-panel saves but permits the next completed clip', async () => {
		const app = setup(true);
		const pending = deferred();
		app.saveToObsidian.mockImplementationOnce(() => pending.promise);
		const first = app.clip();
		await app.clip();
		pending.resolve();
		await first;
		expect(app.saveToObsidian).toHaveBeenCalledOnce();
		expect(app.button.disabled).toBe(false);
		await app.clip();
		expect(app.saveToObsidian).toHaveBeenCalledTimes(2);
		expect(app.window.close).not.toHaveBeenCalled();
	});

	it.each(['generateFrontmatter', 'saveToObsidian'] as const)('allows retry after %s fails', async failingStep => {
		const app = setup();
		const error = new Error('Save failed');
		app[failingStep].mockRejectedValueOnce(error);
		await expect(app.clip()).rejects.toThrow(error);
		expect(app.button.disabled).toBe(false);
		expect(app.showError).toHaveBeenCalledWith('failedToSaveFile');
		await app.clip();
		expect(app.setLocalStorage).toHaveBeenCalledOnce();
	});

	it('restores a previously disabled button after a failed shortcut save', async () => {
		const app = setup();
		app.button.disabled = true;
		app.saveToObsidian.mockRejectedValueOnce(new Error('Save failed'));
		await expect(app.clip()).rejects.toThrow('Save failed');
		expect(app.button.disabled).toBe(true);
	});

	it('does not lock the handler when required fields are missing', async () => {
		const app = setup(true);
		const content = document.getElementById('note-content-field')!;
		content.remove();
		await app.clip();
		expect(app.saveToObsidian).not.toHaveBeenCalled();
		expect(app.button.disabled).toBe(false);
		document.body.appendChild(content);
		await app.clip();
		expect(app.saveToObsidian).toHaveBeenCalledOnce();
	});

	it('blocks additional triggers while waiting for the interpreter', async () => {
		const app = setup(true);
		app.generalSettings.interpreterEnabled = true;
		app.collectPromptVariables.mockReturnValue(['prompt']);
		const pending = deferred();
		app.waitForInterpreter.mockImplementation(() => pending.promise);
		const first = app.clip();
		await app.clip();
		expect(app.waitForInterpreter).toHaveBeenCalledOnce();
		expect(app.saveToObsidian).not.toHaveBeenCalled();
		pending.resolve();
		await first;
		expect(app.saveToObsidian).toHaveBeenCalledOnce();
	});
});

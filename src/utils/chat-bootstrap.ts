import { Template, ModelConfig } from '../types/types';
import { compileTemplate } from './template-compiler';
import { generalSettings, saveSettings } from './storage-utils';
import { unescapeValue } from './string-utils';
import { ChatEngine, ChatState, ChatTurn } from './chat';
import { ChatUI, hasChatVariable } from './chat-ui';
import { extractChatSnippets, extractChatSystem, extractChatContext, stripChatSnippets } from './chat-snippets';

export interface ChatBootstrapHost {
	getCurrentUrl: () => Promise<string>;
	writeVariables: (turns: ChatTurn[] | null) => void;
	refreshFields: () => Promise<void>;
	onCollapse?: (collapsed: boolean) => void;
}

export interface ChatInitOptions {
	template: Template;
	variables: { [key: string]: any };
	tabId: number;
	host: ChatBootstrapHost;
}

export interface ChatController {
	waitUntilIdle: () => Promise<void>;
	dispose: () => void;
}

export function shouldShowChat(template: Template): boolean {
	return hasChatVariable(template.noteContentFormat || '', template.properties);
}

export async function initChat(opts: ChatInitOptions): Promise<ChatController | null> {
	const { template, variables, tabId, host } = opts;

	const chatContainer = document.getElementById('chat');
	const clipperFooter = document.querySelector('.clipper-footer');
	const clipperEl = document.querySelector('.clipper');

	function cleanupAndReturnNull(): null {
		disposeCurrent();
		if (chatContainer) chatContainer.style.display = 'none';
		clipperFooter?.classList.remove('has-chat');
		clipperEl?.classList.remove('has-chat', 'chat-collapsed');
		host.writeVariables(null);
		return null;
	}

	if (!hasChatVariable(template.noteContentFormat || '', template.properties) || !chatContainer) {
		return cleanupAndReturnNull();
	}

	const enabledModels = generalSettings.models.filter(m => m.enabled);

	const modelId = generalSettings.interpreterModel || enabledModels[0]?.id || '';
	const modelConfig = generalSettings.models.find(m => m.id === modelId) || enabledModels[0];

	const currentUrl = await host.getCurrentUrl();

	const defaultContext =
`Title: {{title}}
URL: {{url}}
Author: {{author}}
Published: {{published}}

Page content:
{{content}}

Selected text:
{{selection}}`;

	const chatContextRaw = extractChatContext(template.noteContentFormat || '', template.properties) || defaultContext;
	const compiledContext = await compileTemplate(tabId, chatContextRaw, variables, currentUrl);

	const systemRaw = extractChatSystem(template.noteContentFormat || '', template.properties);
	const compiledSystem = systemRaw
		? await compileTemplate(tabId, systemRaw, variables, currentUrl)
		: undefined;

	const rawSnippets = extractChatSnippets(template.noteContentFormat || '', template.properties);
	const compiledSnippets = await Promise.all(rawSnippets.map(async snippet => {
		const compiled = await compileTemplate(tabId, snippet.raw, variables, currentUrl);
		return { ...snippet, content: compiled };
	}));

	disposeCurrent();

	const engine = new ChatEngine(compiledContext, modelConfig || {} as ModelConfig, compiledSystem);
	currentEngine = engine;

	host.writeVariables(engine.getState().turns);

	const ui = new ChatUI({
		container: chatContainer,
		engine,
		onChange: async (_state: ChatState) => {
			host.writeVariables(engine.getState().turns);
			await host.refreshFields();
		},
		onModelChange: (model: ModelConfig) => {
			engine.setModel(model);
			generalSettings.interpreterModel = model.id;
			saveSettings();
		},
		onClear: () => {
			host.writeVariables(engine.getState().turns);
		},
		onCollapse: (collapsed: boolean) => {
			clipperEl?.classList.toggle('chat-collapsed', collapsed);
			clipperFooter?.classList.toggle('chat-collapsed', collapsed);
			host.onCollapse?.(collapsed);
		},
		models: enabledModels,
		initialModelId: modelId,
		snippets: compiledSnippets
	});

	currentUI = ui;
	ui.bind();
	chatContainer.style.display = 'flex';
	clipperFooter?.classList.add('has-chat');
	clipperEl?.classList.add('has-chat');
	clipperEl?.classList.remove('chat-collapsed');
	clipperFooter?.classList.remove('chat-collapsed');

	host.writeVariables(engine.getState().turns);
	await host.refreshFields();

	const controller: ChatController = {
		waitUntilIdle: () => engine.waitUntilIdle(),
		dispose: () => {
			disposeCurrent();
			chatContainer.style.display = 'none';
			clipperFooter?.classList.remove('has-chat', 'chat-collapsed');
			clipperEl?.classList.remove('has-chat', 'chat-collapsed');
			host.writeVariables(null);
		}
	};

	return controller;
}

let currentEngine: ChatEngine | null = null;
let currentUI: ChatUI | null = null;

function disposeCurrent(): void {
	if (currentUI) {
		currentUI.unbind();
		currentUI = null;
	}
	if (currentEngine) {
		currentEngine.clear();
		currentEngine = null;
	}
}

export function stripChat(templateString: string): string {
	return stripChatSnippets(templateString);
}

export function stripChatFromProperty(value: string): string {
	return stripChatSnippets(unescapeValue(value));
}

export { hasChatVariable };
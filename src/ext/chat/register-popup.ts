/**
 * Popup-side registration for the chat plugin.
 *
 * This module wires the chat engine/UI into the popup via the plugin system
 * (`src/core/plugin-system.ts`). It owns all chat-related popup state that
 * previously lived in `src/core/popup.ts`, so the original popup no longer
 * needs to import or know about chat.
 */

import { Template, ModelConfig } from '../../types/types';
import { compileTemplate } from '../../utils/template-compiler';
import { generalSettings, saveSettings } from '../../utils/storage-utils';
import { unescapeValue } from '../../utils/string-utils';
import { formatPropertyValue } from '../../utils/shared';
import { icons } from '../../icons/icons';
import { ChevronUp, MessageSquare, FileText, Languages, ScanLine, HelpCircle, Heading } from 'lucide';
import { injectStyles, PopupPluginContext } from '../../core/plugin-system';
import { ChatEngine, ChatState, ChatTurn } from './chat-engine';
import { ChatUI, hasChatVariable } from './chat-ui';
import { extractChatSnippets, extractChatSystem, extractChatContext, stripChatSnippets } from './chat-snippets';
import { chatStyles } from './chat-styles';
import { chatTemplate } from './chat-template';
import { applyChatTranslations } from './chat-i18n';

export interface ChatController {
	waitUntilIdle: () => Promise<void>;
	dispose: () => void;
}

// --- Module-level state (previously hosted in popup.ts) ---
let currentEngine: ChatEngine | null = null;
let currentUI: ChatUI | null = null;
let currentChatController: ChatController | null = null;
let currentTemplate: Template | null = null;
let currentVariables: { [key: string]: any } = {};
let currentTabId: number | undefined;
let currentUrl: string = '';
let initialized = false;

function writeChatVariables(turns: ChatTurn[] | null): void {
	const chatTurns = turns || [];
	const visibleTurns = chatTurns.filter(turn => (turn.role === 'assistant' ? turn.content : true));
	currentVariables['chat'] = visibleTurns;
	currentVariables['{{chat}}'] = visibleTurns;
}

async function refreshChatDependentFields(): Promise<void> {
	if (!currentTemplate || !currentTabId) return;
	const tabId = currentTabId;

	const cleanNoteContent = stripChatSnippets(currentTemplate.noteContentFormat || '');
	const cleanProperties = currentTemplate.properties.map(p => ({ ...p, value: stripChatSnippets(unescapeValue(p.value)) }));

	const [compiledContent, ...compiledProperties] = await Promise.all([
		cleanNoteContent
			? compileTemplate(tabId, cleanNoteContent, currentVariables, currentUrl)
			: Promise.resolve(''),
		...cleanProperties.map(p =>
			compileTemplate(tabId, unescapeValue(p.value), currentVariables, currentUrl)
		)
	]);

	const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
	if (noteContentField && currentTemplate.noteContentFormat) {
		noteContentField.value = compiledContent;
	}

	for (let i = 0; i < cleanProperties.length; i++) {
		const property = cleanProperties[i];
		const inputElement = document.getElementById(property.name) as HTMLInputElement;
		if (!inputElement) continue;

		let value = compiledProperties[i];
		const propertyType = inputElement.getAttribute('data-type') || 'text';
		value = formatPropertyValue(value, propertyType, property.value);

		if (propertyType === 'checkbox') {
			inputElement.checked = value === 'true';
		} else {
			inputElement.value = value;
		}
	}
}

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

/**
 * The main icons object in `icons.ts` is a fixed set. Chat uses a few extra
 * lucide icons (notably `chevron-up` for the collapse button, plus snippet
 * icons). We augment the shared object at init so that `initializeIcons()`
 * calls from chat-ui / chat-snippets render every icon the chat needs,
 * without modifying `icons.ts`.
 */
function registerChatIcons(): void {
	(icons as any).ChevronUp = ChevronUp;
	(icons as any).MessageSquare = MessageSquare;
	(icons as any).FileText = FileText;
	(icons as any).Languages = Languages;
	(icons as any).ScanLine = ScanLine;
	(icons as any).HelpCircle = HelpCircle;
	(icons as any).Heading = Heading;
}

function injectChatDom(): HTMLElement | null {
	const existing = document.getElementById('chat');
	if (existing) return existing;

	const clipperFooter = document.querySelector('.clipper-footer');
	if (!clipperFooter) return null;

	const template = document.createElement('template');
	template.innerHTML = chatTemplate.trim();
	const chatNode = template.content.firstElementChild as HTMLElement | null;
	if (!chatNode) return null;

	const actionButtons = clipperFooter.querySelector('.action-buttons');
	if (actionButtons) {
		clipperFooter.insertBefore(chatNode, actionButtons);
	} else {
		clipperFooter.appendChild(chatNode);
	}
	return chatNode;
}

/**
 * Plugin init: inject styles, register icons, mount the chat DOM, apply
 * translations. Called once when the popup is initializing.
 */
export async function initChatPlugin(): Promise<void> {
	if (initialized) return;
	initialized = true;

	injectStyles('chat-styles', chatStyles);
	registerChatIcons();

	const chatNode = injectChatDom();
	if (chatNode) {
		applyChatTranslations(chatNode);
	}
}

/**
 * Called by the popup whenever a template is loaded/switched. Sets up (or
 * tears down) the chat engine + UI based on whether the template contains a
 * chat variable.
 */
export async function onTemplateChange(
	template: Template,
	variables: { [key: string]: any },
	ctx: PopupPluginContext
): Promise<void> {
	currentTemplate = template;
	currentVariables = variables;
	currentTabId = ctx.tabId;
	currentUrl = ctx.currentUrl || '';

	const chatContainer = document.getElementById('chat');
	const clipperFooter = document.querySelector('.clipper-footer');
	const clipperEl = document.querySelector('.clipper');

	const cleanupAndReturn = (): void => {
		disposeCurrent();
		currentChatController = null;
		if (chatContainer) chatContainer.style.display = 'none';
		clipperFooter?.classList.remove('has-chat');
		clipperEl?.classList.remove('has-chat', 'chat-collapsed');
		writeChatVariables(null);
	};

	if (!hasChatVariable(template.noteContentFormat || '', template.properties) || !chatContainer) {
		cleanupAndReturn();
		return;
	}

	const enabledModels = generalSettings.models.filter(m => m.enabled);
	const modelId = generalSettings.interpreterModel || enabledModels[0]?.id || '';
	const modelConfig = generalSettings.models.find(m => m.id === modelId) || enabledModels[0];

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
	const compiledContext = currentTabId
		? await compileTemplate(currentTabId, chatContextRaw, currentVariables, currentUrl)
		: chatContextRaw;

	const systemRaw = extractChatSystem(template.noteContentFormat || '', template.properties);
	const compiledSystem = systemRaw && currentTabId
		? await compileTemplate(currentTabId, systemRaw, currentVariables, currentUrl)
		: systemRaw;

	const rawSnippets = extractChatSnippets(template.noteContentFormat || '', template.properties);
	const compiledSnippets = await Promise.all(rawSnippets.map(async snippet => {
		const compiled = currentTabId
			? await compileTemplate(currentTabId, snippet.raw, currentVariables, currentUrl)
			: snippet.raw;
		return { ...snippet, content: compiled };
	}));

	disposeCurrent();

	const engine = new ChatEngine(compiledContext, modelConfig || ({} as ModelConfig), compiledSystem);
	currentEngine = engine;

	writeChatVariables(engine.getState().turns);

	const ui = new ChatUI({
		container: chatContainer,
		engine,
		onChange: async (_state: ChatState) => {
			writeChatVariables(engine.getState().turns);
			await refreshChatDependentFields();
		},
		onModelChange: (model: ModelConfig) => {
			engine.setModel(model);
			generalSettings.interpreterModel = model.id;
			saveSettings();
		},
		onClear: () => {
			writeChatVariables(engine.getState().turns);
		},
		onCollapse: (collapsed: boolean) => {
			clipperEl?.classList.toggle('chat-collapsed', collapsed);
			clipperFooter?.classList.toggle('chat-collapsed', collapsed);
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

	writeChatVariables(engine.getState().turns);
	await refreshChatDependentFields();

	currentChatController = {
		waitUntilIdle: () => engine.waitUntilIdle(),
		dispose: () => {
			disposeCurrent();
			currentChatController = null;
			chatContainer.style.display = 'none';
			clipperFooter?.classList.remove('has-chat', 'chat-collapsed');
			clipperEl?.classList.remove('has-chat', 'chat-collapsed');
			writeChatVariables(null);
		}
	};
}

/**
 * Called by the popup before clipping. Ensures any in-flight chat request has
 * settled so its output is reflected in the clipped note.
 */
export async function beforeClip(): Promise<void> {
	if (!currentChatController) return;
	try {
		await currentChatController.waitUntilIdle();
	} catch (e) {
		console.warn('Chat request failed before clipping:', e);
	}
}

/** Dispose everything (popup unload). */
export function disposeChatPlugin(): void {
	disposeCurrent();
	currentChatController = null;
	currentTemplate = null;
}

/**
 * Chat module entry point.
 *
 * Re-exports the public API of the modularized AI chat feature. External
 * callers (e.g. `src/ext/index.ts` via dynamic import, or future consumers)
 * should import from here rather than reaching into individual sub-files.
 *
 * The popup-side plugin surface lives in `./register-popup`; the engine, UI,
 * LLM client, snippets, styles, template and i18n are exposed for reuse
 * (settings page, side panel, tests, etc.).
 */

export {
	initChatPlugin,
	onTemplateChange,
	beforeClip,
	disposeChatPlugin
} from './register-popup';
export type { ChatController } from './register-popup';

export { ChatEngine, createChatProxy } from './chat-engine';
export type { ChatTurn, ChatState, ChatStatus } from './chat-engine';

export { ChatUI, hasChatVariable } from './chat-ui';
export type { ChatUIOptions } from './chat-ui';

export { chatComplete, getLastRequestTime, resetRateLimit } from './chat-llm';
export type { ChatMessage, ChatCompleteOptions } from './chat-llm';

export {
	stripChatSnippets,
	validateChatVariables,
	extractChatSystem,
	extractChatContext,
	extractChatSnippets,
	SnippetPicker
} from './chat-snippets';
export type { ChatSnippet, ChatValidationError } from './chat-snippets';

export { t, applyChatTranslations } from './chat-i18n';
export { chatStyles } from './chat-styles';
export { chatTemplate } from './chat-template';

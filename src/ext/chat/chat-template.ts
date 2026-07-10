/**
 * Chat DOM template, extracted from `src/popup.html`.
 *
 * The chat panel is injected into `.clipper-footer` (before `.action-buttons`)
 * at runtime by `register-popup.ts`, so `popup.html` no longer needs to ship
 * the `#chat` markup.
 */
export const chatTemplate = `
<div id="chat" style="display: none;">
	<div id="chat-header" class="chat-header">
		<span class="chat-title" data-i18n="chatTitle">Chat</span>
		<div class="spacer"></div>
		<button id="chat-clear-btn" type="button" class="chat-icon-btn" data-i18n-title="chatClear">
			<i data-lucide="trash-2"></i>
		</button>
		<button id="chat-collapse-btn" type="button" class="chat-icon-btn" data-i18n-title="chatCollapse">
			<i data-lucide="chevron-down"></i>
		</button>
	</div>
	<div id="chat-messages" class="chat-messages"></div>
	<textarea id="chat-input" rows="2" data-i18n="chatInputPlaceholder" placeholder="Ask AI..."></textarea>
	<div class="chat-controls">
		<select id="chat-model-select" style="display: none;"></select>
		<button id="chat-send-btn" type="button" class="chat-send-btn" data-i18n="send"></button>
		<span id="chat-timer" class="chat-status" style="display: none;"></span>
	</div>
</div>
<div id="chat-snippet-menu" class="chat-snippet-menu" style="display: none;"></div>
`;

/**
 * Chat styles as a flat CSS string.
 *
 * These styles were originally in `src/styles/chat.scss` (SCSS with nesting).
 * They have been expanded into plain CSS so they can be injected at runtime
 * via a <style> tag (no sass compilation required), keeping the chat module
 * fully decoupled from the main style.scss pipeline.
 */
export const chatStyles = `
.clipper #chat {
	--chat-bg: hsla(var(--color-accent-hsl), 0.075);
	--chat-border: hsla(var(--color-accent-hsl), 0.15);
	--chat-text: var(--text-accent);
	--chat-muted: var(--text-muted);
	--chat-max-height: calc(100vh - 4rem);
	--chat-min-height: 4rem;

	display: none;
	flex-direction: column;
	flex: 1 1 auto;
	min-height: var(--chat-min-height);
	max-height: var(--chat-max-height);
	border-radius: 4px;
	background-color: var(--chat-bg);
	border: 1px solid var(--chat-border);
	overflow: hidden;
}

.clipper #chat.sending {
	--chat-border: hsla(var(--color-accent-hsl), 0.35);
}

.clipper #chat.error {
	--chat-bg: var(--background-modifier-error);
	--chat-border: var(--background-modifier-error-border);
	--chat-text: var(--text-error);
}

.clipper #chat.is-collapsed {
	flex: 0 0 auto !important;
	min-height: auto !important;
	max-height: none !important;
	height: auto !important;
}

.clipper #chat.is-collapsed .chat-messages,
.clipper #chat.is-collapsed #chat-snippet-menu {
	display: none !important;
}

.clipper .chat-header {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.25rem 0.5rem;
	border-bottom: 1px solid var(--chat-border);
	flex-shrink: 0;
	min-height: 1.75rem;
}

.clipper .chat-header .chat-title {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--chat-text);
	letter-spacing: 0.02em;
	white-space: nowrap;
	flex-shrink: 0;
	text-transform: uppercase;
}

.clipper .chat-header .spacer {
	flex: 1;
}

.clipper .chat-icon-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.25rem;
	height: 1.25rem;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--chat-muted);
	cursor: pointer;
	border-radius: 3px;
	opacity: 0.7;
}

.clipper .chat-icon-btn i,
.clipper .chat-icon-btn svg.lucide-icon {
	width: 0.75rem;
	height: 0.75rem;
}

@media (hover: hover) {
	.clipper .chat-icon-btn:hover {
		opacity: 1;
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
	}
}

.clipper .chat-messages {
	flex: 1 1 auto;
	min-height: 0;
	max-height: none;
	overflow-y: auto;
	padding: 0.25rem 0;
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.clipper .chat-messages::-webkit-scrollbar {
	width: 5px;
}

.clipper .chat-messages::-webkit-scrollbar-thumb {
	background-color: var(--background-modifier-border);
	border-radius: 3px;
}

.clipper .chat-messages::-webkit-scrollbar-thumb:hover {
	background-color: hsla(var(--color-accent-hsl), 0.35);
}

.clipper .chat-messages:empty::before {
	content: attr(data-empty-text);
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	color: var(--chat-muted);
	font-size: var(--font-ui-smaller);
	text-align: center;
	font-style: italic;
}

.clipper .chat-messages .chat-turn {
	display: block;
	width: 100%;
	padding: 0.25rem 0.5rem;
	font-size: 12px;
	line-height: 1.45;
	color: var(--text-normal);
	word-wrap: break-word;
	overflow-wrap: break-word;
	border-radius: 4px;
}

.clipper .chat-messages .chat-turn + .chat-turn {
	border-top: none;
}

.clipper .chat-messages .chat-turn.is-user {
	background-color: hsla(var(--color-accent-hsl), 0.08);
	border-left: 2px solid var(--color-accent);
	white-space: pre-wrap;
}

.clipper .chat-messages .chat-turn.is-user + .chat-turn {
	border-top: none;
}

.clipper .chat-messages .chat-turn.is-error {
	display: flex;
	align-items: flex-start;
	gap: 0.4rem;
	padding: 0.35rem 0.5rem;
	background-color: var(--background-modifier-error);
	border-left: 2px solid var(--background-modifier-error-border);
	border-radius: 3px;
	margin: 0.25rem 0.5rem;
	width: calc(100% - 1rem);
	color: var(--text-error);
	font-size: 11px;
	line-height: 1.4;
}

.clipper .chat-messages .chat-turn.is-error .chat-error-icon {
	flex-shrink: 0;
	margin-top: 1px;
	color: var(--text-error);
	opacity: 0.8;
}

.clipper .chat-messages .chat-turn.is-error .chat-error-text {
	flex: 1;
	word-wrap: break-word;
	overflow-wrap: break-word;
}

.clipper .chat-messages .chat-turn.is-assistant {
	white-space: normal;
	background-color: transparent;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-p {
	margin: 0 0 0.3rem 0;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-p:last-child {
	margin-bottom: 0;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-h {
	font-weight: 600;
	font-size: 13px;
	margin: 0.4rem 0 0.2rem 0;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-h:first-child {
	margin-top: 0;
}

.clipper .chat-messages .chat-turn.is-assistant h1.chat-md-h { font-size: 16px; }
.clipper .chat-messages .chat-turn.is-assistant h2.chat-md-h { font-size: 15px; }
.clipper .chat-messages .chat-turn.is-assistant h3.chat-md-h { font-size: 14px; }
.clipper .chat-messages .chat-turn.is-assistant h4.chat-md-h { font-size: 13px; }
.clipper .chat-messages .chat-turn.is-assistant h5.chat-md-h { font-size: 12px; }
.clipper .chat-messages .chat-turn.is-assistant h6.chat-md-h { font-size: 11px; }

.clipper .chat-messages .chat-turn.is-assistant .chat-md-ul,
.clipper .chat-messages .chat-turn.is-assistant .chat-md-ol {
	margin: 0.15rem 0;
	padding-left: 1.1rem;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-ul { list-style: disc; }
.clipper .chat-messages .chat-turn.is-assistant .chat-md-ol { list-style: decimal; }
.clipper .chat-messages .chat-turn.is-assistant .chat-md-li { margin: 0.05rem 0; }

.clipper .chat-messages .chat-turn.is-assistant .chat-md-code {
	font-family: var(--font-monospace-default);
	font-size: 0.85em;
	background-color: hsla(var(--color-accent-hsl), 0.1);
	color: var(--text-accent);
	padding: 0.1em 0.3em;
	border-radius: 3px;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-codeblock {
	margin: 0.3rem 0;
	padding: 0.4rem 0.5rem;
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	overflow-x: auto;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-codeblock code {
	font-family: var(--font-monospace-default);
	font-size: 11px;
	white-space: pre;
	color: var(--text-normal);
	background: none;
	padding: 0;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-hr {
	border: none;
	border-top: 1px solid var(--background-modifier-border);
	margin: 0.4rem 0;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-table {
	width: 100%;
	border-collapse: collapse;
	margin: 0.3rem 0;
	font-size: 11px;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-table th,
.clipper .chat-messages .chat-turn.is-assistant .chat-md-table td {
	border: 1px solid var(--background-modifier-border);
	padding: 0.2rem 0.4rem;
	text-align: left;
}

.clipper .chat-messages .chat-turn.is-assistant .chat-md-table th {
	background-color: var(--background-secondary);
	font-weight: 600;
}

.clipper .chat-messages .chat-turn.is-assistant blockquote {
	margin: 0.2rem 0;
	padding: 0.05rem 0 0.05rem 0.5rem;
	border-left: 2px solid var(--background-modifier-border);
	color: var(--chat-muted);
}

.clipper .chat-messages .chat-turn.is-assistant a {
	color: var(--text-accent);
	text-decoration: underline;
	text-underline-offset: 2px;
}

.clipper .chat-messages .chat-turn.is-assistant strong { font-weight: 600; }
.clipper .chat-messages .chat-turn.is-assistant em { font-style: italic; }

.clipper #chat-input {
	display: block;
	width: 100%;
	min-height: 2.25rem;
	max-height: 96px;
	resize: none;
	padding: 0.375rem 0.625rem;
	border: none;
	border-top: 1px solid var(--chat-border);
	border-radius: 0;
	background-color: transparent;
	color: var(--text-normal);
	font-size: var(--font-ui-smaller);
	font-family: var(--font-default);
	line-height: 1.5;
	overflow-y: auto;
	flex-shrink: 0;
	transition: box-shadow var(--duration-fast) ease;
}

.clipper #chat-input:focus {
	outline: none;
	box-shadow: inset 0 0 0 2px hsla(var(--color-accent-hsl), 0.15);
}

.clipper #chat-input:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.clipper #chat-input::placeholder {
	color: var(--chat-muted);
}

.clipper .chat-snippet-menu {
	position: absolute;
	bottom: calc(100% + 4px);
	left: 0.5rem;
	right: 0.5rem;
	max-height: 200px;
	overflow-y: auto;
	background-color: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
	z-index: 100;
}

.clipper .chat-snippet-menu .chat-snippet-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.375rem 0.625rem;
	cursor: pointer;
	font-size: var(--font-ui-smaller);
	color: var(--text-normal);
}

.clipper .chat-snippet-menu .chat-snippet-item i,
.clipper .chat-snippet-menu .chat-snippet-item svg.lucide-icon {
	width: 0.875rem;
	height: 0.875rem;
	flex-shrink: 0;
	color: var(--chat-muted);
}

.clipper .chat-snippet-menu .chat-snippet-item .chat-snippet-label {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

@media (hover: hover) {
	.clipper .chat-snippet-menu .chat-snippet-item:hover {
		background-color: var(--background-modifier-hover);
	}
}

.clipper .chat-snippet-menu .chat-snippet-item.is-selected {
	background-color: hsla(var(--color-accent-hsl), 0.1);
}

.clipper .chat-snippet-menu .chat-snippet-item.is-selected i,
.clipper .chat-snippet-menu .chat-snippet-item.is-selected svg.lucide-icon {
	color: var(--text-accent);
}

.clipper .chat-snippet-menu::-webkit-scrollbar { width: 5px; }

.clipper .chat-snippet-menu::-webkit-scrollbar-thumb {
	background-color: var(--background-modifier-border);
	border-radius: 3px;
}

.clipper .chat-controls {
	display: flex;
	align-items: center;
	padding: 0.25rem 0.5rem;
	padding-inline-end: 0.625rem;
	gap: 0.25rem;
	flex-shrink: 0;
	border-top: 1px solid var(--chat-border);
}

.clipper #chat-model-select {
	user-select: none;
	-webkit-user-select: none;
	cursor: default;
	font-variant: tabular-nums;
	background-image: none;
	background-color: transparent;
	color: var(--chat-text);
	font-family: var(--font-monospace-default);
	height: 1.5rem;
	appearance: none;
	border: none;
	border-radius: 4px;
	box-shadow: none;
	flex-shrink: 1;
	max-width: 50%;
	font-size: 0.6875rem;
	padding: 0;
	padding-inline-end: 1.25rem;
	text-overflow: ellipsis;
	opacity: 0.75;
}

.clipper #chat-model-select:active,
.clipper #chat-model-select:focus {
	box-shadow: none;
}

@media (hover: hover) {
	.clipper #chat-model-select:hover {
		opacity: 1;
	}
}

.clipper #chat-timer {
	user-select: none;
	-webkit-user-select: none;
	cursor: default;
	font-size: 0.75rem;
	color: var(--chat-text);
	min-width: 2rem;
	text-align: end;
	font-family: var(--font-monospace-default);
	font-variant: tabular-nums;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	line-height: 1.5rem;
	flex: 0 1 auto;
}

.clipper .chat-send-btn {
	cursor: default;
	user-select: none;
	-webkit-user-select: none;
	font-family: var(--font-monospace-default);
	font-weight: 600;
	font-size: 0.75rem;
	height: 1.5rem;
	padding: 0;
	box-shadow: none;
	width: auto;
	white-space: nowrap;
	background-color: transparent;
	flex-grow: 1;
	text-align: end;
	color: var(--chat-text);
}

@media (hover: hover) {
	.clipper .chat-send-btn:hover {
		color: var(--color-accent-3);
	}
}

.clipper .chat-send-btn.is-stopping {
	cursor: default;
	color: var(--chat-text);
}

@media (hover: hover) {
	.clipper .chat-send-btn.is-stopping:hover {
		color: var(--chat-text);
	}
}

.clipper .chat-send-btn.is-error {
	cursor: default;
	color: var(--text-error);
}

@media (hover: hover) {
	.clipper .chat-send-btn.is-error:hover {
		color: var(--text-error);
	}
}

/* === Popup layout adjustments when chat is present === */

/* When chat is expanded, hide note content & properties to maximize chat area */
.clipper:has(.clipper-footer.has-chat:not(.chat-collapsed)) #note-name-field,
.clipper:has(.clipper-footer.has-chat:not(.chat-collapsed)) .metadata-properties-header,
.clipper:has(.clipper-footer.has-chat:not(.chat-collapsed)) .metadata-properties,
.clipper:has(.clipper-footer.has-chat:not(.chat-collapsed)) #note-content-container {
	display: none !important;
}

.clipper #note-content-container {
	flex-direction: column;
	min-height: 0;
	overflow: hidden;
}

.clipper #note-content-container #note-content-field {
	flex: 1 1 auto;
	min-height: 0;
}

.clipper .clipper-footer {
	overflow: hidden;
}

.clipper .clipper-footer.has-chat:not(.chat-collapsed) {
	flex: 1 1 auto;
	min-height: 0;
}

/* === Mobile layout adjustments for chat === */
@media (max-width: 600px) {
	.clipper .clipper-footer.has-chat {
		position: relative;
		will-change: unset;
		max-height: 65vh;
		overflow-y: auto;
		overflow-x: hidden;
		transition: none;
	}

	.clipper .clipper-footer.has-chat #chat {
		max-height: 35vh;
	}
}
`;

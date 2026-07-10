/**
 * Self-contained i18n for the chat module.
 *
 * These translations are extracted from `src/_locales/{en,zh_CN}/messages.json`
 * so that the chat module no longer depends on modifications to the shared
 * locale files. Other locales fall back to English.
 *
 * The locale is resolved at call time from `document.documentElement.lang`,
 * which the main app sets via `setupLanguageAndDirection()`.
 */

const translations: Record<string, Record<string, string>> = {
	en: {
		chatTitle: 'Chat',
		chatClear: 'Clear',
		chatCollapse: 'Collapse',
		chatInputPlaceholder: 'Ask AI...',
		send: 'Send',
		thinking: 'Thinking',
		retry: 'Retry',
		chatEmpty: 'Ask AI about the current page',
		chatStop: 'Stop',
		chatThinking: 'Thinking',
		chatContext: 'Chat context',
		chatContextDescription: 'Context used for chat messages. Overrides the default context defined in interpreter settings. Variables can be used here.',
		defaultChatContext: 'Default chat context',
		defaultChatContextDescription: 'The model will use this context to process chat messages. Variables and filters can be used here.'
	},
	zh_CN: {
		chatTitle: '对话',
		chatClear: '清空',
		chatCollapse: '折叠',
		chatInputPlaceholder: '询问 AI...',
		send: '发送',
		thinking: '思考中',
		retry: '重试',
		chatEmpty: '询问 AI 关于当前页面的内容',
		chatStop: '停止',
		chatThinking: '思考中',
		chatContext: '对话上下文',
		chatContextDescription: '用于对话消息的上下文。覆盖解释器设置中定义的默认上下文。此处可以使用变量。',
		defaultChatContext: '默认对话上下文',
		defaultChatContextDescription: '模型将使用此上下文来处理对话消息。可以在此处使用变量和过滤器。'
	}
};

function resolveLocale(): string {
	try {
		const raw = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
		const normalized = raw.replace('-', '_');
		if (translations[normalized]) return normalized;
		const base = normalized.split('_')[0];
		if (translations[base]) return base;
	} catch {
		// ignore – fall through to default
	}
	return 'en';
}

export function t(key: string): string {
	const locale = resolveLocale();
	const localeMap = translations[locale] || translations.en;
	return localeMap[key] || translations.en[key] || key;
}

/** Apply data-i18n / data-i18n-title attributes within a subtree. */
export function applyChatTranslations(root: HTMLElement | Document = document): void {
	let applying = false;
	let scheduled = false;

	const applyToElement = (element: Element): void => {
		const key = element.getAttribute('data-i18n');
		if (!key) return;
		const translation = t(key);
		if (translation === key) return;
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			if (element.placeholder !== translation) {
				element.placeholder = translation;
			}
		} else {
			if (element.textContent !== translation) {
				applying = true;
				element.textContent = translation;
				applying = false;
			}
		}
	};

	const applyTitleToElement = (element: Element): void => {
		const key = element.getAttribute('data-i18n-title');
		if (!key) return;
		const translation = t(key);
		if (translation === key) return;
		if (element.getAttribute('title') !== translation) {
			element.setAttribute('title', translation);
		}
	};

	const applyAll = (scope: ParentNode): void => {
		scope.querySelectorAll('[data-i18n]').forEach(applyToElement);
		scope.querySelectorAll('[data-i18n-title]').forEach(applyTitleToElement);
	};

	applyAll(root);

	const target = root instanceof Document ? root.documentElement : root;

	const scheduleReapply = (): void => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			if (!applying) {
				applyAll(root);
			}
		}, 0);
	};

	const observer = new MutationObserver((mutations) => {
		if (applying) return;
		for (const mutation of mutations) {
			if (mutation.type === 'childList') {
				scheduleReapply();
			} else if (mutation.type === 'attributes') {
				const el = mutation.target as Element;
				if (el.hasAttribute('data-i18n')) applyToElement(el);
				if (el.hasAttribute('data-i18n-title')) applyTitleToElement(el);
			} else if (mutation.type === 'characterData') {
				const el = mutation.target.parentElement;
				if (el && el.hasAttribute('data-i18n')) applyToElement(el);
				if (el && el.hasAttribute('data-i18n-title')) applyTitleToElement(el);
			}
		}
	});
	observer.observe(target, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
		attributeFilter: ['data-i18n', 'data-i18n-title', 'placeholder', 'title']
	});
}

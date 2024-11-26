import { initializeToggles } from './ui-utils';

export function updateUrl(section: string, templateId?: string): void {
	let url = `${window.location.pathname}?section=${section}`;
	if (templateId) {
		url += `&template=${templateId}`;
	}
	window.history.pushState({}, '', url);
}

export function getUrlParameters(): { section: string | null, templateId: string | null } {
	const urlParams = new URLSearchParams(window.location.search);
	return {
		section: urlParams.get('section'),
		templateId: urlParams.get('template')
	};
}
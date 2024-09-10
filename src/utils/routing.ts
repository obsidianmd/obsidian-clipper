export function updateUrl(section: string, templateId?: string): void {
	let url = `${window.location.pathname}?section=${section}`;
	if (templateId) {
		url += `&template=${templateId}`;
	}
	window.history.pushState({}, '', url);
}
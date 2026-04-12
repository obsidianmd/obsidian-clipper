import browser from './browser-polyfill';

const IFRAME_ID = 'obsidian-clipper-iframe';
const MIN_SIZE = 200;

let sidebarWidthRaf: number | null = null;

export function updateSidebarWidth(doc: Document, container: HTMLElement | null): void {
	if (sidebarWidthRaf) cancelAnimationFrame(sidebarWidthRaf);
	sidebarWidthRaf = requestAnimationFrame(() => {
		if (container && doc.contains(container)) {
			doc.documentElement.style.setProperty('--clipper-sidebar-width', `${container.offsetWidth + 24}px`);
		} else {
			doc.documentElement.style.removeProperty('--clipper-sidebar-width');
		}
	});
}

export function addResizeHandle(doc: Document, container: HTMLElement, direction: string, onResizeEnd?: () => void): void {
	const handle = doc.createElement('div');
	handle.className = `obsidian-clipper-resize-handle obsidian-clipper-resize-handle-${direction}`;
	container.appendChild(handle);

	let startX: number, startY: number, startWidth: number, startHeight: number, startTop: number;

	handle.onmousedown = (e) => {
		e.stopPropagation();
		startX = e.clientX;
		startY = e.clientY;
		startWidth = container.offsetWidth;
		startHeight = container.offsetHeight;
		startTop = container.offsetTop;

		doc.body.style.cursor = window.getComputedStyle(handle).cursor;

		const iframe = container.querySelector(`#${IFRAME_ID}`);
		if (iframe) iframe.classList.add('is-resizing');

		doc.onmousemove = (moveEvent) => {
			const dx = moveEvent.clientX - startX;
			const dy = moveEvent.clientY - startY;

			if (direction.includes('e')) {
				container.style.width = `${Math.max(MIN_SIZE, startWidth + dx)}px`;
			}
			if (direction.includes('w')) {
				container.style.width = `${Math.max(MIN_SIZE, startWidth - dx)}px`;
			}
			if (direction.includes('s')) {
				container.style.height = `${Math.max(MIN_SIZE, startHeight + dy)}px`;
			}
			if (direction.includes('n')) {
				const newHeight = Math.max(MIN_SIZE, startHeight - dy);
				container.style.height = `${newHeight}px`;
				container.style.top = `${startTop + startHeight - newHeight}px`;
			}

			updateSidebarWidth(doc, container);
		};

		doc.onmouseup = () => {
			const iframeEl = container.querySelector(`#${IFRAME_ID}`);
			if (iframeEl) iframeEl.classList.remove('is-resizing');
			doc.body.style.cursor = '';

			browser.storage.local.set({
				clipperIframeWidth: container.offsetWidth,
				clipperIframeHeight: container.offsetHeight,
			});

			doc.onmousemove = null;
			doc.onmouseup = null;

			onResizeEnd?.();
		};
	};
}

export function cleanupResizeHandlers(doc: Document): void {
	doc.onmousemove = null;
	doc.onmouseup = null;
}

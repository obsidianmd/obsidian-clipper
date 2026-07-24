export interface ElementPickerOptions {
	document: Document;
	onSelect: (element: Element) => void;
	onCancel?: () => void;
	isExcluded?: (element: Element) => boolean;
}

const OVERLAY_ATTRIBUTE = 'data-obsidian-element-picker-overlay';

export class ElementPicker {
	private readonly document: Document;
	private readonly onSelect: (element: Element) => void;
	private readonly onCancel?: () => void;
	private readonly isExcluded: (element: Element) => boolean;
	private overlay: HTMLDivElement | null = null;
	private candidate: Element | null = null;
	private active = false;

	constructor({ document, onSelect, onCancel, isExcluded }: ElementPickerOptions) {
		this.document = document;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.isExcluded = isExcluded ?? (() => false);
	}

	isActive(): boolean {
		return this.active;
	}

	start(): void {
		if (this.active) return;
		this.active = true;
		this.overlay = this.document.createElement('div');
		this.overlay.setAttribute(OVERLAY_ATTRIBUTE, '');
		Object.assign(this.overlay.style, {
			position: 'fixed',
			pointerEvents: 'none',
			zIndex: '2147483647',
			border: '2px solid #7c3aed',
			background: 'rgba(124, 58, 237, 0.12)',
			boxSizing: 'border-box',
			display: 'none',
		});
		this.document.documentElement.appendChild(this.overlay);

		this.document.addEventListener('pointermove', this.handlePointerMove, true);
		this.document.addEventListener('pointerdown', this.suppressPageEvent, true);
		this.document.addEventListener('mousedown', this.suppressPageEvent, true);
		this.document.addEventListener('mouseup', this.suppressPageEvent, true);
		this.document.addEventListener('click', this.handleClick, true);
		this.document.addEventListener('keydown', this.handleKeyDown, true);
		this.document.defaultView?.addEventListener('scroll', this.updateOverlay, true);
		this.document.defaultView?.addEventListener('resize', this.updateOverlay);
	}

	stop(): void {
		if (!this.active) return;
		this.active = false;
		this.document.removeEventListener('pointermove', this.handlePointerMove, true);
		this.document.removeEventListener('pointerdown', this.suppressPageEvent, true);
		this.document.removeEventListener('mousedown', this.suppressPageEvent, true);
		this.document.removeEventListener('mouseup', this.suppressPageEvent, true);
		this.document.removeEventListener('click', this.handleClick, true);
		this.document.removeEventListener('keydown', this.handleKeyDown, true);
		this.document.defaultView?.removeEventListener('scroll', this.updateOverlay, true);
		this.document.defaultView?.removeEventListener('resize', this.updateOverlay);
		this.overlay?.remove();
		this.overlay = null;
		this.candidate = null;
	}

	private getEventElement(event: Event): Element | null {
		const pathElement = event.composedPath().find(
			target => target instanceof Element && target !== this.overlay
		) as Element | undefined;
		const element = pathElement ?? (event.target instanceof Element ? event.target : null);
		if (!element || element === this.overlay || this.isExcluded(element)) return null;
		return element;
	}

	private setCandidate(element: Element | null): void {
		if (!element || this.isExcluded(element)) return;
		this.candidate = element;
		this.updateOverlay();
	}

	private handlePointerMove = (event: Event): void => {
		this.setCandidate(this.getEventElement(event));
	};

	private suppressPageEvent = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	};

	private handleClick = (event: Event): void => {
		this.suppressPageEvent(event);
		const element = this.candidate ?? this.getEventElement(event);
		if (!element) return;
		this.stop();
		this.onSelect(element);
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			this.suppressPageEvent(event);
			this.stop();
			this.onCancel?.();
			return;
		}

		if (!this.candidate) return;
		let next: Element | null = null;
		if (event.key === 'ArrowUp') next = this.candidate.parentElement;
		if (event.key === 'ArrowDown') next = this.candidate.firstElementChild;
		if (!next || this.isExcluded(next)) return;

		this.suppressPageEvent(event);
		this.setCandidate(next);
	};

	private updateOverlay = (): void => {
		if (!this.overlay || !this.candidate) return;
		const rect = this.candidate.getBoundingClientRect();
		Object.assign(this.overlay.style, {
			display: 'block',
			left: `${rect.left}px`,
			top: `${rect.top}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
		});
	};
}

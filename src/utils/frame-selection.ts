export interface FrameSelectionSnapshot {
	frameId: number;
	frameUrl: string;
	selectedHtml: string;
}

export interface FrameSelectionReport {
	hasSelection: boolean;
	frameUrl: string;
	selectedHtml: string;
}

interface TrackedFrameSelection extends FrameSelectionSnapshot {
	sequence: number;
}

/**
 * Keeps explicit selections scoped to the document that owns them. Frame
 * documents cannot share Selection objects, so the background owns the small
 * amount of routing state needed by popup and context-menu actions.
 */
export class FrameSelectionTracker {
	private readonly selections = new Map<number, Map<number, TrackedFrameSelection>>();
	private readonly lastActiveFrame = new Map<number, number>();
	private sequence = 0;

	report(tabId: number, frameId: number, report: FrameSelectionReport): void {
		this.lastActiveFrame.set(tabId, frameId);
		if (!report.hasSelection || !report.selectedHtml) return;

		let tabSelections = this.selections.get(tabId);
		if (!tabSelections) {
			tabSelections = new Map();
			this.selections.set(tabId, tabSelections);
		}

		tabSelections.set(frameId, {
			frameId,
			frameUrl: report.frameUrl,
			selectedHtml: report.selectedHtml,
			sequence: ++this.sequence,
		});
	}

	clear(tabId: number, frameId: number): void {
		this.lastActiveFrame.set(tabId, frameId);
		const tabSelections = this.selections.get(tabId);
		if (!tabSelections) return;
		tabSelections.delete(frameId);
		if (tabSelections.size === 0) this.selections.delete(tabId);
	}

	getLatest(tabId: number): FrameSelectionSnapshot | undefined {
		const tabSelections = this.selections.get(tabId);
		if (!tabSelections) return undefined;

		let latest: TrackedFrameSelection | undefined;
		for (const selection of tabSelections.values()) {
			if (!latest || selection.sequence > latest.sequence) latest = selection;
		}
		if (!latest) return undefined;

		const { sequence: _sequence, ...snapshot } = latest;
		return snapshot;
	}

	getContextFrame(tabId: number, contextFrameId?: number): number {
		if (typeof contextFrameId === 'number' && contextFrameId >= 0) return contextFrameId;
		return this.lastActiveFrame.get(tabId) ?? this.getLatest(tabId)?.frameId ?? 0;
	}

	removeTab(tabId: number): void {
		this.selections.delete(tabId);
		this.lastActiveFrame.delete(tabId);
	}
}

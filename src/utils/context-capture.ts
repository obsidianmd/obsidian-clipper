export interface ContextCaptureResponse {
	success: boolean;
	hasSelection: boolean;
	selectedHtml?: string;
	frameUrl?: string;
}

export async function captureContextSelection(
	sendToTab: (message: { action: 'captureSelectionSnapshot' }, frameId: number) => Promise<ContextCaptureResponse>,
	frameId: number
): Promise<ContextCaptureResponse> {
	return sendToTab({ action: 'captureSelectionSnapshot' }, frameId);
}

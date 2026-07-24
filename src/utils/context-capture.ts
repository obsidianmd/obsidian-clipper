export interface ContextCaptureResponse {
	success: boolean;
	hasSelection: boolean;
}

export async function captureContextSelection(
	sendToTab: (message: { action: 'captureSelectionSnapshot' }) => Promise<ContextCaptureResponse>
): Promise<ContextCaptureResponse> {
	return sendToTab({ action: 'captureSelectionSnapshot' });
}

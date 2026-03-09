export async function fetchPdfAsBase64(url: string): Promise<{ base64: string; sizeBytes: number }> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);

	// Convert to base64 in chunks to avoid stack overflow with large PDFs
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);

	return { base64, sizeBytes: arrayBuffer.byteLength };
}

// Quick clip is invoked from a keyboard command, so the background script opens
// the popup and then asks it to save. The popup needs time to register its
// message listener and to finish extracting page content: a template variable
// such as a YouTube {{transcript}} resolves asynchronously and can take several
// seconds. Poll the popup for an explicit readiness acknowledgement rather than
// assuming a fixed delay, the same way content-script injection polls with a
// ping instead of sleeping.

export interface PopupReadyResponse {
	ready?: boolean;
}

export interface WaitForPopupReadyOptions {
	/** Maximum number of readiness queries before giving up. */
	attempts?: number;
	/** Delay between queries, in milliseconds. */
	intervalMs?: number;
	/** Injectable sleep, so tests do not wait in real time. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Asks the popup whether it is ready until it says yes.
 *
 * Returns true as soon as the popup acknowledges readiness, or false once
 * `attempts` queries have been made without one. A rejected query means the
 * popup has not registered its message listener yet, which is not an error.
 */
export async function waitForPopupReady(
	askPopup: () => Promise<PopupReadyResponse | undefined | null>,
	options: WaitForPopupReadyOptions = {}
): Promise<boolean> {
	const { attempts = 100, intervalMs = 100, sleep = defaultSleep } = options;

	for (let attempt = 0; attempt < attempts; attempt++) {
		// Query immediately, then space out the retries.
		if (attempt > 0) {
			await sleep(intervalMs);
		}

		try {
			const response = await askPopup();
			if (response?.ready) {
				return true;
			}
		} catch {
			// Popup is not listening yet.
		}
	}

	return false;
}

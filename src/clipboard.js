import browser from './utils/browser-polyfill';

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'copy') {
		const textToCopy = request.text;
		const textArea = document.createElement('textarea');
		textArea.value = textToCopy;
		document.body.appendChild(textArea);
		textArea.select();
		document.execCommand('copy');
		document.body.removeChild(textArea);
		sendResponse({success: true});
	}
});

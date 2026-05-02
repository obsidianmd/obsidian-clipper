// Runs in the MAIN world to extract shadow DOM content.
// Content scripts cannot read shadow root content due to Chrome's isolation.
// This script stamps shadow innerHTML into data attributes readable from any world.
(function() {
	document.querySelectorAll('*').forEach(function(el) {
		if (el.shadowRoot && el.shadowRoot.innerHTML) {
			el.setAttribute('data-defuddle-shadow', el.shadowRoot.innerHTML);
		}
	});
})();

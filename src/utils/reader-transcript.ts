import { getMessage } from './i18n';

// CJK-aware text boundary helpers
const SENT_END = /[.!?。！？]/;
const SOFT_STOP = /[,、，]/;
const CJK_SENT_END = /[。！？]/;
const CJK_PUNCT = /[。！？、，]/;
const CJK_CHAR = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

// CJK punctuation doesn't require trailing whitespace
function isSentBoundary(text: string, punctPos: number, nextPos: number): boolean {
	const ch = text[punctPos];
	if (CJK_SENT_END.test(ch)) return true;
	if (/[.!?]/.test(ch)) return nextPos >= text.length || /\s/.test(text[nextPos]);
	return false;
}

function isSentOrSoftBoundary(text: string, punctPos: number, nextPos: number): boolean {
	const ch = text[punctPos];
	if (CJK_PUNCT.test(ch)) return true;
	if (/[.!?,]/.test(ch)) return nextPos >= text.length || /\s/.test(text[nextPos]);
	return false;
}

// In CJK text each character acts as its own word
function isWordStep(text: string, pos: number): boolean {
	if (CJK_CHAR.test(text[pos])) return true;
	if (pos > 0 && CJK_CHAR.test(text[pos - 1]) && !CJK_CHAR.test(text[pos]) && /\S/.test(text[pos])) return true;
	return false;
}

interface TranscriptSettings {
	pinPlayer: boolean;
	autoScroll: boolean;
	highlightActiveLine: boolean;
}

interface ScrollHelper {
	getStickyOffset: () => number;
	scrollTo: (targetY: number) => void;
	programmaticScroll: () => boolean;
}

export function wireTranscript(
	doc: Document,
	article: HTMLElement,
	settings: TranscriptSettings,
	scroll: ScrollHelper,
	onSettingChange?: (key: keyof TranscriptSettings, value: boolean) => void
): void {
	const transcript = article.querySelector('.youtube.transcript') as HTMLElement | null;
	if (!transcript) return;

	const iframe = article.querySelector('iframe[src*="youtube.com/embed/"]') as HTMLIFrameElement | null;
	const videoWrapper = article.querySelector('.reader-video-wrapper') as HTMLElement | null;
	const videoEl = videoWrapper?.querySelector('video.reader-video-player') as HTMLVideoElement | null;
	const thumbnailLink = article.querySelector('a[href*="youtube.com/watch"]') as HTMLAnchorElement | null;
	const playerEl = (videoWrapper || iframe || thumbnailLink) as HTMLElement | null;
	if (!playerEl) return;

	// Wrap player in a container with toggle controls
	const playerContainer = doc.createElement('div');
	const pinDefault = settings.pinPlayer;
	const autoScrollDefault = settings.autoScroll;
	const highlightDefault = settings.highlightActiveLine;
	playerContainer.className = 'player-container' + (pinDefault ? ' pin-player' : '');
	playerEl.parentNode!.insertBefore(playerContainer, playerEl);
	playerContainer.appendChild(playerEl);

	let autoScrollEnabled = autoScrollDefault;
	let highlightEnabled = highlightDefault;

	const toggleBar = doc.createElement('div');
	toggleBar.className = 'player-toggles';

	const createToggle = (label: string, defaultOn: boolean, onChange: (on: boolean) => void) => {
		const wrapper = doc.createElement('label');
		wrapper.className = 'player-toggle' + (defaultOn ? ' is-enabled' : '');

		const toggle = doc.createElement('div');
		toggle.className = 'player-toggle-switch';
		const input = doc.createElement('input');
		input.type = 'checkbox';
		input.checked = defaultOn;
		toggle.appendChild(input);

		const text = doc.createElement('span');
		text.textContent = label;

		wrapper.appendChild(text);
		wrapper.appendChild(toggle);

		wrapper.addEventListener('click', (e) => {
			e.preventDefault();
			input.checked = !input.checked;
			wrapper.classList.toggle('is-enabled', input.checked);
			onChange(input.checked);
		});

		return wrapper;
	};

	const pinToggle = createToggle(getMessage('readerPinPlayer'), pinDefault, (on) => {
		playerContainer.classList.toggle('pin-player', on);
		if (on) {
			playerContainer.appendChild(toggleBar);
		} else {
			playerContainer.after(toggleBar);
		}
		// Reset nav scroll tracking so hide-on-scroll-down works immediately
		window.dispatchEvent(new CustomEvent('reader-show-nav'));
		onSettingChange?.('pinPlayer', on);
	});

	const autoScrollToggle = createToggle(getMessage('readerAutoScroll'), autoScrollDefault, (on) => {
		autoScrollEnabled = on;
		onSettingChange?.('autoScroll', on);
	});

	const highlightToggle = createToggle(getMessage('readerHighlightActiveLine'), highlightDefault, (on) => {
		highlightEnabled = on;
		if (!on) {
			const ph = (CSS as any).highlights?.get('transcript-playback');
			if (ph) ph.clear();
		}
		onSettingChange?.('highlightActiveLine', on);
	});

	// Floating "current position" button — appended to body,
	// shown only when the active segment is scrolled out of view
	const currentPosButton = doc.createElement('button');
	currentPosButton.className = 'player-current-pos';
	currentPosButton.textContent = getMessage('readerCurrentPosition');
	transcript.style.position = 'relative';
	transcript.appendChild(currentPosButton);

	const toggleGroup = doc.createElement('div');
	toggleGroup.className = 'player-toggle-group is-open';
	toggleGroup.appendChild(pinToggle);
	toggleGroup.appendChild(autoScrollToggle);
	toggleGroup.appendChild(highlightToggle);

	toggleBar.appendChild(toggleGroup);

	playerContainer.appendChild(toggleBar);

	if (iframe) {
		// Enable JS API on the embed
		const src = new URL(iframe.src);
		src.searchParams.set('enablejsapi', '1');
		src.searchParams.set('origin', window.location.origin);
		iframe.src = src.toString();

		// Initialize postMessage connection once iframe loads
		iframe.addEventListener('load', () => {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage(JSON.stringify({
					event: 'listening'
				}), '*');
			}
		});
	}

	// Build a sorted list of segments with their start times
	const segments = Array.from(transcript.querySelectorAll('.transcript-segment')) as HTMLElement[];
	segments.forEach(seg => {
		// Pull the timestamp out into its own element
		// and wrap remaining text in a span
		const strong = seg.querySelector('strong');
		if (!strong) return;

		if (strong.nextSibling?.nodeType === Node.TEXT_NODE) {
			strong.nextSibling.textContent = strong.nextSibling.textContent!.replace(/^\s*·\s*/, '');
		}

		// Move timestamp strong out, wrap the rest in a div
		const textWrapper = doc.createElement('div');
		textWrapper.className = 'transcript-segment-text';
		strong.remove();
		while (seg.firstChild) {
			textWrapper.appendChild(seg.firstChild);
		}
		seg.appendChild(strong);
		seg.appendChild(textWrapper);
	});
	// Set timestamp column width to the widest timestamp
	let maxWidth = 0;
	segments.forEach(seg => {
		const strong = seg.querySelector('strong');
		if (strong) {
			maxWidth = Math.max(maxWidth, strong.getBoundingClientRect().width);
		}
	});
	transcript.style.setProperty('--timestamp-width', Math.ceil(maxWidth) + 'px');

	const segmentTimes = segments.map(seg => {
		const ts = seg.querySelector('.timestamp');
		return parseFloat(ts?.getAttribute('data-timestamp') || '0');
	});

	const FALLBACK_SEGMENT_DURATION = 30;
	const AUTO_SCROLL_COOLDOWN = 2000;
	const getSegmentEnd = (i: number) =>
		i < segmentTimes.length - 1 ? segmentTimes[i + 1] : segmentTimes[i] + FALLBACK_SEGMENT_DURATION;

	// Map each segment to its preceding chapter heading for outline tracking
	const segmentChapters: (Element | null)[] = [];
	const segmentIndexMap = new Map(segments.map((s, i) => [s, i]));
	let currentChapter: Element | null = null;
	const transcriptChildren = Array.from(transcript.children);
	for (const child of transcriptChildren) {
		if (/^H[2-6]$/.test(child.tagName)) {
			currentChapter = child;
		} else if (child.classList.contains('transcript-segment')) {
			const idx = segmentIndexMap.get(child as HTMLElement);
			if (idx !== undefined) segmentChapters[idx] = currentChapter;
		}
	}
	let activeChapter: Element | null = null;

	// Track active segment based on video current time
	let activeSegment: HTMLElement | null = null;

	currentPosButton.addEventListener('click', () => {
		if (activeSegment) {
			const rect = activeSegment.getBoundingClientRect();
			const stickyOffset = scroll.getStickyOffset();
			const targetY = (window.pageYOffset || doc.documentElement.scrollTop)
				+ rect.top - stickyOffset - 20;
			scroll.scrollTo(targetY);
		}
	});
	let activeIndex = -1;
	let suppressScroll = false;
	let lastUserScroll = 0;
	let lastCurrentTime = -1;
	let scrubbing = false;
	let lastScrub = 0;

	window.addEventListener('scroll', () => {
		if (scroll.programmaticScroll() || scrubbing) return;
		lastUserScroll = Date.now();
	}, { passive: true });

	const updateActiveSegment = (currentTime: number) => {
		if (Math.abs(currentTime - lastCurrentTime) < 0.05) return;
		lastCurrentTime = currentTime;
		let newIndex = -1;
		for (let i = segmentTimes.length - 1; i >= 0; i--) {
			if (currentTime >= segmentTimes[i]) {
				newIndex = i;
				break;
			}
		}
		if (newIndex !== activeIndex) {
			// Resume auto-scroll once segment changes after scrub ends
			if (suppressScroll && !scrubbing) {
				suppressScroll = false;
			}
			activeSegment?.classList.remove('is-active');
			if (newIndex >= 0) {
				segments[newIndex].classList.add('is-active');
				// Auto-scroll to keep active segment visible
				if (autoScrollEnabled && !suppressScroll && Date.now() - lastUserScroll > AUTO_SCROLL_COOLDOWN) {
					const rect = segments[newIndex].getBoundingClientRect();
					const stickyOffset = scroll.getStickyOffset();
					const targetY = (window.pageYOffset || doc.documentElement.scrollTop)
						+ rect.top - stickyOffset - 20;
					scroll.scrollTo(targetY);
				}
			}
			activeSegment = newIndex >= 0 ? segments[newIndex] : null;
			activeIndex = newIndex;

			// Update in-progress chapter in outline
			const chapter = newIndex >= 0 ? segmentChapters[newIndex] : null;
			if (chapter !== activeChapter) {
				if (activeChapter?.id) {
					doc.querySelector(`.obsidian-reader-outline-item[data-heading-id="${activeChapter.id}"]`)
						?.classList.remove('in-progress');
				}
				if (chapter?.id) {
					doc.querySelector(`.obsidian-reader-outline-item[data-heading-id="${chapter.id}"]`)
						?.classList.add('in-progress');
				}
				activeChapter = chapter;
			}
		}
		// Show floating button when active segment is out of view
		if (activeSegment) {
			const rect = activeSegment.getBoundingClientRect();
			const stickyOffset = scroll.getStickyOffset();
			const isVisible = rect.bottom > stickyOffset && rect.top < window.innerHeight;
			currentPosButton.classList.toggle('is-visible', !isVisible);
		} else {
			currentPosButton.classList.remove('is-visible');
		}
		// Update progress line on the scrub track
		if (activeSegment && activeIndex >= 0) {
			const segRect = activeSegment.getBoundingClientRect();
			const trackRect = scrubTrack.getBoundingClientRect();
			const start = segmentTimes[activeIndex];
			const end = getSegmentEnd(activeIndex);
			const segProgress = Math.min(1, Math.max(0, (currentTime - start) / (end - start)));
			const yInTrack = (segRect.top - trackRect.top) + segProgress * segRect.height;
			const trackProgress = yInTrack / trackRect.height;
			scrubTrack.style.setProperty('--track-progress', (trackProgress * 100) + '%');

			// Update playback highlight — underline the current line
			if (playbackHighlight && highlightEnabled) {
				playbackHighlight.clear();
				const textEl = activeSegment.querySelector('.transcript-segment-text');
				const textNode = textEl?.firstChild;
				if (textNode && textNode.nodeType === Node.TEXT_NODE) {
					const totalLen = (textNode.textContent || '').length;
					const charPos = Math.min(totalLen - 1, Math.max(0, Math.round(segProgress * totalLen)));

					// Find lines around the current position
					const probe = doc.createRange();
					const getLineY = (pos: number) => {
						probe.setStart(textNode!, Math.min(pos, totalLen - 1));
						probe.setEnd(textNode!, Math.min(pos + 1, totalLen));
						return probe.getClientRects()[0]?.top;
					};

					const lineY = getLineY(charPos);
					if (lineY === undefined) return;

					// Scan backward to find start of current sentence
					// but limit to ~2 lines back so run-ons don't over-highlight
					const text = textNode.textContent || '';
					let hlStart = 0;
					if (segProgress > 0.05) {
						hlStart = charPos;
						let backLineChanges = 0;
						let backLastY = lineY;
						while (hlStart > 0) {
							if (isSentBoundary(text, hlStart - 1, hlStart)) {
								while (hlStart < charPos && /\s/.test(text[hlStart])) hlStart++;
								break;
							}
							// Check line changes in steps to reduce layout queries
							if (hlStart % 8 === 0 || hlStart === 1) {
								const y = getLineY(hlStart - 1);
								if (y !== undefined && Math.abs(y - backLastY) > 2) {
									backLineChanges++;
									if (backLineChanges >= 2) break;
									backLastY = y;
								}
							}
							hlStart--;
						}
					}

					// Scan forward: up to 3 lines total, stop at sentence end or comma
					let hlEnd = charPos + 1;
					let fwdLines = 0;
					let fwdLastY = lineY;
					while (hlEnd < totalLen && fwdLines < 3) {
						// Check line changes in steps
						if (hlEnd % 8 === 0 || hlEnd === charPos + 1) {
							const y = getLineY(hlEnd);
							if (y === undefined) break;
							if (Math.abs(y - fwdLastY) > 2) {
								fwdLines++;
								if (fwdLines >= 3) break;
								fwdLastY = y;
							}
						}
						if (hlEnd > charPos + 1 && isSentOrSoftBoundary(text, hlEnd - 1, hlEnd)) break;
						hlEnd++;
					}

					const range = doc.createRange();
					range.setStart(textNode, hlStart);
					range.setEnd(textNode, hlEnd);
					playbackHighlight.add(range);
				}
			}
		}
	};

	// Set up time tracking and seeking based on player type
	let seekTo: (seconds: number) => void;
	let iframePlaying = false;

	if (videoEl) {
		// Native video element: use HTML5 API directly
		seekTo = (seconds: number) => {
			videoEl.currentTime = seconds;
		};
		videoEl.addEventListener('timeupdate', () => {
			updateActiveSegment(videoEl.currentTime);
		});
		// Prevent native video controls from handling seek shortcuts
		videoEl.addEventListener('keydown', (e) => {
			if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyJ' || e.code === 'KeyL') {
				e.preventDefault();
			}
		});
	} else if (iframe) {
		// Iframe embed: use postMessage API
		seekTo = (seconds: number) => {
			if (!iframe.contentWindow) return;
			iframe.contentWindow.postMessage(JSON.stringify({
				event: 'command',
				func: 'seekTo',
				args: [seconds, true]
			}), '*');
		};

		const onMessage = (e: MessageEvent) => {
			if (e.source !== iframe.contentWindow) return;
			try {
				const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
				if (data?.info?.currentTime !== undefined) {
					updateActiveSegment(data.info.currentTime);
				}
				if (data?.info?.playerState !== undefined) {
					iframePlaying = data.info.playerState === 1;
				}
			} catch {} // Ignore non-YouTube postMessage events
		};
		window.addEventListener('message', onMessage);

		const poll = setInterval(() => {
			if (!iframe.contentWindow || !doc.contains(iframe)) {
				clearInterval(poll);
				window.removeEventListener('message', onMessage);
				return;
			}
			iframe.contentWindow.postMessage(JSON.stringify({
				event: 'command',
				func: 'getCurrentTime',
				args: []
			}), '*');
		}, 500);
	} else {
		seekTo = () => {};
	}

	// Keyboard shortcuts for video playback
	const togglePlayPause = () => {
		if (videoEl) {
			videoEl.paused ? videoEl.play() : videoEl.pause();
		} else if (iframe?.contentWindow) {
			iframe.contentWindow.postMessage(JSON.stringify({
				event: 'command',
				func: iframePlaying ? 'pauseVideo' : 'playVideo',
				args: []
			}), '*');
		}
	};

	const seekRelative = (delta: number) => {
		if (videoEl) {
			videoEl.currentTime = Math.max(0, videoEl.currentTime + delta);
		} else if (iframe?.contentWindow) {
			seekTo(Math.max(0, lastCurrentTime + delta));
		}
	};

	// Use capture phase so we intercept before YouTube's own keyboard
	// handlers on the page — the original page scripts are still running
	doc.addEventListener('keydown', (e: KeyboardEvent) => {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		switch (e.code) {
			case 'Space':
				// Only handle Space for iframe embeds — native video
				// controls handle Space themselves and would double-toggle
				if (!videoEl) {
					e.preventDefault();
					e.stopImmediatePropagation();
					togglePlayPause();
				}
				break;
			case 'KeyK':
				// K is not a native video shortcut, so handle it for both
				e.preventDefault();
				e.stopImmediatePropagation();
				togglePlayPause();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				e.stopImmediatePropagation();
				seekRelative(-5);
				break;
			case 'ArrowRight':
				e.preventDefault();
				e.stopImmediatePropagation();
				seekRelative(5);
				break;
			case 'KeyJ':
				e.preventDefault();
				e.stopImmediatePropagation();
				seekRelative(-10);
				break;
			case 'KeyL':
				e.preventDefault();
				e.stopImmediatePropagation();
				seekRelative(10);
				break;
		}
	}, { capture: true });

	// YouTube handles Space on keyup — block that too
	doc.addEventListener('keyup', (e: KeyboardEvent) => {
		if (e.code === 'Space' && !videoEl) {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, { capture: true });

	// Add a scrub track behind the timestamps
	const scrubTrack = doc.createElement('div');
	scrubTrack.className = 'transcript-scrub-track';
	const scrubHover = doc.createElement('div');
	scrubHover.className = 'transcript-scrub-hover';
	scrubTrack.appendChild(scrubHover);
	transcript.style.position = 'relative';
	transcript.appendChild(scrubTrack);

	// Word highlights using CSS Custom Highlight API
	const hasHighlights = !!(CSS as any).highlights;
	const playbackHighlight = hasHighlights ? new (window as any).Highlight() : null;
	const hoverHighlight = hasHighlights ? new (window as any).Highlight() : null;
	if (hasHighlights) {
		(CSS as any).highlights.set('transcript-playback', playbackHighlight);
		(CSS as any).highlights.set('transcript-hover', hoverHighlight);
	}

	const getCaretNode = (x: number, y: number): { node: Node; offset: number } | null => {
		if ('caretPositionFromPoint' in doc) {
			const pos = (doc as any).caretPositionFromPoint(x, y);
			if (pos) return { node: pos.offsetNode, offset: pos.offset };
		} else if ('caretRangeFromPoint' in doc) {
			const range = (doc as any).caretRangeFromPoint(x, y) as Range | null;
			if (range) return { node: range.startContainer, offset: range.startOffset };
		}
		return null;
	};

	const getHoverRange = (textNode: Node, offset: number): Range | null => {
		const text = textNode.textContent || '';
		const totalWords = 8;

		// Forward first: up to 6 words, stop at sentence boundary
		// Commas act as soft stops — prefer stopping at a comma if we have 4+ words
		let end = offset;
		let wordsForward = 0;
		let lastComma = -1;
		let wordsAtComma = 0;
		while (end < text.length && wordsForward < 6) {
			if (isSentBoundary(text, end - 1, end)) break;
			if (SOFT_STOP.test(text[end - 1]) && wordsForward >= 3) {
				lastComma = end;
				wordsAtComma = wordsForward;
			}
			end++;
			if (end < text.length && ((/\s/.test(text[end - 1]) && /\S/.test(text[end])) || isWordStep(text, end))) wordsForward++;
		}
		// Prefer comma stop if we went past it
		if (lastComma > 0 && wordsForward > wordsAtComma) {
			end = lastComma;
			wordsForward = wordsAtComma;
		}

		// Backward: if forward hit punctuation, limit to 2 words back
		const hitPunctuation = end < text.length && SENT_END.test(text[end - 1]);
		const maxBack = hitPunctuation ? 2 : Math.max(1, totalWords - wordsForward);
		let start = offset;
		let wordsBack = 0;
		while (start > 0 && wordsBack < maxBack) {
			if (isSentBoundary(text, start - 1, start)) break;
			start--;
			if (start > 0 && ((/\s/.test(text[start]) && /\S/.test(text[start - 1])) || isWordStep(text, start))) wordsBack++;
		}

		// Trim whitespace at edges
		while (start < offset && /\s/.test(text[start])) start++;
		while (end > offset && /\s/.test(text[end - 1])) end--;
		if (start >= end) return null;
		const range = doc.createRange();
		range.setStart(textNode, start);
		range.setEnd(textNode, end);
		return range;
	};

	const updateHoverHighlight = (e: MouseEvent) => {
		if (!hoverHighlight) return;
		hoverHighlight.clear();
		const seg = (e.target as HTMLElement).closest('.transcript-segment-text');
		if (!seg) return;
		const caret = getCaretNode(e.clientX, e.clientY);
		if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !seg.contains(caret.node)) return;
		const range = getHoverRange(caret.node, caret.offset);
		if (range) hoverHighlight.add(range);
	};

	transcript.addEventListener('mousemove', (e: MouseEvent) => {
		const rect = scrubTrack.getBoundingClientRect();
		scrubHover.style.top = (e.clientY - rect.top) + 'px';
		updateHoverHighlight(e);
	});
	transcript.addEventListener('mouseleave', () => {
		scrubHover.style.top = '';
		if (hoverHighlight) hoverHighlight.clear();
	});
	// Position from first segment to bottom
	const positionTrack = () => {
		const transcriptRect = transcript.getBoundingClientRect();
		const firstSegRect = segments[0].getBoundingClientRect();
		scrubTrack.style.top = (firstSegRect.top - transcriptRect.top) + 'px';
	};
	positionTrack();

	const getTimeFromY = (clientY: number): number => {
		// Find which segment the Y position falls within
		for (let i = segments.length - 1; i >= 0; i--) {
			const rect = segments[i].getBoundingClientRect();
			if (clientY >= rect.top) {
				const progress = Math.min(1, (clientY - rect.top) / rect.height);
				const start = segmentTimes[i];
				const end = getSegmentEnd(i);
				return start + progress * (end - start);
			}
		}
		return segmentTimes[0] || 0;
	};

	scrubTrack.addEventListener('mousedown', (e) => {
		scrubbing = true;
		suppressScroll = true;
		seekTo(getTimeFromY(e.clientY));
		e.preventDefault();
	});

	window.addEventListener('mousemove', (e) => {
		if (!scrubbing) return;
		const now = Date.now();
		if (now - lastScrub < 100) return;
		lastScrub = now;
		seekTo(getTimeFromY(e.clientY));
	});

	window.addEventListener('mouseup', () => {
		scrubbing = false;
	});

	// Click anywhere in a segment to seek to that position
	transcript.addEventListener('click', (e: MouseEvent) => {
		// Don't seek if highlighter is active or user was selecting text
		if (doc.body.classList.contains('obsidian-highlighter-active')) return;
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) return;

		const seg = (e.target as HTMLElement).closest('.transcript-segment') as HTMLElement | null;
		if (!seg) return;
		const idx = segments.indexOf(seg);
		if (idx < 0) return;

		const start = segmentTimes[idx];
		const end = getSegmentEnd(idx);

		// Use caret position to estimate character-level progress
		const textEl = seg.querySelector('.transcript-segment-text');
		if (textEl) {
			const totalLen = (textEl.textContent || '').length;
			if (totalLen > 0) {
				const caret = getCaretNode(e.clientX, e.clientY);
				let charOffset = totalLen;
				if (caret && caret.node.nodeType === Node.TEXT_NODE && textEl.contains(caret.node)) {
					charOffset = caret.offset;
				}
				const progress = Math.min(1, Math.max(0, charOffset / totalLen));
				seekTo(start + progress * (end - start));
				return;
			}
		}

		// Fallback to Y position
		const rect = seg.getBoundingClientRect();
		const progress = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
		seekTo(start + progress * (end - start));
	});
}

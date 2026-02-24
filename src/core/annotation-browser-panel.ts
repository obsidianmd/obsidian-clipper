import dayjs from 'dayjs';
import browser from '../utils/browser-polyfill';
import { getMessage } from '../utils/i18n';
import {
	buildAnnotationBrowserSnapshot,
	type AnnotationBrowserPage,
	type AnnotationBrowserSnapshot
} from './annotation-browser-data';

const INITIAL_VISIBLE_ITEMS = 25;
const VISIBLE_BATCH_SIZE = 25;

export interface AnnotationBrowserPanelController {
	refresh: () => Promise<void>;
	renderEmpty: () => void;
	destroy: () => void;
}

function formatDate(timestamp: number): string {
	return dayjs(timestamp).format('MMM D, YYYY, h:mm A');
}

function formatMonthRange(firstTimestamp: number, lastTimestamp: number): string {
	const first = dayjs(firstTimestamp);
	const last = dayjs(lastTimestamp);

	if (first.isSame(last, 'month')) {
		return first.format('MMM YYYY');
	}

	if (first.isSame(last, 'year')) {
		return `${first.format('MMM')} - ${last.format('MMM YYYY')}`;
	}

	return `${first.format('MMM YYYY')} - ${last.format('MMM YYYY')}`;
}

function formatCount(count: number): string {
	return count.toLocaleString();
}

function clampVisibleCount(current: number, total: number): number {
	if (total <= 0) {
		return 0;
	}

	if (!Number.isFinite(current) || current <= 0) {
		return Math.min(INITIAL_VISIBLE_ITEMS, total);
	}

	return Math.min(Math.max(current, Math.min(INITIAL_VISIBLE_ITEMS, total)), total);
}

function openPageInNewTab(url: string): void {
	browser.tabs.create({ url }).catch((error) => {
		console.error('Failed to open annotation page in new tab:', error);
		window.open(url, '_blank', 'noopener,noreferrer');
	});
}

function createStatsGrid(snapshot: AnnotationBrowserSnapshot): HTMLElement {
	const stats = document.createElement('section');
	stats.className = 'highlights-summary-stats';

	const pageStat = document.createElement('article');
	pageStat.className = 'highlights-summary-stat';
	const pageValue = document.createElement('p');
	pageValue.className = 'highlights-summary-stat-value';
	pageValue.textContent = formatCount(snapshot.totalPages);
	const pageLabel = document.createElement('p');
	pageLabel.className = 'highlights-summary-stat-label';
	pageLabel.textContent = getMessage('highlightsSummaryStatsPages');
	pageStat.append(pageValue, pageLabel);

	const annotationStat = document.createElement('article');
	annotationStat.className = 'highlights-summary-stat';
	const annotationValue = document.createElement('p');
	annotationValue.className = 'highlights-summary-stat-value';
	annotationValue.textContent = formatCount(snapshot.totalAnnotations);
	const annotationLabel = document.createElement('p');
	annotationLabel.className = 'highlights-summary-stat-label';
	annotationLabel.textContent = getMessage('highlightsSummaryStatsAnnotations');
	annotationStat.append(annotationValue, annotationLabel);

	stats.append(pageStat, annotationStat);
	return stats;
}

function createPageCard(page: AnnotationBrowserPage): HTMLElement {
	const item = document.createElement('article');
	item.className = 'highlights-summary-item';
	item.tabIndex = 0;
	item.setAttribute('role', 'button');

	const title = document.createElement('a');
	title.className = 'highlights-summary-item-title';
	title.href = page.url;
	title.target = '_blank';
	title.rel = 'noopener noreferrer';
	title.textContent = `${page.title}(${formatCount(page.annotationsCount)})`;
	title.addEventListener('click', (event) => {
		event.stopPropagation();
	});

	const source = document.createElement('p');
	source.className = 'highlights-summary-item-source';
	source.textContent = page.path === '/' ? page.siteLabel : `${page.siteLabel} · ${page.path}`;
	source.title = page.url;

	const range = document.createElement('p');
	range.className = 'highlights-summary-item-range';
	range.textContent = formatMonthRange(page.firstCreatedAt, page.lastCreatedAt);
	range.title = [
		getMessage('highlightsSummaryCreatedAt', [formatDate(page.firstCreatedAt)]),
		getMessage('highlightsSummaryUpdatedAt', [formatDate(page.lastCreatedAt)])
	].join('\n');

	const open = () => {
		openPageInNewTab(page.url);
	};

	item.addEventListener('click', (event) => {
		const target = event.target;
		if (target instanceof Element && target.closest('a')) {
			return;
		}
		event.preventDefault();
		open();
	});
	item.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			open();
		}
	});

	item.append(title, source, range);
	return item;
}

interface SectionConfig {
	titleMessageKey: string;
	sortHintMessageKey: string;
	pages: AnnotationBrowserPage[];
	getVisibleCount: () => number;
	setVisibleCount: (value: number) => void;
	observeSentinel: (sentinel: HTMLElement, callback: () => void) => void;
	unobserveSentinel: (sentinel: HTMLElement) => void;
}

function createSection(config: SectionConfig): HTMLElement {
	const section = document.createElement('section');
	section.className = 'highlights-summary-section';

	const header = document.createElement('header');
	header.className = 'highlights-summary-section-header';

	const title = document.createElement('h2');
	title.className = 'highlights-summary-section-title';
	title.textContent = getMessage(config.titleMessageKey);

	const progress = document.createElement('p');
	progress.className = 'highlights-summary-section-progress';

	const sortHint = document.createElement('p');
	sortHint.className = 'highlights-summary-section-sort-hint';
	sortHint.textContent = getMessage(config.sortHintMessageKey);

	header.append(title, progress, sortHint);

	const list = document.createElement('div');
	list.className = 'highlights-summary-list';

	const controls = document.createElement('div');
	controls.className = 'highlights-summary-section-controls';

	const loadMoreButton = document.createElement('button');
	loadMoreButton.className = 'highlights-summary-load-more';
	loadMoreButton.type = 'button';
	loadMoreButton.textContent = getMessage('highlightsSummaryLoadMore');

	const sentinel = document.createElement('div');
	sentinel.className = 'highlights-summary-load-sentinel';
	sentinel.setAttribute('aria-hidden', 'true');

	const loadMore = (): void => {
		const currentVisible = Math.min(config.getVisibleCount(), config.pages.length);
		if (currentVisible >= config.pages.length) {
			return;
		}

		config.setVisibleCount(Math.min(currentVisible + VISIBLE_BATCH_SIZE, config.pages.length));
		renderVisibleItems();
	};

	const renderVisibleItems = (): void => {
		const visibleCount = Math.min(config.getVisibleCount(), config.pages.length);
		progress.textContent = getMessage('highlightsSummaryShownCount', [
			formatCount(visibleCount),
			formatCount(config.pages.length)
		]);

		list.textContent = '';
		for (let index = 0; index < visibleCount; index++) {
			list.appendChild(createPageCard(config.pages[index]));
		}

		const hasMore = visibleCount < config.pages.length;
		controls.hidden = !hasMore;
		sentinel.classList.toggle('is-hidden', !hasMore);
		if (hasMore) {
			config.observeSentinel(sentinel, loadMore);
		} else {
			config.unobserveSentinel(sentinel);
		}
	};

	loadMoreButton.addEventListener('click', () => {
		loadMore();
	});

	controls.append(loadMoreButton, sentinel);
	section.append(header, list, controls);

	renderVisibleItems();
	return section;
}

export function createAnnotationBrowserPanelController(): AnnotationBrowserPanelController {
	const container = document.getElementById('annotation-browser-panel');
	if (!(container instanceof HTMLElement)) {
		return {
			refresh: async () => {
				return undefined;
			},
			renderEmpty: () => {
				return undefined;
			},
			destroy: () => {
				return undefined;
			}
		};
	}
	const panelContainer = container;

	let isDestroyed = false;
	let refreshSequence = 0;
	let recentVisibleCount = 0;
	let mostVisibleCount = 0;
	let loadObserver: IntersectionObserver | null = null;
	const sentinelCallbacks = new Map<HTMLElement, () => void>();

	function getBrowseView(): HTMLElement | null {
		const browseView = document.getElementById('highlights-panel-view-browse');
		return browseView instanceof HTMLElement ? browseView : null;
	}

	function ensureObserver(): void {
		if (loadObserver || typeof IntersectionObserver === 'undefined') {
			return;
		}

		const root = getBrowseView();
		if (!root) {
			return;
		}

		loadObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) {
					continue;
				}
				const callback = sentinelCallbacks.get(entry.target as HTMLElement);
				if (callback) {
					callback();
				}
			}
		}, {
			root,
			rootMargin: '180px 0px 240px 0px',
			threshold: 0
		});
	}

	function clearObservedSentinels(): void {
		if (loadObserver) {
			for (const sentinel of sentinelCallbacks.keys()) {
				loadObserver.unobserve(sentinel);
			}
		}
		sentinelCallbacks.clear();
	}

	function observeSentinel(sentinel: HTMLElement, callback: () => void): void {
		ensureObserver();
		if (!loadObserver) {
			return;
		}

		sentinelCallbacks.set(sentinel, callback);
		loadObserver.observe(sentinel);
	}

	function unobserveSentinel(sentinel: HTMLElement): void {
		sentinelCallbacks.delete(sentinel);
		if (loadObserver) {
			loadObserver.unobserve(sentinel);
		}
	}

	function renderEmpty(): void {
		clearObservedSentinels();
		panelContainer.textContent = '';

		const emptyState = document.createElement('p');
		emptyState.className = 'highlights-summary-empty';
		emptyState.textContent = getMessage('highlightsSummaryEmpty');
		panelContainer.appendChild(emptyState);
	}

	function renderSnapshot(snapshot: AnnotationBrowserSnapshot): void {
		clearObservedSentinels();
		panelContainer.textContent = '';

		if (snapshot.totalPages === 0) {
			renderEmpty();
			return;
		}

		panelContainer.appendChild(createStatsGrid(snapshot));

		panelContainer.appendChild(createSection({
			titleMessageKey: 'highlightsSummaryRecentHeading',
			sortHintMessageKey: 'highlightsSummarySortRecent',
			pages: snapshot.recentPages,
			getVisibleCount: () => recentVisibleCount,
			setVisibleCount: (value: number) => {
				recentVisibleCount = value;
			},
			observeSentinel,
			unobserveSentinel
		}));

		panelContainer.appendChild(createSection({
			titleMessageKey: 'highlightsSummaryMostHeading',
			sortHintMessageKey: 'highlightsSummarySortMost',
			pages: snapshot.mostAnnotatedPages,
			getVisibleCount: () => mostVisibleCount,
			setVisibleCount: (value: number) => {
				mostVisibleCount = value;
			},
			observeSentinel,
			unobserveSentinel
		}));
	}

	return {
		refresh: async () => {
			if (isDestroyed) {
				return;
			}

			const requestSequence = ++refreshSequence;
			try {
				const result = await browser.storage.local.get('highlights') as { highlights?: unknown };
				if (isDestroyed || requestSequence !== refreshSequence) {
					return;
				}

				const snapshot = buildAnnotationBrowserSnapshot(result.highlights);
				recentVisibleCount = clampVisibleCount(recentVisibleCount, snapshot.recentPages.length);
				mostVisibleCount = clampVisibleCount(mostVisibleCount, snapshot.mostAnnotatedPages.length);
				renderSnapshot(snapshot);
			} catch (error) {
				if (isDestroyed || requestSequence !== refreshSequence) {
					return;
				}
				console.error('Failed to refresh annotation browser panel:', error);
				renderEmpty();
			}
		},
		renderEmpty,
		destroy: () => {
			isDestroyed = true;
			clearObservedSentinels();
			if (loadObserver) {
				loadObserver.disconnect();
				loadObserver = null;
			}
		}
	};
}

import browser from '../utils/browser-polyfill';
import { AnyHighlightData, StoredData, DomainSettings, normalizeUrl } from '../utils/highlighter';
import { translatePage, getMessage, setupLanguageAndDirection } from '../utils/i18n';
import { addBrowserClassToHtml, detectBrowser } from '../utils/browser-detection';
import DOMPurify from 'dompurify';
import Defuddle from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { getFontCss } from '../utils/font-utils';
import { ReaderSettings } from '../types/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { initializeMenu } from '../managers/menu';

dayjs.extend(relativeTime);

interface DomainGroup {
	domain: string;
	pages: PageGroup[];
	totalHighlights: number;
}

interface PageGroup {
	url: string;
	path: string;
	title?: string;
	highlights: HighlightEntry[];
}

interface HighlightEntry {
	data: AnyHighlightData;
	url: string;
}

// Navigation state: what the user is viewing
type NavSelection =
	| { type: 'all' }
	| { type: 'domain'; domain: string }
	| { type: 'page'; domain: string; url: string };

type SortOrder = 'az' | 'za' | 'new' | 'old';

let allDomainGroups: DomainGroup[] = [];
let domainSettingsMap: Record<string, DomainSettings> = {};
let searchQuery = '';
let currentNav: NavSelection = { type: 'all' };
let expandedSidebarDomains = new Set<string>();
let sortOrder: SortOrder = 'az';
const faviconCache = new Map<string, HTMLImageElement>();

// Batched rendering
const BATCH_SIZE = 50;
let flatEntries: { entry: HighlightEntry; pageUrl: string; domain: string; title?: string }[] = [];
let renderedCount = 0;
let currentPageGroup: HTMLElement | null = null;
let observer: IntersectionObserver | null = null;

document.addEventListener('DOMContentLoaded', async () => {
	await setupLanguageAndDirection();
	await translatePage();
	addBrowserClassToHtml();
	await applyReaderTheme();

	currentNav = readNavFromUrl();
	await loadData();
	// Auto-expand the domain in sidebar if navigating to a specific domain or page
	if (currentNav.type === 'domain' || currentNav.type === 'page') {
		expandedSidebarDomains.add(currentNav.domain);
	}
	renderSidebar();
	renderMain();

	const searchInput = document.getElementById('highlights-search') as HTMLInputElement;
	searchInput.addEventListener('input', () => {
		searchQuery = searchInput.value.toLowerCase().trim();
		renderSidebar();
		renderMain();
	});

	const deleteBtn = document.getElementById('delete-context-btn') as HTMLButtonElement;
	deleteBtn.addEventListener('click', deleteCurrentContext);

	const exportBtn = document.getElementById('export-context-btn') as HTMLButtonElement;
	exportBtn.addEventListener('click', exportCurrentContext);

	initializeMenu('highlights-sort-btn', 'highlights-sort-menu');
	const sortMenu = document.getElementById('highlights-sort-menu')!;
	sortMenu.querySelectorAll<HTMLElement>('.menu-item[data-sort]').forEach(item => {
		item.addEventListener('click', () => {
			const value = item.dataset.sort as SortOrder;
			if (value === sortOrder) return;
			sortOrder = value;
			updateSortMenuActiveState();
			renderSidebar();
			renderMain();
		});
	});
	updateSortMenuActiveState();

	const sidebarTitle = document.getElementById('highlights-sidebar-title');
	sidebarTitle?.addEventListener('click', () => navigate({ type: 'all' }));

	const settingsLink = document.getElementById('highlights-settings-link');
	settingsLink?.addEventListener('click', (e) => e.stopPropagation());

	const navbarTitle = document.getElementById('highlights-navbar-title');
	navbarTitle?.addEventListener('click', () => navigate({ type: 'all' }));

	// Mobile hamburger
	const hamburger = document.getElementById('highlights-hamburger');
	const container = document.getElementById('highlights');
	if (hamburger && container) {
		hamburger.addEventListener('click', () => {
			container.classList.toggle('sidebar-open');
			hamburger.classList.toggle('is-active');
		});
	}

	// Listen for storage changes
	browser.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes.highlights) {
			loadData().then(() => {
				renderSidebar();
				renderMain();
			});
		}
	});

	// Set up sentinel observer for infinite scroll
	const sentinel = document.getElementById('highlights-sentinel')!;
	observer = new IntersectionObserver((entries) => {
		if (entries[0].isIntersecting) {
			renderNextBatch();
		}
	}, { rootMargin: '200px' });
	observer.observe(sentinel);

	createIcons({ icons });
});

// --- Reader theme ---

let highlightThemeClasses: string[] = [];
let highlightThemeAttr: { name: string; value: string } | null = null;

async function applyReaderTheme() {
	const data = await browser.storage.sync.get('reader_settings');
	const settings = data.reader_settings as ReaderSettings | undefined;

	const isDark = settings
		? settings.appearance === 'dark' || (settings.appearance === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
		: window.matchMedia('(prefers-color-scheme: dark)').matches;

	highlightThemeClasses = ['obsidian-reader-active', isDark ? 'theme-dark' : 'theme-light'];

	if (settings) {
		const effectiveTheme = isDark && settings.darkTheme !== 'same' ? settings.darkTheme : settings.lightTheme;
		if (effectiveTheme && effectiveTheme !== 'default') {
			highlightThemeAttr = { name: 'data-reader-theme', value: effectiveTheme };
		}

		// Font settings apply globally
		const html = document.documentElement;
		html.style.setProperty('--font-text-size', `${settings.fontSize}px`);
		html.style.setProperty('--line-height-normal', settings.lineHeight.toString());

		const fontCss = getFontCss(settings.defaultFont);
		if (fontCss) {
			document.body.style.setProperty('--font-text', fontCss);
		}
	}
}

function applyThemeToElement(el: HTMLElement) {
	for (const cls of highlightThemeClasses) {
		el.classList.add(cls);
	}
	if (highlightThemeAttr) {
		el.setAttribute(highlightThemeAttr.name, highlightThemeAttr.value);
	}
}

// --- Data loading ---

async function loadData() {
	const result = await browser.storage.local.get(['highlights', 'domains']);
	const allHighlights = (result.highlights || {}) as Record<string, StoredData>;
	domainSettingsMap = (result.domains || {}) as Record<string, DomainSettings>;

	// Merge entries that normalize to the same URL
	const mergedMap = new Map<string, { stored: StoredData; originalKeys: string[] }>();
	for (const [urlKey, stored] of Object.entries(allHighlights)) {
		if (!stored.highlights || stored.highlights.length === 0) continue;
		const normUrl = normalizeUrl(stored.url || urlKey);
		const existing = mergedMap.get(normUrl);
		if (existing) {
			// Merge highlights, keep best title
			existing.stored.highlights = [...existing.stored.highlights, ...stored.highlights];
			if (!existing.stored.title && stored.title) existing.stored.title = stored.title;
			existing.originalKeys.push(urlKey);
		} else {
			mergedMap.set(normUrl, {
				stored: { ...stored, url: normUrl, highlights: [...stored.highlights] },
				originalKeys: [urlKey],
			});
		}
	}

	// Persist merges if any duplicates were found
	let needsSave = false;
	for (const [normUrl, { stored, originalKeys }] of mergedMap) {
		if (originalKeys.length > 1 || originalKeys[0] !== normUrl) {
			needsSave = true;
			for (const key of originalKeys) {
				if (key !== normUrl) delete allHighlights[key];
			}
			allHighlights[normUrl] = stored;
		}
	}
	if (needsSave) {
		browser.storage.local.set({ highlights: allHighlights });
	}

	const domainMap = new Map<string, PageGroup[]>();

	for (const [, { stored }] of mergedMap) {
		let domain: string;
		let path: string;
		try {
			const parsed = new URL(stored.url);
			domain = parsed.hostname.replace(/^www\./, '');
			path = parsed.pathname + parsed.search;
		} catch {
			domain = stored.url;
			path = '/';
		}

		if (!domainMap.has(domain)) {
			domainMap.set(domain, []);
		}

		domainMap.get(domain)!.push({
			url: stored.url,
			path,
			title: stored.title,
			highlights: stored.highlights.map(h => ({ data: h, url: stored.url })),
		});
	}

	allDomainGroups = Array.from(domainMap.entries())
		.map(([domain, pages]) => ({
			domain,
			pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
			totalHighlights: pages.reduce((sum, p) => sum + p.highlights.length, 0),
		}));

	// If current nav references something that no longer exists, reset
	const nav = currentNav;
	if (nav.type === 'domain') {
		if (!allDomainGroups.find(g => g.domain === nav.domain)) {
			currentNav = { type: 'all' };
		}
	} else if (nav.type === 'page') {
		const group = allDomainGroups.find(g => g.domain === nav.domain);
		if (!group || !group.pages.find(p => p.url === nav.url)) {
			currentNav = { type: 'all' };
		}
	}
}

// --- Search ---

function matchesSearch(entry: HighlightEntry): boolean {
	if (!searchQuery) return true;
	const content = entry.data.content?.toLowerCase() || '';
	const notes = entry.data.notes?.join(' ').toLowerCase() || '';
	const url = entry.url.toLowerCase();
	return content.includes(searchQuery) || notes.includes(searchQuery) || url.includes(searchQuery);
}

function getFilteredGroups(): DomainGroup[] {
	if (!searchQuery) return sortGroups([...allDomainGroups]);

	const filtered: DomainGroup[] = [];
	for (const group of allDomainGroups) {
		// Check if domain/site name matches — if so, include all pages
		const normalized = group.domain.replace(/^www\./, '');
		const siteName = domainSettingsMap[normalized]?.site?.toLowerCase() || '';
		const domainMatches = group.domain.toLowerCase().includes(searchQuery) || siteName.includes(searchQuery);

		const filteredPages: PageGroup[] = [];
		for (const page of group.pages) {
			// Check if page title matches — if so, include all its highlights
			const titleMatches = page.title?.toLowerCase().includes(searchQuery) || false;

			if (domainMatches || titleMatches) {
				filteredPages.push(page);
			} else {
				const filteredHighlights = page.highlights.filter(matchesSearch);
				if (filteredHighlights.length > 0) {
					filteredPages.push({ ...page, highlights: filteredHighlights });
				}
			}
		}
		if (filteredPages.length > 0) {
			filtered.push({
				...group,
				pages: filteredPages,
				totalHighlights: filteredPages.reduce((sum, p) => sum + p.highlights.length, 0),
			});
		}
	}
	return sortGroups(filtered);
}

function newestTimestamp(group: DomainGroup): number {
	let max = 0;
	for (const page of group.pages) {
		for (const h of page.highlights) {
			const t = parseInt(h.data.id) || 0;
			if (t > max) max = t;
		}
	}
	return max;
}

function oldestTimestamp(group: DomainGroup): number {
	let min = Infinity;
	for (const page of group.pages) {
		for (const h of page.highlights) {
			const t = parseInt(h.data.id) || Infinity;
			if (t < min) min = t;
		}
	}
	return min;
}

function sortGroups(groups: DomainGroup[]): DomainGroup[] {
	switch (sortOrder) {
		case 'az':
			return groups.sort((a, b) => displayDomain(a.domain).localeCompare(displayDomain(b.domain)));
		case 'za':
			return groups.sort((a, b) => displayDomain(b.domain).localeCompare(displayDomain(a.domain)));
		case 'new':
			return groups.sort((a, b) => newestTimestamp(b) - newestTimestamp(a));
		case 'old':
			return groups.sort((a, b) => oldestTimestamp(a) - oldestTimestamp(b));
	}
}

// --- Sidebar ---

function navigate(nav: NavSelection) {
	currentNav = nav;
	updateUrlFromNav();
	updateSidebarActiveState();
	renderMain();

	// Close mobile sidebar
	const container = document.getElementById('highlights');
	const hamburger = document.getElementById('highlights-hamburger');
	container?.classList.remove('sidebar-open');
	hamburger?.classList.remove('is-active');
}

function updateSortMenuActiveState() {
	const menu = document.getElementById('highlights-sort-menu');
	if (!menu) return;
	menu.querySelectorAll<HTMLElement>('.menu-item[data-sort]').forEach(item => {
		item.classList.toggle('is-active', item.dataset.sort === sortOrder);
	});
}

function updateSidebarActiveState() {
	const domainListEl = document.getElementById('highlights-domain-list')!;
	domainListEl.querySelectorAll('.nav-domain').forEach(li => {
		const domain = li.getAttribute('data-domain');
		li.classList.toggle('active', currentNav.type === 'domain' && currentNav.domain === domain);
	});
	domainListEl.querySelectorAll('.nav-page').forEach(li => {
		const url = li.getAttribute('data-url');
		li.classList.toggle('active', currentNav.type === 'page' && (currentNav as { url: string }).url === url);
	});
}

function updateUrlFromNav() {
	const params = new URLSearchParams();
	if (currentNav.type === 'domain') {
		params.set('domain', currentNav.domain);
	} else if (currentNav.type === 'page') {
		params.set('domain', currentNav.domain);
		params.set('url', currentNav.url);
	}
	const search = params.toString();
	const newUrl = window.location.pathname + (search ? '?' + search : '');
	window.history.replaceState({}, '', newUrl);
}

function readNavFromUrl(): NavSelection {
	const params = new URLSearchParams(window.location.search);
	const domain = params.get('domain')?.replace(/^www\./, '');
	const url = params.get('url');
	if (url && domain) {
		return { type: 'page', domain, url };
	} else if (domain) {
		return { type: 'domain', domain };
	}
	return { type: 'all' };
}

function createPageSubItems(group: DomainGroup): HTMLElement[] {
	const items: HTMLElement[] = [];
	for (const page of group.pages) {
		const isPageActive = currentNav.type === 'page'
			&& (currentNav as { domain: string; url: string }).domain === group.domain
			&& (currentNav as { url: string }).url === page.url;

		const pageLi = document.createElement('li');
		pageLi.className = 'nav-page' + (isPageActive ? ' active' : '');
		pageLi.setAttribute('data-url', page.url);

		const pageName = document.createElement('span');
		pageName.className = 'nav-page-name';
		pageName.textContent = page.title || displayPath(page.path);
		pageName.title = page.url;
		pageLi.appendChild(pageName);

		const pageCount = document.createElement('span');
		pageCount.className = 'nav-count';
		pageCount.textContent = String(page.highlights.length);
		pageLi.appendChild(pageCount);

		pageLi.addEventListener('click', (e) => {
			e.stopPropagation();
			navigate({ type: 'page', domain: group.domain, url: page.url });
		});

		items.push(pageLi);
	}
	return items;
}

function renderSidebar() {
	const domainListEl = document.getElementById('highlights-domain-list')!;
	const filtered = getFilteredGroups();

	domainListEl.textContent = '';

	for (const group of filtered) {
		const isExpanded = expandedSidebarDomains.has(group.domain);
		const isDomainActive = currentNav.type === 'domain' && currentNav.domain === group.domain;

		const li = document.createElement('li');
		li.className = 'nav-domain' + (isDomainActive ? ' active' : '');
		li.setAttribute('data-domain', group.domain);

		const chevronWrap = document.createElement('div');
		chevronWrap.className = 'nav-chevron-wrap' + (isExpanded ? ' is-expanded' : '');
		const chevronIcon = document.createElement('i');
		chevronIcon.setAttribute('data-lucide', 'chevron-right');
		chevronWrap.appendChild(chevronIcon);
		li.appendChild(chevronWrap);

		const normalized = group.domain.replace(/^www\./, '');
		const domainSettings = domainSettingsMap[normalized];
		const siteName = domainSettings?.site;

		if (domainSettings?.favicon) {
			let favicon = faviconCache.get(normalized);
			if (!favicon) {
				favicon = document.createElement('img');
				favicon.className = 'nav-domain-favicon';
				favicon.src = domainSettings.favicon;
				favicon.width = 16;
				favicon.height = 16;
				favicon.onerror = () => favicon!.remove();
				faviconCache.set(normalized, favicon);
			}
			li.appendChild(favicon);
		}

		const name = document.createElement('span');
		name.className = 'nav-domain-name';
		name.textContent = siteName || displayDomain(group.domain);
		if (siteName) name.title = displayDomain(group.domain);
		li.appendChild(name);

		const count = document.createElement('span');
		count.className = 'nav-count';
		count.textContent = String(group.totalHighlights);
		li.appendChild(count);

		// Click chevron to expand/collapse, click name to navigate
		chevronWrap.addEventListener('click', (e) => {
			e.stopPropagation();
			const wasExpanded = expandedSidebarDomains.has(group.domain);
			if (wasExpanded) {
				expandedSidebarDomains.delete(group.domain);
				chevronWrap.classList.remove('is-expanded');
				// Remove page sub-items
				let next = li.nextElementSibling;
				while (next && next.classList.contains('nav-page')) {
					const toRemove = next;
					next = next.nextElementSibling;
					toRemove.remove();
				}
			} else {
				expandedSidebarDomains.add(group.domain);
				chevronWrap.classList.add('is-expanded');
				// Insert page sub-items after this domain li
				const pageItems = createPageSubItems(group);
				let insertAfter: Element = li;
				for (const pageLi of pageItems) {
					insertAfter.after(pageLi);
					insertAfter = pageLi;
				}
				createIcons({ icons });
			}
		});

		li.addEventListener('click', () => {
			const isActive = currentNav.type === 'domain' && currentNav.domain === group.domain;
			if (isActive) {
				// Already selected — toggle expand/collapse
				if (expandedSidebarDomains.has(group.domain)) {
					expandedSidebarDomains.delete(group.domain);
					chevronWrap.classList.remove('is-expanded');
					let next = li.nextElementSibling;
					while (next && next.classList.contains('nav-page')) {
						const toRemove = next;
						next = next.nextElementSibling;
						toRemove.remove();
					}
				} else {
					expandedSidebarDomains.add(group.domain);
					chevronWrap.classList.add('is-expanded');
					let insertAfter: Element = li;
					for (const pageLi of createPageSubItems(group)) {
						insertAfter.after(pageLi);
						insertAfter = pageLi;
					}
					createIcons({ icons });
				}
			} else {
				navigate({ type: 'domain', domain: group.domain });
			}
		});

		domainListEl.appendChild(li);

		// Page sub-items
		if (isExpanded) {
			const pageItems = createPageSubItems(group);
			for (const pageLi of pageItems) {
				domainListEl.appendChild(pageLi);
			}
		}
	}

	createIcons({ icons });
}

// --- Main content ---

function getVisibleEntries(): { entry: HighlightEntry; pageUrl: string; domain: string; title?: string }[] {
	const filtered = getFilteredGroups();
	const nav = currentNav;
	const entries: { entry: HighlightEntry; pageUrl: string; domain: string; title?: string }[] = [];

	for (const group of filtered) {
		if (nav.type === 'domain' && nav.domain !== group.domain) continue;
		if (nav.type === 'page' && nav.domain !== group.domain) continue;

		for (const page of group.pages) {
			if (nav.type === 'page' && nav.url !== page.url) continue;

			for (const highlight of page.highlights) {
				entries.push({ entry: highlight, pageUrl: page.url, domain: group.domain, title: page.title });
			}
		}
	}

	return entries;
}

function renderMain() {
	const listEl = document.getElementById('highlights-list')!;
	const emptyEl = document.getElementById('highlights-empty')!;
	const deleteBtn = document.getElementById('delete-context-btn')!;
	const exportBtn = document.getElementById('export-context-btn')!;

	listEl.textContent = '';
	renderedCount = 0;
	currentPageGroup = null;

	flatEntries = getVisibleEntries();

	// Breadcrumb
	renderBreadcrumb();

	// Delete button label
	updateDeleteButton();

	if (flatEntries.length === 0) {
		emptyEl.style.display = '';
		const noData = allDomainGroups.length === 0;
		deleteBtn.style.display = noData ? 'none' : '';
		exportBtn.style.display = noData ? 'none' : '';
		return;
	}

	emptyEl.style.display = 'none';
	deleteBtn.style.display = '';
	exportBtn.style.display = '';

	// Show page in same format as multi-page view
	const nav = currentNav;
	if (nav.type === 'page') {
		const pageGroup = allDomainGroups
			.find(g => g.domain === nav.domain)?.pages
			.find(p => p.url === nav.url);

		currentPageGroup = createPageGroupWrapper();
		listEl.appendChild(currentPageGroup);
		const pageHeader = createPageHeader(nav.url, nav.domain, pageGroup?.title);
		currentPageGroup.appendChild(pageHeader);

		renderNextBatch();
		createIcons({ icons });
		return;
	}

	renderNextBatch();
}

function createPageGroupWrapper(): HTMLElement {
	const wrapper = document.createElement('div');
	wrapper.className = 'highlight-page-group';
	applyThemeToElement(wrapper);
	return wrapper;
}

function renderNextBatch() {
	const listEl = document.getElementById('highlights-list')!;
	const end = Math.min(renderedCount + BATCH_SIZE, flatEntries.length);

	if (renderedCount >= flatEntries.length) return;

	// Track which page group we're in to insert page headers
	let lastPageUrl = renderedCount > 0 ? flatEntries[renderedCount - 1].pageUrl : null;

	// For single-page view, ensure we have a group wrapper
	if (currentNav.type === 'page' && !currentPageGroup) {
		currentPageGroup = createPageGroupWrapper();
		listEl.appendChild(currentPageGroup);
	}

	for (let i = renderedCount; i < end; i++) {
		const { entry, pageUrl, domain, title } = flatEntries[i];

		// Insert a page header when the URL changes (in all/domain views)
		if (currentNav.type !== 'page' && pageUrl !== lastPageUrl) {
			currentPageGroup = createPageGroupWrapper();
			listEl.appendChild(currentPageGroup);
			const pageHeader = createPageHeader(pageUrl, domain, title);
			currentPageGroup.appendChild(pageHeader);
			lastPageUrl = pageUrl;
		}

		(currentPageGroup || listEl).appendChild(createHighlightItem(entry));
	}

	renderedCount = end;
	createIcons({ icons });
}

function renderBreadcrumb() {
	const breadcrumbEl = document.getElementById('highlights-breadcrumb')!;
	breadcrumbEl.textContent = '';
	const nav = currentNav;

	if (nav.type === 'all') {
		const span = document.createElement('span');
		span.className = 'breadcrumb-current';
		span.textContent = getMessage('allHighlights');
		breadcrumbEl.appendChild(span);
		return;
	}

	// "All" link
	const allLink = document.createElement('a');
	allLink.className = 'breadcrumb-link';
	allLink.href = '#';
	allLink.textContent = getMessage('allHighlights');
	allLink.addEventListener('click', (e) => {
		e.preventDefault();
		navigate({ type: 'all' });
	});
	breadcrumbEl.appendChild(allLink);

	breadcrumbEl.appendChild(createBreadcrumbSeparator());

	if (nav.type === 'domain') {
		const span = document.createElement('span');
		span.className = 'breadcrumb-current';
		span.textContent = siteNameOrDomain(nav.domain);
		breadcrumbEl.appendChild(span);
	} else if (nav.type === 'page') {
		const domainSpan = document.createElement('span');
		domainSpan.className = 'breadcrumb-current';
		domainSpan.textContent = siteNameOrDomain(nav.domain);
		domainSpan.style.cursor = 'pointer';
		domainSpan.addEventListener('click', () => {
			navigate({ type: 'domain', domain: nav.domain });
		});
		breadcrumbEl.appendChild(domainSpan);
	}
}

function createBreadcrumbSeparator(): HTMLElement {
	const sep = document.createElement('span');
	sep.className = 'breadcrumb-separator';
	sep.textContent = '/';
	return sep;
}

function updateDeleteButton() {
	const deleteBtn = document.getElementById('delete-context-btn')!;

	deleteBtn.textContent = getMessage('delete');
}

async function deleteCurrentContext() {
	const nav = currentNav;
	if (nav.type === 'all') {
		if (!confirm(getMessage('deleteAllHighlightsConfirm'))) return;
		await browser.storage.local.set({ highlights: {} });
	} else if (nav.type === 'domain') {
		if (!confirm(getMessage('deleteHighlightsForDomain'))) return;
		const group = allDomainGroups.find(g => g.domain === nav.domain);
		if (group) await deleteHighlightsForDomain(group);
	} else if (nav.type === 'page') {
		if (!confirm(getMessage('deleteHighlightsForPage'))) return;
		await deleteHighlightsForUrl(nav.url);
	}
}

async function exportCurrentContext() {
	const entries = getVisibleEntries();
	if (entries.length === 0) return;

	// Group by URL to match the existing export format
	const byUrl = new Map<string, HighlightEntry[]>();
	for (const { entry, pageUrl } of entries) {
		if (!byUrl.has(pageUrl)) byUrl.set(pageUrl, []);
		byUrl.get(pageUrl)!.push(entry);
	}

	const exportData = Array.from(byUrl.entries()).map(([url, highlights]) => ({
		url,
		highlights: highlights.map(h => ({
			text: h.data.content,
			timestamp: dayjs(parseInt(h.data.id)).toISOString()
		}))
	}));

	const jsonContent = JSON.stringify(exportData, null, 2);
	const blob = new Blob([jsonContent], { type: 'application/json' });
	const blobUrl = URL.createObjectURL(blob);

	const browserType = await detectBrowser();
	const timestamp = dayjs().format('YYYYMMDDHHmm');
	const fileName = `obsidian-web-clipper-highlights-${timestamp}.json`;

	if (browserType === 'safari' || browserType === 'mobile-safari') {
		if (navigator.share) {
			try {
				await navigator.share({
					files: [new File([blob], fileName, { type: 'application/json' })],
					title: 'Exported Obsidian Web Clipper Highlights',
				});
			} catch {
				window.open(blobUrl);
			}
		} else {
			window.open(blobUrl);
		}
	} else {
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	URL.revokeObjectURL(blobUrl);
}

function getLatestTimestamp(url: string): dayjs.Dayjs | null {
	const group = allDomainGroups.find(g => g.pages.some(p => p.url === url));
	const page = group?.pages.find(p => p.url === url);
	if (!page || page.highlights.length === 0) return null;
	let latest = 0;
	for (const h of page.highlights) {
		const t = parseInt(h.data.id);
		if (t > latest) latest = t;
	}
	const time = dayjs(latest);
	return time.isValid() ? time : null;
}

// --- Page headers in main content ---

function createPageHeader(url: string, domain: string, title?: string): HTMLElement {
	const header = document.createElement('div');
	header.className = 'highlight-page-header';

	const titleText = title || (() => {
		try {
			const parsed = new URL(url);
			return displayPath(parsed.pathname + parsed.search);
		} catch {
			return url;
		}
	})();

	const titleRow = document.createElement('div');
	titleRow.className = 'highlight-page-title-row';

	const titleLink = document.createElement('a');
	titleLink.className = 'highlight-page-title';
	titleLink.href = '#';
	titleLink.title = url;
	titleLink.textContent = titleText;
	titleLink.addEventListener('click', (e) => {
		e.preventDefault();
		navigate({ type: 'page', domain, url });
	});
	titleRow.appendChild(titleLink);

	const readerBtn = document.createElement('a');
	readerBtn.className = 'highlight-reader-btn clickable-icon';
	readerBtn.href = `reader.html?url=${encodeURIComponent(url)}`;
	readerBtn.target = '_blank';
	readerBtn.title = getMessage('loadArticle') || 'Read article';
	const readerIcon = document.createElement('i');
	readerIcon.setAttribute('data-lucide', 'book-open');
	readerBtn.appendChild(readerIcon);
	titleRow.appendChild(readerBtn);

	header.appendChild(titleRow);

	// Site name and latest timestamp
	const metaLine = document.createElement('div');
	metaLine.className = 'highlight-page-meta';

	const siteSpan = document.createElement('a');
	siteSpan.className = 'highlight-page-site';
	siteSpan.href = '#';
	siteSpan.textContent = siteNameOrDomain(domain);
	siteSpan.addEventListener('click', (e) => {
		e.preventDefault();
		navigate({ type: 'domain', domain });
	});
	metaLine.appendChild(siteSpan);

	const latestTime = getLatestTimestamp(url);
	if (latestTime) {
		const timeSpan = document.createElement('span');
		timeSpan.className = 'highlight-page-time';
		timeSpan.textContent = latestTime.fromNow();
		timeSpan.title = latestTime.format('YYYY-MM-DD HH:mm');
		metaLine.appendChild(timeSpan);
	}

	header.appendChild(metaLine);

	// Only show sync button if page has no title yet
	if (!title) {
		const syncBtn = document.createElement('button');
		syncBtn.className = 'highlight-sync-btn clickable-icon';
		const syncIcon = document.createElement('i');
		syncIcon.setAttribute('data-lucide', 'rotate-cw');
		syncBtn.appendChild(syncIcon);
		syncBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			e.preventDefault();
			syncBtn.classList.add('is-syncing');
			const meta = await fetchDefuddled(url);
			syncBtn.classList.remove('is-syncing');
			if (meta) {
				if (meta.title) titleLink.textContent = meta.title;
				if (meta.title || meta.site) syncBtn.style.display = 'none';
			}
		});
		header.appendChild(syncBtn);
	}

	return header;
}

interface DefuddleResult {
	title?: string;
	site?: string;
	content?: string;
}

async function fetchDefuddled(url: string): Promise<DefuddleResult | null> {
	try {
		let html: string;
		const fetchResult = await browser.runtime.sendMessage({
			action: 'fetchProxy', url, options: {},
		}) as { ok: boolean; status: number; text: string; error?: string };
		if (fetchResult?.error === 'CORS_PERMISSION_NEEDED') {
			await browser.permissions.request({ origins: ['<all_urls>'] });
			const retry = await browser.runtime.sendMessage({
				action: 'fetchProxy', url, options: {},
			}) as { ok: boolean; status: number; text: string; error?: string };
			if (!retry?.ok) throw new Error(retry?.error || 'Permission not granted');
			html = retry.text;
		} else if (!fetchResult?.ok) {
			throw new Error(fetchResult?.error || `HTTP ${fetchResult?.status}`);
		} else {
			html = fetchResult.text;
		}
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		// Set the base URL so relative URLs resolve correctly
		const base = doc.createElement('base');
		base.href = url;
		doc.head.prepend(base);

		const defuddled = new Defuddle(doc, { url }).parse();

		const title = defuddled.title || undefined;
		const site = defuddled.site || undefined;
		const favicon = defuddled.favicon || undefined;
		const content = defuddled.content || undefined;

		// Save title to highlights storage
		if (title) {
			const result = await browser.storage.local.get('highlights');
			const allHighlights = (result.highlights || {}) as Record<string, StoredData>;
			if (allHighlights[url]) {
				allHighlights[url].title = title;
				await browser.storage.local.set({ highlights: allHighlights });
			}
		}

		// Save site and favicon to domains storage
		if (site || favicon) {
			let hostname: string;
			try {
				hostname = new URL(url).hostname.replace(/^www\./, '');
			} catch {
				return { title, site, content };
			}
			const domResult = await browser.storage.local.get('domains');
			const domains = (domResult.domains || {}) as Record<string, DomainSettings>;
			if (!domains[hostname]) domains[hostname] = {};
			let changed = false;
			if (site && !domains[hostname].site) {
				domains[hostname].site = site;
				changed = true;
			}
			if (favicon && !domains[hostname].favicon) {
				try {
					domains[hostname].favicon = new URL(favicon, url).href;
				} catch {
					domains[hostname].favicon = favicon;
				}
				changed = true;
			}
			if (changed) {
				domainSettingsMap[hostname] = domains[hostname];
				await browser.storage.local.set({ domains });
				renderSidebar();
				createIcons({ icons });
			}
		}

		return { title, site, content };
	} catch (error) {
		console.error('Failed to fetch page:', url, error);
		return null;
	}
}


// --- Individual highlight items ---

function setButtonIcon(btn: HTMLElement, iconName: string) {
	btn.textContent = '';
	const icon = document.createElement('i');
	icon.setAttribute('data-lucide', iconName);
	btn.appendChild(icon);
	createIcons({ icons });
}

function createHighlightItem(entry: HighlightEntry): HTMLElement {
	const item = document.createElement('div');
	item.className = 'highlight-item';

	const content = document.createElement('div');
	content.className = 'highlight-item-content';

	const sanitized = DOMPurify.sanitize(entry.data.content || '');
	content.innerHTML = sanitized;
	if (searchQuery) {
		highlightTextNodes(content, searchQuery);
	}
	item.appendChild(content);

	if (entry.data.notes && entry.data.notes.length > 0) {
		for (const note of entry.data.notes) {
			const noteEl = document.createElement('div');
			noteEl.className = 'highlight-item-note';
			noteEl.textContent = note;
			item.appendChild(noteEl);
		}
	}

	const footer = document.createElement('div');
	footer.className = 'highlight-item-actions-container';

	const actions = document.createElement('div');
	actions.className = 'highlight-item-actions';

	const copyBtn = document.createElement('button');
	copyBtn.className = 'highlight-action-btn clickable-icon';
	copyBtn.title = getMessage('copyToClipboard');
	const copyIcon = document.createElement('i');
	copyIcon.setAttribute('data-lucide', 'copy');
	copyBtn.appendChild(copyIcon);
	copyBtn.addEventListener('click', async () => {
		const markdown = createMarkdownContent(entry.data.content || '', entry.url);
		await navigator.clipboard.writeText(markdown);
		copyBtn.classList.add('is-copied');
		setButtonIcon(copyBtn, 'check');
		setTimeout(() => {
			copyBtn.classList.remove('is-copied');
			setButtonIcon(copyBtn, 'copy');
		}, 1500);
	});
	actions.appendChild(copyBtn);

	const deleteBtn = document.createElement('button');
	deleteBtn.className = 'highlight-action-btn clickable-icon';
	deleteBtn.title = getMessage('delete');
	const deleteItemIcon = document.createElement('i');
	deleteItemIcon.setAttribute('data-lucide', 'trash-2');
	deleteBtn.appendChild(deleteItemIcon);
	deleteBtn.addEventListener('click', async () => {
		await deleteHighlight(entry.url, entry.data.id);
	});
	actions.appendChild(deleteBtn);

	footer.appendChild(actions);
	item.appendChild(footer);

	return item;
}

// --- Helpers ---

function highlightTextNodes(root: HTMLElement, query: string) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const matches: { node: Text; index: number; length: number }[] = [];
	const lowerQuery = query.toLowerCase();

	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		const text = node.textContent || '';
		let idx = text.toLowerCase().indexOf(lowerQuery);
		while (idx !== -1) {
			matches.push({ node, index: idx, length: query.length });
			idx = text.toLowerCase().indexOf(lowerQuery, idx + query.length);
		}
	}

	// Process in reverse so indices stay valid
	for (let i = matches.length - 1; i >= 0; i--) {
		const { node: textNode, index, length } = matches[i];
		const after = textNode.splitText(index);
		const matched = after.splitText(length);
		const mark = document.createElement('mark');
		mark.textContent = after.textContent;
		after.parentNode!.replaceChild(mark, after);
		// matched is already in the DOM after mark
		void matched;
	}
}

function displayDomain(domain: string): string {
	return domain.replace(/^www\./, '');
}

function siteNameOrDomain(domain: string): string {
	const normalized = domain.replace(/^www\./, '');
	return domainSettingsMap[normalized]?.site || normalized;
}

function displayPath(path: string): string {
	return decodeURIComponent(path).replace(/^\//, '');
}

// --- Storage mutations ---

async function deleteHighlight(url: string, highlightId: string) {
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as Record<string, StoredData>;

	if (allHighlights[url]) {
		allHighlights[url].highlights = allHighlights[url].highlights.filter(h => h.id !== highlightId);
		if (allHighlights[url].highlights.length === 0) {
			delete allHighlights[url];
		}
		await browser.storage.local.set({ highlights: allHighlights });
	}
}

async function deleteHighlightsForUrl(url: string) {
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as Record<string, StoredData>;
	delete allHighlights[url];
	await browser.storage.local.set({ highlights: allHighlights });
}

async function deleteHighlightsForDomain(group: DomainGroup) {
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as Record<string, StoredData>;
	for (const page of group.pages) {
		delete allHighlights[page.url];
	}
	await browser.storage.local.set({ highlights: allHighlights });
}

import browser from '../utils/browser-polyfill';
import { AnyHighlightData, StoredData, DomainSettings, normalizeUrl } from '../utils/highlighter';
import { translatePage, getMessage, setupLanguageAndDirection } from '../utils/i18n';
import { addBrowserClassToHtml, detectBrowser } from '../utils/browser-detection';
import DOMPurify from 'dompurify';
import Defuddle from 'defuddle';
import { getFontCss } from '../utils/font-utils';
import { ReaderSettings } from '../types/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';

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

// Batched rendering
const BATCH_SIZE = 50;
let flatEntries: { entry: HighlightEntry; pageUrl: string; domain: string; title?: string }[] = [];
let renderedCount = 0;
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

	const sortSelect = document.getElementById('highlights-sort') as HTMLSelectElement;
	sortSelect.addEventListener('change', () => {
		sortOrder = sortSelect.value as SortOrder;
		renderSidebar();
		renderMain();
	});

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

async function applyReaderTheme() {
	const data = await browser.storage.sync.get('reader_settings');
	const settings = data.reader_settings as ReaderSettings | undefined;
	if (!settings) return;

	const html = document.documentElement;

	// Add reader class so theme CSS variables activate
	html.classList.add('obsidian-reader-active');

	// Determine light/dark
	const isDark = settings.appearance === 'dark' ||
		(settings.appearance === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
	html.classList.add(isDark ? 'theme-dark' : 'theme-light');

	// Apply theme
	const effectiveTheme = isDark && settings.darkTheme !== 'same' ? settings.darkTheme : settings.lightTheme;
	if (effectiveTheme && effectiveTheme !== 'default') {
		html.setAttribute('data-reader-theme', effectiveTheme);
	}

	// Apply font settings
	html.style.setProperty('--font-text-size', `${settings.fontSize}px`);
	html.style.setProperty('--line-height-normal', settings.lineHeight.toString());

	const fontCss = getFontCss(settings.defaultFont);
	if (fontCss) {
		document.body.style.setProperty('--font-text', fontCss);
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
			domain = parsed.hostname;
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
	renderSidebar();
	renderMain();

	// Close mobile sidebar
	const container = document.getElementById('highlights');
	const hamburger = document.getElementById('highlights-hamburger');
	container?.classList.remove('sidebar-open');
	hamburger?.classList.remove('is-active');
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
	const domain = params.get('domain');
	const url = params.get('url');
	if (url && domain) {
		return { type: 'page', domain, url };
	} else if (domain) {
		return { type: 'domain', domain };
	}
	return { type: 'all' };
}

function renderSidebar() {
	const domainListEl = document.getElementById('highlights-domain-list')!;
	const allNavItem = document.querySelector('#highlights-nav li[data-nav="all"]')!;
	const allCountEl = document.getElementById('nav-count-all')!;

	const filtered = getFilteredGroups();
	const totalCount = filtered.reduce((sum, g) => sum + g.totalHighlights, 0);
	allCountEl.textContent = totalCount > 0 ? String(totalCount) : '';

	// Update "All" active state
	allNavItem.classList.toggle('active', currentNav.type === 'all');
	allNavItem.addEventListener('click', () => navigate({ type: 'all' }), { once: true });

	domainListEl.textContent = '';

	for (const group of filtered) {
		const isExpanded = expandedSidebarDomains.has(group.domain);
		const isDomainActive = currentNav.type === 'domain' && currentNav.domain === group.domain;

		const li = document.createElement('li');
		li.className = 'nav-domain' + (isDomainActive ? ' active' : '');

		const chevronWrap = document.createElement('div');
		chevronWrap.className = 'nav-chevron-wrap' + (isExpanded ? ' is-expanded' : '');
		const chevronIcon = document.createElement('i');
		chevronIcon.setAttribute('data-lucide', 'chevron-right');
		chevronWrap.appendChild(chevronIcon);
		li.appendChild(chevronWrap);

		const normalized = group.domain.replace(/^www\./, '');
		const siteName = domainSettingsMap[normalized]?.site;

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
			if (expandedSidebarDomains.has(group.domain)) {
				expandedSidebarDomains.delete(group.domain);
			} else {
				expandedSidebarDomains.add(group.domain);
			}
			renderSidebar();
			createIcons({ icons });
		});

		li.addEventListener('click', () => {
			navigate({ type: 'domain', domain: group.domain });
		});

		domainListEl.appendChild(li);

		// Page sub-items
		if (isExpanded) {
			for (const page of group.pages) {
				const isPageActive = currentNav.type === 'page'
					&& (currentNav as { domain: string; url: string }).domain === group.domain
					&& (currentNav as { url: string }).url === page.url;

				const pageLi = document.createElement('li');
				pageLi.className = 'nav-page' + (isPageActive ? ' active' : '');

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

	// Show page title as h1 when viewing a single page
	const nav = currentNav;
	if (nav.type === 'page') {
		const pageGroup = allDomainGroups
			.find(g => g.domain === nav.domain)?.pages
			.find(p => p.url === nav.url);

		const titleEl = document.createElement('h1');
		titleEl.className = 'highlight-page-title';

		const titleText = pageGroup?.title || (() => {
			try { return displayPath(new URL(nav.url).pathname + new URL(nav.url).search); }
			catch { return nav.url; }
		})();
		titleEl.textContent = titleText;

		const pageLink = document.createElement('a');
		pageLink.className = 'highlight-page-title-url';
		pageLink.href = nav.url;
		pageLink.target = '_blank';
		pageLink.rel = 'noopener';
		pageLink.textContent = nav.url;

		listEl.appendChild(titleEl);
		listEl.appendChild(pageLink);

		// Show sync button if no title
		if (!pageGroup?.title) {
			const syncBtn = document.createElement('button');
			syncBtn.className = 'highlight-sync-btn clickable-icon highlight-sync-btn-visible';
			const syncIcon = document.createElement('i');
			syncIcon.setAttribute('data-lucide', 'rotate-cw');
			syncBtn.appendChild(syncIcon);
			syncBtn.addEventListener('click', async () => {
				syncBtn.classList.add('is-syncing');
				const meta = await fetchPageMetadata(nav.url);
				syncBtn.classList.remove('is-syncing');
				if (meta?.title) {
					titleEl.textContent = meta.title;
					syncBtn.style.display = 'none';
				}
			});
			titleEl.appendChild(document.createTextNode(' '));
			titleEl.appendChild(syncBtn);
		}
	}

	renderNextBatch();
}

function renderNextBatch() {
	const listEl = document.getElementById('highlights-list')!;
	const end = Math.min(renderedCount + BATCH_SIZE, flatEntries.length);

	if (renderedCount >= flatEntries.length) return;

	// Track which page group we're in to insert page headers
	let lastPageUrl = renderedCount > 0 ? flatEntries[renderedCount - 1].pageUrl : null;

	for (let i = renderedCount; i < end; i++) {
		const { entry, pageUrl, domain, title } = flatEntries[i];

		// Insert a page header when the URL changes (in all/domain views)
		if (currentNav.type !== 'page' && pageUrl !== lastPageUrl) {
			const pageHeader = createPageHeader(pageUrl, domain, title);
			listEl.appendChild(pageHeader);
			lastPageUrl = pageUrl;
		}

		listEl.appendChild(createHighlightItem(entry));
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

	if (currentNav.type === 'all') {
		deleteBtn.textContent = getMessage('deleteAll');
	} else if (currentNav.type === 'domain') {
		deleteBtn.textContent = getMessage('deleteAll');
	} else {
		deleteBtn.textContent = getMessage('deleteAll');
	}
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

// --- Page headers in main content ---

function createPageHeader(url: string, domain: string, title?: string): HTMLElement {
	const header = document.createElement('div');
	header.className = 'highlight-page-header';

	// Show domain in "all" view, just path in domain view
	if (currentNav.type === 'all') {
		const domainSpan = document.createElement('a');
		domainSpan.className = 'highlight-page-domain';
		domainSpan.href = '#';
		domainSpan.textContent = siteNameOrDomain(domain);
		domainSpan.addEventListener('click', (e) => {
			e.preventDefault();
			navigate({ type: 'domain', domain });
		});
		header.appendChild(domainSpan);
	}

	const titleText = title || (() => {
		try {
			const parsed = new URL(url);
			return displayPath(parsed.pathname + parsed.search);
		} catch {
			return url;
		}
	})();

	const link = document.createElement('a');
	link.className = 'highlight-page-url';
	link.href = url;
	link.target = '_blank';
	link.rel = 'noopener';
	link.title = url;
	link.textContent = titleText;
	header.appendChild(link);

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
			const meta = await fetchPageMetadata(url);
			syncBtn.classList.remove('is-syncing');
			if (meta) {
				if (meta.title) link.textContent = meta.title;
				if (meta.title || meta.site) syncBtn.style.display = 'none';
			}
		});
		header.appendChild(syncBtn);
	}

	return header;
}

async function fetchPageMetadata(url: string): Promise<{ title?: string; site?: string } | null> {
	try {
		const response = await fetch(url);
		const html = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		// Set the base URL so relative URLs resolve correctly
		const base = doc.createElement('base');
		base.href = url;
		doc.head.prepend(base);

		const defuddled = new Defuddle(doc, { url }).parse();

		const title = defuddled.title || undefined;
		const site = defuddled.site || undefined;

		// Save title to highlights storage
		if (title) {
			const result = await browser.storage.local.get('highlights');
			const allHighlights = (result.highlights || {}) as Record<string, StoredData>;
			if (allHighlights[url]) {
				allHighlights[url].title = title;
				await browser.storage.local.set({ highlights: allHighlights });
			}
		}

		// Save site to domains storage
		if (site) {
			let hostname: string;
			try {
				hostname = new URL(url).hostname.replace(/^www\./, '');
			} catch {
				return { title, site };
			}
			const domResult = await browser.storage.local.get('domains');
			const domains = (domResult.domains || {}) as Record<string, DomainSettings>;
			if (!domains[hostname]) domains[hostname] = {};
			if (!domains[hostname].site) {
				domains[hostname].site = site;
				domainSettingsMap[hostname] = domains[hostname];
				await browser.storage.local.set({ domains });
				// Re-render sidebar to show site name
				renderSidebar();
				createIcons({ icons });
			}
		}

		return { title, site };
	} catch (error) {
		console.error('Failed to fetch metadata for:', url, error);
		return null;
	}
}

// --- Individual highlight items ---

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
	footer.className = 'highlight-item-footer';

	const timestamp = document.createElement('span');
	timestamp.className = 'highlight-item-time';
	const time = dayjs(parseInt(entry.data.id));
	timestamp.textContent = time.isValid() ? time.fromNow() : '';
	timestamp.title = time.isValid() ? time.format('YYYY-MM-DD HH:mm') : '';
	footer.appendChild(timestamp);

	const actions = document.createElement('div');
	actions.className = 'highlight-item-actions';

	const copyBtn = document.createElement('button');
	copyBtn.className = 'highlight-action-btn clickable-icon';
	copyBtn.title = getMessage('copyToClipboard');
	const copyIcon = document.createElement('i');
	copyIcon.setAttribute('data-lucide', 'copy');
	copyBtn.appendChild(copyIcon);
	copyBtn.addEventListener('click', async () => {
		await navigator.clipboard.writeText(entry.data.content || '');
		copyBtn.classList.add('is-copied');
		setTimeout(() => copyBtn.classList.remove('is-copied'), 1500);
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

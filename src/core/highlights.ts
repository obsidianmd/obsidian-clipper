import browser from '../utils/browser-polyfill';
import { AnyHighlightData, StoredData } from '../utils/highlighter';
import { translatePage, getMessage, setupLanguageAndDirection } from '../utils/i18n';
import { addBrowserClassToHtml, detectBrowser } from '../utils/browser-detection';
import DOMPurify from 'dompurify';
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

let allDomainGroups: DomainGroup[] = [];
let searchQuery = '';
let currentNav: NavSelection = { type: 'all' };
let expandedSidebarDomains = new Set<string>();

// Batched rendering
const BATCH_SIZE = 50;
let flatEntries: { entry: HighlightEntry; pageUrl: string; domain: string }[] = [];
let renderedCount = 0;
let observer: IntersectionObserver | null = null;

document.addEventListener('DOMContentLoaded', async () => {
	await setupLanguageAndDirection();
	await translatePage();
	addBrowserClassToHtml();

	await loadData();
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

// --- Data loading ---

async function loadData() {
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as Record<string, StoredData>;

	const domainMap = new Map<string, PageGroup[]>();

	for (const [urlKey, stored] of Object.entries(allHighlights)) {
		if (!stored.highlights || stored.highlights.length === 0) continue;

		let domain: string;
		let path: string;
		try {
			const parsed = new URL(stored.url || urlKey);
			domain = parsed.hostname;
			path = parsed.pathname + parsed.search;
		} catch {
			domain = urlKey;
			path = '/';
		}

		if (!domainMap.has(domain)) {
			domainMap.set(domain, []);
		}

		domainMap.get(domain)!.push({
			url: stored.url || urlKey,
			path,
			highlights: stored.highlights.map(h => ({ data: h, url: stored.url || urlKey })),
		});
	}

	allDomainGroups = Array.from(domainMap.entries())
		.map(([domain, pages]) => ({
			domain,
			pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
			totalHighlights: pages.reduce((sum, p) => sum + p.highlights.length, 0),
		}))
		.sort((a, b) => b.totalHighlights - a.totalHighlights);

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
	const filtered: DomainGroup[] = [];
	for (const group of allDomainGroups) {
		const filteredPages: PageGroup[] = [];
		for (const page of group.pages) {
			const filteredHighlights = page.highlights.filter(matchesSearch);
			if (filteredHighlights.length > 0) {
				filteredPages.push({ ...page, highlights: filteredHighlights });
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
	return filtered;
}

// --- Sidebar ---

function navigate(nav: NavSelection) {
	currentNav = nav;
	renderSidebar();
	renderMain();

	// Close mobile sidebar
	const container = document.getElementById('highlights');
	const hamburger = document.getElementById('highlights-hamburger');
	container?.classList.remove('sidebar-open');
	hamburger?.classList.remove('is-active');
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

		const name = document.createElement('span');
		name.className = 'nav-domain-name';
		name.textContent = displayDomain(group.domain);
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
				pageName.textContent = displayPath(page.path);
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

function getVisibleEntries(): { entry: HighlightEntry; pageUrl: string; domain: string }[] {
	const filtered = getFilteredGroups();
	const nav = currentNav;
	const entries: { entry: HighlightEntry; pageUrl: string; domain: string }[] = [];

	for (const group of filtered) {
		if (nav.type === 'domain' && nav.domain !== group.domain) continue;
		if (nav.type === 'page' && nav.domain !== group.domain) continue;

		for (const page of group.pages) {
			if (nav.type === 'page' && nav.url !== page.url) continue;

			for (const highlight of page.highlights) {
				entries.push({ entry: highlight, pageUrl: page.url, domain: group.domain });
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

	renderNextBatch();
}

function renderNextBatch() {
	const listEl = document.getElementById('highlights-list')!;
	const end = Math.min(renderedCount + BATCH_SIZE, flatEntries.length);

	if (renderedCount >= flatEntries.length) return;

	// Track which page group we're in to insert page headers
	let lastPageUrl = renderedCount > 0 ? flatEntries[renderedCount - 1].pageUrl : null;

	for (let i = renderedCount; i < end; i++) {
		const { entry, pageUrl, domain } = flatEntries[i];

		// Insert a page header when the URL changes (in all/domain views)
		if (currentNav.type !== 'page' && pageUrl !== lastPageUrl) {
			const pageHeader = createPageHeader(pageUrl, domain);
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
		span.textContent = displayDomain(nav.domain);
		breadcrumbEl.appendChild(span);
	} else if (nav.type === 'page') {
		// Domain link
		const domainLink = document.createElement('a');
		domainLink.className = 'breadcrumb-link';
		domainLink.href = '#';
		domainLink.textContent = displayDomain(nav.domain);
		domainLink.addEventListener('click', (e) => {
			e.preventDefault();
			navigate({ type: 'domain', domain: nav.domain });
		});
		breadcrumbEl.appendChild(domainLink);

		breadcrumbEl.appendChild(createBreadcrumbSeparator());

		let path = nav.url;
		try {
			const parsed = new URL(nav.url);
			path = displayPath(parsed.pathname + parsed.search);
		} catch { /* use raw url */ }

		const span = document.createElement('span');
		span.className = 'breadcrumb-current';
		span.textContent = path;
		span.title = nav.url;
		breadcrumbEl.appendChild(span);
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

function createPageHeader(url: string, domain: string): HTMLElement {
	const header = document.createElement('div');
	header.className = 'highlight-page-header';

	// Show domain in "all" view, just path in domain view
	if (currentNav.type === 'all') {
		const domainSpan = document.createElement('a');
		domainSpan.className = 'highlight-page-domain';
		domainSpan.href = '#';
		domainSpan.textContent = displayDomain(domain);
		domainSpan.addEventListener('click', (e) => {
			e.preventDefault();
			navigate({ type: 'domain', domain });
		});
		header.appendChild(domainSpan);
	}

	const link = document.createElement('a');
	link.className = 'highlight-page-url';
	link.href = url;
	link.target = '_blank';
	link.rel = 'noopener';
	link.title = url;
	try {
		const parsed = new URL(url);
		link.textContent = displayPath(parsed.pathname + parsed.search);
	} catch {
		link.textContent = url;
	}
	header.appendChild(link);

	return header;
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

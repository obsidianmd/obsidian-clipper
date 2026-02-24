import dayjs from 'dayjs';
import browser from '../utils/browser-polyfill';
import { extractPageContent } from '../utils/content-extractor';
import { isBlankPage, isValidUrl } from '../utils/active-tab-manager';
import { getMessage, setupLanguageAndDirection, translatePage } from '../utils/i18n';
import { createAnnotationBrowserPanelController, type AnnotationBrowserPanelController } from './annotation-browser-panel';

interface HighlightPanelData {
	id: string;
	content: string;
	createdAt?: number;
	color?: string;
	notes?: string[];
	blockTag?: string;
	blockOrdinal?: number;
	sectionPath?: string;
}

interface TabInfoResponse {
	success?: boolean;
	tab?: { id: number; url: string };
	error?: string;
}

type HighlightsPanelView = 'page' | 'browse';

let currentTabId: number | undefined;
let selectedHighlightId: string | null = null;
let refreshSequence = 0;
let activePanelView: HighlightsPanelView = 'page';
let annotationBrowserPanel: AnnotationBrowserPanelController | null = null;

function updateSelectedPanelItem(highlightId: string | null, shouldScroll = false): void {
	const listElement = document.getElementById('highlights-panel-list');
	if (!(listElement instanceof HTMLElement)) {
		return;
	}

	let selectedItem: HTMLElement | null = null;
	const items = listElement.querySelectorAll<HTMLElement>('.highlights-panel-item');
	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		const isSelected = Boolean(highlightId) && item.dataset.highlightId === highlightId;
		item.classList.toggle('is-selected', isSelected);
		item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
		if (isSelected) {
			selectedItem = item;
		}
	}

	if (!selectedItem) {
		selectedHighlightId = null;
		return;
	}

	const activeSelectedItem = selectedItem;
	if (shouldScroll) {
		activeSelectedItem.scrollIntoView({
			block: 'center',
			inline: 'nearest',
			behavior: 'auto'
		});
	}
}

async function requestPageSelection(highlightId: string): Promise<void> {
	if (!currentTabId) {
		return;
	}

	try {
		const response = await browser.runtime.sendMessage({
			action: 'selectHighlightById',
			tabId: currentTabId,
			highlightId
		}) as { success?: boolean; error?: string };

		if (!response || response.success !== true) {
			throw new Error(response?.error || 'Failed to select highlight in page');
		}
	} catch (error) {
		console.error('Failed to sync selected highlight to page:', error);
	}
}

function getHighlightAnnotation(highlight: HighlightPanelData): string {
	if (!Array.isArray(highlight.notes)) {
		return '';
	}
	const annotation = highlight.notes.find((note) => typeof note === 'string' && note.trim().length > 0);
	return annotation ? annotation.trim() : '';
}

function getHighlightPreviewText(highlight: HighlightPanelData): string {
	if (!highlight.content) {
		return getMessage('highlightsPaneElement');
	}

	const doc = new DOMParser().parseFromString(highlight.content, 'text/html');
	const textContent = doc.body.textContent?.replace(/\s+/g, ' ').trim();
	if (textContent) {
		return textContent;
	}

	const firstTag = doc.body.firstElementChild?.tagName.toLowerCase();
	if (firstTag === 'img') {
		return getMessage('highlightsPaneImage');
	}
	if (firstTag === 'video') {
		return getMessage('highlightsPaneVideo');
	}
	if (firstTag === 'audio') {
		return getMessage('highlightsPaneAudio');
	}
	return getMessage('highlightsPaneElement');
}

function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	const truncated = text.slice(0, Math.max(0, maxLength - 3)).trimEnd();
	return `${truncated}...`;
}
function setActivePanelView(view: HighlightsPanelView): void {
	activePanelView = view;
	const isPageView = view === 'page';

	const pageTab = document.getElementById('highlights-panel-tab-page');
	const browseTab = document.getElementById('highlights-panel-tab-browse');
	const pageView = document.getElementById('highlights-panel-view-page');
	const browseView = document.getElementById('highlights-panel-view-browse');

	if (pageTab instanceof HTMLButtonElement) {
		pageTab.classList.toggle('is-active', isPageView);
		pageTab.setAttribute('aria-selected', isPageView ? 'true' : 'false');
	}
	if (browseTab instanceof HTMLButtonElement) {
		browseTab.classList.toggle('is-active', !isPageView);
		browseTab.setAttribute('aria-selected', isPageView ? 'false' : 'true');
	}
	if (pageView instanceof HTMLElement) {
		pageView.classList.toggle('is-active', isPageView);
		pageView.hidden = !isPageView;
	}
	if (browseView instanceof HTMLElement) {
		browseView.classList.toggle('is-active', !isPageView);
		browseView.hidden = isPageView;
	}
}

function setupPanelTabs(): void {
	const pageTab = document.getElementById('highlights-panel-tab-page');
	const browseTab = document.getElementById('highlights-panel-tab-browse');

	if (pageTab instanceof HTMLButtonElement) {
		pageTab.addEventListener('click', () => {
			if (activePanelView === 'page') {
				return;
			}
			setActivePanelView('page');
			refreshHighlights();
		});
	}

	if (browseTab instanceof HTMLButtonElement) {
		browseTab.addEventListener('click', () => {
			if (activePanelView === 'browse') {
				return;
			}
			setActivePanelView('browse');
			annotationBrowserPanel?.refresh();
		});
	}
}

interface SemanticPathSegment {
	label: string;
}

// Semantic grouping is section-only by design.
// Block/paragraph markers are intentionally excluded to avoid noisy grouping rows.
function getHighlightSemanticPath(highlight: HighlightPanelData): SemanticPathSegment[] {
	const path: SemanticPathSegment[] = [];
	if (typeof highlight.sectionPath === 'string' && highlight.sectionPath.trim().length > 0) {
		const segments = highlight.sectionPath
			.split('>')
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0);
		if (segments.length > 0) {
			segments[0] = `\u00a7 ${segments[0]}`;
			for (const segment of segments) {
				path.push({ label: segment });
			}
		}
	}

	return path;
}

interface SemanticTreeNode {
	label: string;
	depth: number;
	children: SemanticTreeNode[];
	highlights: OrderedHighlightEntry[];
	firstHighlightOrder: number;
	childByLabel: Map<string, SemanticTreeNode>;
}

interface OrderedHighlightEntry {
	highlight: HighlightPanelData;
	order: number;
}

// firstHighlightOrder tracks the earliest highlight encountered in this subtree.
// It is used later to interleave child branches with direct highlights in natural page order.
function createSemanticTreeNode(label = '', depth = 0): SemanticTreeNode {
	return {
		label,
		depth,
		children: [],
		highlights: [],
		firstHighlightOrder: Number.POSITIVE_INFINITY,
		childByLabel: new Map()
	};
}

function createHighlightPanelItem(highlight: HighlightPanelData): HTMLElement {
	const item = document.createElement('article');
	item.className = 'highlights-panel-item';
	item.dataset.highlightId = highlight.id;
	item.tabIndex = 0;
	item.setAttribute('role', 'button');
	item.setAttribute('aria-selected', 'false');

	const createdAt = typeof highlight.createdAt === 'number' && Number.isFinite(highlight.createdAt) && highlight.createdAt > 0
		? dayjs(highlight.createdAt).format('MMM D, YYYY, h:mm A')
		: '';
	if (createdAt) {
		const meta = document.createElement('div');
		meta.className = 'highlights-panel-item-meta';

		const dateLabel = document.createElement('p');
		dateLabel.className = 'highlights-panel-item-date';
		dateLabel.textContent = createdAt;
		meta.appendChild(dateLabel);

		item.appendChild(meta);
	}

	const excerpt = document.createElement('p');
	excerpt.className = 'highlights-panel-item-excerpt';
	excerpt.textContent = truncateText(getHighlightPreviewText(highlight), 240);
	if (highlight.color) {
		excerpt.style.setProperty('--highlight-accent-color', highlight.color);
	}
	item.appendChild(excerpt);

	const annotation = getHighlightAnnotation(highlight);
	if (annotation) {
		const annotationText = document.createElement('p');
		annotationText.className = 'highlights-panel-item-annotation';
		annotationText.textContent = truncateText(annotation, 320);
		item.appendChild(annotationText);
	}

	const selectFromPanel = () => {
		selectedHighlightId = highlight.id;
		updateSelectedPanelItem(selectedHighlightId, false);
		requestPageSelection(highlight.id);
	};
	item.addEventListener('click', (event) => {
		event.preventDefault();
		selectFromPanel();
	});
	item.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectFromPanel();
		}
	});

	return item;
}

// Build a heading tree while retaining each highlight's original input position.
// Input order is treated as the canonical global document order for panel rendering.
function buildSemanticTree(highlights: HighlightPanelData[]): SemanticTreeNode {
	const root = createSemanticTreeNode('', -1);
	for (let order = 0; order < highlights.length; order++) {
		const highlight = highlights[order];
		const path = getHighlightSemanticPath(highlight);
		if (path.length === 0) {
			root.highlights.push({ highlight, order });
			root.firstHighlightOrder = Math.min(root.firstHighlightOrder, order);
			continue;
		}

		let node = root;
		node.firstHighlightOrder = Math.min(node.firstHighlightOrder, order);
		for (let index = 0; index < path.length; index++) {
			const segment = path[index];
			const childKey = segment.label;
			let child = node.childByLabel.get(childKey);
			if (!child) {
				child = createSemanticTreeNode(segment.label, node.depth + 1);
				node.childByLabel.set(childKey, child);
				node.children.push(child);
			}
			child.firstHighlightOrder = Math.min(child.firstHighlightOrder, order);
			node = child;
		}
		node.highlights.push({ highlight, order });
	}
	return root;
}

interface CollapsedSemanticNode {
	label: string;
	terminalNode: SemanticTreeNode;
}

// Compact linear heading chains into one row label (A > B > C), but stop at:
// - the first node that has direct highlights, or
// - the first branching node (multiple children).
// This keeps headings concise without hiding meaningful structural splits.
function collapseLinearSemanticPath(node: SemanticTreeNode): CollapsedSemanticNode {
	const labels = [node.label];
	let terminalNode = node;

	// Collapse only intermediary nodes that don't hold highlights and have a single child.
	while (terminalNode.highlights.length === 0 && terminalNode.children.length === 1) {
		terminalNode = terminalNode.children[0];
		labels.push(terminalNode.label);
	}

	return {
		label: labels.join(' > '),
		terminalNode
	};
}

// Render direct highlights and child heading branches as one merged stream ordered by
// first appearance in the source data. This preserves natural reading/scroll order across
// mixed siblings (e.g. highlights directly under H1 and highlights under H1 > H2).
function appendOrderedNodeContents(container: HTMLElement, node: SemanticTreeNode): void {
	const orderedChildren = [...node.children].sort((left, right) => left.firstHighlightOrder - right.firstHighlightOrder);
	const orderedHighlights = [...node.highlights].sort((left, right) => left.order - right.order);
	let childIndex = 0;
	let highlightIndex = 0;

	while (childIndex < orderedChildren.length || highlightIndex < orderedHighlights.length) {
		const nextChild = orderedChildren[childIndex];
		const nextHighlight = orderedHighlights[highlightIndex];
		const nextChildOrder = nextChild ? nextChild.firstHighlightOrder : Number.POSITIVE_INFINITY;
		const nextHighlightOrder = nextHighlight ? nextHighlight.order : Number.POSITIVE_INFINITY;

		if (nextChildOrder <= nextHighlightOrder) {
			container.appendChild(renderSemanticNode(nextChild));
			childIndex++;
		} else {
			container.appendChild(createHighlightPanelItem(nextHighlight.highlight));
			highlightIndex++;
		}
	}
}

// Node depth is exported for CSS layout rules (flatten top-level grouping).
function renderSemanticNode(node: SemanticTreeNode): HTMLElement {
	const collapsedNode = collapseLinearSemanticPath(node);

	const details = document.createElement('details');
	details.className = 'highlights-panel-tree-node';
	details.open = true;
	details.dataset.nodeDepth = String(node.depth);

	const summary = document.createElement('summary');
	summary.className = 'highlights-panel-tree-summary';
	summary.textContent = collapsedNode.label;
	details.appendChild(summary);

	const body = document.createElement('div');
	body.className = 'highlights-panel-tree-body';
	appendOrderedNodeContents(body, collapsedNode.terminalNode);

	details.appendChild(body);
	return details;
}

function renderHighlights(highlights: HighlightPanelData[]): void {
	const listElement = document.getElementById('highlights-panel-list');
	if (!(listElement instanceof HTMLElement)) {
		return;
	}

	listElement.textContent = '';

	if (highlights.length === 0) {
		selectedHighlightId = null;
		const emptyState = document.createElement('p');
		emptyState.className = 'highlights-panel-empty';
		emptyState.textContent = getMessage('highlightsPaneEmpty');
		listElement.appendChild(emptyState);
		return;
	}

	// Root uses the same merged ordering rule as nested nodes.
	const treeRoot = buildSemanticTree(highlights);
	appendOrderedNodeContents(listElement, treeRoot);

	updateSelectedPanelItem(selectedHighlightId, false);
}

async function getCurrentTabInfo(tabId: number): Promise<{ id: number; url: string }> {
	const response = await browser.runtime.sendMessage({ action: 'getTabInfo', tabId }) as TabInfoResponse;
	if (!response || !response.success || !response.tab) {
		throw new Error(response?.error || 'Failed to get tab info');
	}
	return response.tab;
}

async function refreshHighlights(): Promise<void> {
	const requestSequence = ++refreshSequence;
	const tabId = currentTabId;

	if (!tabId) {
		renderHighlights([]);
		return;
	}

	try {
		const tab = await getCurrentTabInfo(tabId);
		if (requestSequence !== refreshSequence || tabId !== currentTabId) {
			return;
		}

		if (!tab.url || isBlankPage(tab.url) || !isValidUrl(tab.url)) {
			renderHighlights([]);
			return;
		}

		const pageData = await extractPageContent(tabId);
		if (requestSequence !== refreshSequence || tabId !== currentTabId) {
			return;
		}
		renderHighlights(pageData?.highlights || []);
	} catch (error) {
		if (requestSequence !== refreshSequence || tabId !== currentTabId) {
			return;
		}
		console.error('Failed to refresh highlights panel:', error);
		renderHighlights([]);
	}
}

function setupMessageListeners(): void {
	browser.runtime.onMessage.addListener((request: any) => {
		if (request.action === 'activeTabChanged') {
			currentTabId = request.tabId;
			selectedHighlightId = null;
			if (request.isValidUrl) {
				refreshHighlights();
			} else {
				refreshSequence++;
				renderHighlights([]);
			}
		} else if (request.action === 'highlightsUpdated') {
			if (request.tabId === currentTabId) {
				refreshHighlights();
			}
			annotationBrowserPanel?.refresh();
		} else if (request.action === 'highlightsCleared') {
			refreshHighlights();
			annotationBrowserPanel?.refresh();
		} else if (
			request.action === 'highlightSelected' &&
			request.tabId === currentTabId &&
			typeof request.highlightId === 'string'
		) {
			selectedHighlightId = request.highlightId;
			updateSelectedPanelItem(selectedHighlightId, true);
		}
		return undefined;
	});
}

async function initialize(): Promise<void> {
	await translatePage();
	await setupLanguageAndDirection();
	annotationBrowserPanel = createAnnotationBrowserPanelController();
	setupPanelTabs();
	setActivePanelView('page');
	setupMessageListeners();

	const activeTabResponse = await browser.runtime.sendMessage({ action: 'getActiveTab' }) as { tabId?: number; error?: string };
	if (!activeTabResponse || activeTabResponse.error || !activeTabResponse.tabId) {
		renderHighlights([]);
		await annotationBrowserPanel.refresh();
		return;
	}

	currentTabId = activeTabResponse.tabId;
	browser.runtime.sendMessage({ action: 'sidePanelOpened' });
	window.addEventListener('unload', () => {
		annotationBrowserPanel?.destroy();
		browser.runtime.sendMessage({ action: 'sidePanelClosed' });
	});

	await Promise.all([
		refreshHighlights(),
		annotationBrowserPanel.refresh()
	]);
}

document.addEventListener('DOMContentLoaded', () => {
	initialize().catch((error) => {
		console.error('Failed to initialize highlights panel:', error);
		renderHighlights([]);
		annotationBrowserPanel?.renderEmpty();
	});
});

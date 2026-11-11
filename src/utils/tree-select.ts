import { getMessage } from './i18n';
import { CUSTOM_PATH_VALUE } from './folder-select';
import { initializeIcons } from '../icons/icons';

interface TreeNode {
	name: string;
	path: string;
	children: TreeNode[];
}

export type { TreeNode };

export interface TreeSelectOptions {
	input?: HTMLInputElement | null;
}

export interface TreeSelectControl {
	refresh(): void;
	sync(): void;
	destroy(): void;
}

const attached = new WeakMap<HTMLSelectElement, TreeSelectControl>();

export function buildTree(paths: string[]): TreeNode[] {
	const roots: TreeNode[] = [];
	const byPath = new Map<string, TreeNode>();

	for (const path of paths) {
		let children = roots;
		let current = '';
		for (const segment of path.split('/')) {
			current = current ? `${current}/${segment}` : segment;
			let node = byPath.get(current);
			if (!node) {
				node = { name: segment, path: current, children: [] };
				byPath.set(current, node);
				children.push(node);
			}
			children = node.children;
		}
	}

	return roots;
}

/**
 * Turns a native <select> into a collapsible folder tree.
 *
 * The <select> stays in the DOM (hidden) as the source of truth, so existing
 * code that reads `select.value` or populates its options keeps working. The
 * control watches the select and re-renders when its options change.
 */
export function attachTreeSelect(select: HTMLSelectElement, options: TreeSelectOptions = {}): TreeSelectControl {
	const existing = attached.get(select);
	if (existing) return existing;

	const input = options.input ?? null;
	const expanded = new Set<string>();
	let filter = '';
	let isOpen = false;

	const wrapper = document.createElement('div');
	wrapper.className = 'tree-select';
	select.parentNode?.insertBefore(wrapper, select);
	wrapper.appendChild(select);
	select.classList.add('tree-select-native');
	select.tabIndex = -1;

	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'tree-select-button';
	button.setAttribute('aria-haspopup', 'listbox');
	button.setAttribute('aria-expanded', 'false');

	const buttonLabel = document.createElement('span');
	buttonLabel.className = 'tree-select-button-label';
	button.appendChild(buttonLabel);

	const chevron = document.createElement('i');
	chevron.className = 'tree-select-chevron';
	chevron.setAttribute('data-lucide', 'chevron-down');
	button.appendChild(chevron);
	wrapper.appendChild(button);

	const popover = document.createElement('div');
	popover.className = 'tree-select-popover';
	popover.setAttribute('role', 'listbox');
	popover.tabIndex = -1;
	wrapper.appendChild(popover);

	const search = document.createElement('input');
	search.type = 'text';
	search.className = 'tree-select-search';
	search.placeholder = getMessage('searchFolders');
	search.setAttribute('aria-label', getMessage('searchFolders'));
	popover.appendChild(search);

	const list = document.createElement('div');
	list.className = 'tree-select-list';
	popover.appendChild(list);

	const folderPaths = (): string[] => Array.from(select.options)
		.map(option => option.value)
		.filter(value => value !== '' && value !== CUSTOM_PATH_VALUE);

	function makeRow(labelText: string, value: string, depth: number, hasChildren: boolean): HTMLDivElement {
		const row = document.createElement('div');
		row.className = 'tree-select-row';
		row.setAttribute('role', 'option');
		row.dataset.value = value;
		row.style.paddingInlineStart = `${depth * 14 + 6}px`;

		const isSelected = select.value === value;
		if (isSelected) row.classList.add('is-selected');
		row.setAttribute('aria-selected', isSelected ? 'true' : 'false');

		const toggle = document.createElement('span');
		toggle.className = 'tree-select-toggle';
		if (hasChildren) {
			toggle.classList.add('is-branch');
			const icon = document.createElement('i');
			icon.setAttribute('data-lucide', expanded.has(value) ? 'chevron-down' : 'chevron-right');
			toggle.appendChild(icon);
			toggle.addEventListener('click', (event) => {
				event.stopPropagation();
				if (expanded.has(value)) expanded.delete(value);
				else expanded.add(value);
				renderRows();
			});
		} else {
			toggle.classList.add('is-leaf');
		}
		row.appendChild(toggle);

		const label = document.createElement('span');
		label.className = 'tree-select-row-label';
		label.textContent = labelText;
		row.appendChild(label);

		row.addEventListener('click', () => choose(value));
		return row;
	}

	function renderTree(nodes: TreeNode[], depth: number): void {
		for (const node of nodes) {
			list.appendChild(makeRow(node.name, node.path, depth, node.children.length > 0));
			if (node.children.length > 0 && expanded.has(node.path)) {
				renderTree(node.children, depth + 1);
			}
		}
	}

	function renderRows(): void {
		list.textContent = '';
		list.appendChild(makeRow(getMessage('vaultRootFolder'), '', 0, false));

		const paths = folderPaths();
		if (filter) {
			const query = filter.toLowerCase();
			const matches = paths.filter(path => path.toLowerCase().includes(query));
			if (matches.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'tree-select-empty';
				empty.textContent = getMessage('noFoldersFound');
				list.appendChild(empty);
			} else {
				for (const path of matches) list.appendChild(makeRow(path, path, 0, false));
			}
		} else {
			renderTree(buildTree(paths), 0);
		}

		list.appendChild(makeRow(getMessage('customPath'), CUSTOM_PATH_VALUE, 0, false));
		initializeIcons(popover);
		syncButton();
	}

	function syncButton(): void {
		const value = select.value;
		buttonLabel.textContent = value === ''
			? getMessage('vaultRootFolder')
			: value === CUSTOM_PATH_VALUE
				? getMessage('customPath')
				: value;
		buttonLabel.title = buttonLabel.textContent;
		if (input) {
			wrapper.style.display = input.style.display === 'none' ? '' : 'none';
		}
	}

	function expandAncestors(): void {
		const value = select.value;
		if (!value || value === CUSTOM_PATH_VALUE) return;
		const segments = value.split('/');
		let current = '';
		for (let index = 0; index < segments.length - 1; index++) {
			current = current ? `${current}/${segments[index]}` : segments[index];
			expanded.add(current);
		}
	}

	function positionPopover(): void {
		const rect = button.getBoundingClientRect();
		const width = Math.max(rect.width, 200);
		popover.style.width = `${width}px`;
		popover.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;

		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceBelow < 260 && rect.top > spaceBelow) {
			popover.style.top = 'auto';
			popover.style.bottom = `${window.innerHeight - rect.top + 4}px`;
		} else {
			popover.style.bottom = 'auto';
			popover.style.top = `${rect.bottom + 4}px`;
		}
	}

	function onDocumentMouseDown(event: MouseEvent): void {
		if (!wrapper.contains(event.target as Node)) closePopover();
	}

	function onDocumentKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closePopover();
			button.focus();
		}
	}

	function openPopover(): void {
		if (isOpen) return;
		isOpen = true;
		expandAncestors();
		filter = '';
		search.value = '';
		renderRows();
		positionPopover();
		popover.classList.add('is-open');
		button.setAttribute('aria-expanded', 'true');
		document.addEventListener('mousedown', onDocumentMouseDown, true);
		document.addEventListener('keydown', onDocumentKeyDown);
		document.addEventListener('scroll', positionPopover, true);
		window.addEventListener('resize', positionPopover);
		search.focus();
	}

	function closePopover(): void {
		if (!isOpen) return;
		isOpen = false;
		popover.classList.remove('is-open');
		button.setAttribute('aria-expanded', 'false');
		document.removeEventListener('mousedown', onDocumentMouseDown, true);
		document.removeEventListener('keydown', onDocumentKeyDown);
		document.removeEventListener('scroll', positionPopover, true);
		window.removeEventListener('resize', positionPopover);
	}

	function choose(value: string): void {
		if (select.value !== value) {
			select.value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}
		closePopover();
		syncButton();
	}

	button.addEventListener('click', (event) => {
		event.stopPropagation();
		if (isOpen) closePopover();
		else openPopover();
	});

	search.addEventListener('input', () => {
		filter = search.value.trim();
		renderRows();
	});

	const selectObserver = new MutationObserver(() => {
		if (isOpen) renderRows();
		else syncButton();
	});
	selectObserver.observe(select, { childList: true });

	let inputObserver: MutationObserver | undefined;
	if (input) {
		inputObserver = new MutationObserver(() => syncButton());
		inputObserver.observe(input, { attributes: true, attributeFilter: ['style'] });
	}

	initializeIcons(wrapper);
	syncButton();

	const control: TreeSelectControl = {
		refresh(): void {
			if (isOpen) renderRows();
			else syncButton();
		},
		sync: syncButton,
		destroy(): void {
			closePopover();
			selectObserver.disconnect();
			inputObserver?.disconnect();
			attached.delete(select);
		}
	};

	attached.set(select, control);
	return control;
}

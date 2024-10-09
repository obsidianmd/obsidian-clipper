import {
	AlertTriangle,
	AlignLeft, 
	Binary, 
	Calendar, 
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Clock, 
	CopyPlus,
	Ellipsis, 
	Files,
	GripVertical,
	Highlighter,
	Import,
	List, 
	PenLine,
	RotateCw,
	Settings,
	SquareCheckBig, 
	Trash2,
	X
} from 'lucide';

import { createIcons } from 'lucide';

export const icons = {
	AlertTriangle,
	AlignLeft,
	Binary,
	Calendar,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Clock,
	CopyPlus,
	Ellipsis,
	Files,
	GripVertical,
	Highlighter,
	Import,
	List,
	PenLine,
	RotateCw,
	Settings,
	SquareCheckBig,
	Trash2,
	X
};

export function initializeIcons(root: HTMLElement | Document = document) {
	createIcons({
		icons,
		attrs: {
			'stroke-width': 1.75,
			'class': 'lucide-icon'
		},
		nameAttr: 'data-lucide',
	});
}

export function getPropertyTypeIcon(type: string): string {
	const iconMap: { [key: string]: string } = {
		text: 'align-left',
		multitext: 'list',
		number: 'binary',
		checkbox: 'square-check-big',
		date: 'calendar',
		datetime: 'clock'
	};
	return iconMap[type] || 'align-left';
}

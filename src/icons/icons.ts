import {
	AlertTriangle,
	AlignLeft,
	Archive,
	ArrowUpRight,
	Binary,
	BookOpen,
	Calendar,
	Check,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Clock,
	Copy,
	CopyPlus,
	Ellipsis,
	Eraser,
	FileDown,
	Files,
	Globe,
	GripVertical,
	Highlighter,
	Import,
	List,
	MousePointer2,
	Paperclip,
	PenLine,
	PictureInPicture2,
	RotateCw,
	Quote,
	Settings,
	Share,
	SquareCheckBig,
	Tags,
	Trash2,
	X
} from 'lucide';

import { createIcons } from 'lucide';

export const icons = {
	AlertTriangle,
	AlignLeft,
	Archive,
	ArrowUpRight,
	Binary,
	BookOpen,
	Calendar,
	Check,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Clock,
	Copy,
	CopyPlus,
	Ellipsis,
	Eraser,
	FileDown,
	Files,
	Globe,
	GripVertical,
	Highlighter,
	Import,
	List,
	MousePointer2,
	Paperclip,
	PictureInPicture2,
	PenLine,
	RotateCw,
	Quote,
	Settings,
	Share,
	SquareCheckBig,
	Tags,
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
		datetime: 'clock',
		tags: 'tags'
	};
	return iconMap[type] || 'align-left';
}

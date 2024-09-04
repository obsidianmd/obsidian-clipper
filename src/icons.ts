import { Trash2, AlignLeft, Binary, List, Calendar, Clock, SquareCheckBig, GripVertical } from 'lucide';
import { createIcons } from 'lucide';

export const icons = {
	Trash2,
	AlignLeft,
	Binary,
	List,
	Calendar,
	Clock,
	SquareCheckBig,
	GripVertical
};

export function initializeIcons(root = document) {
	createIcons({ icons, root });
}
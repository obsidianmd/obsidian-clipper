declare module './icons' {
	import { IconNode } from 'lucide';
	
	export const icons: Record<string, IconNode>;
	export function initializeIcons(root?: Document): void;
}
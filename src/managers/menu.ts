export function initializeMenu(menuBtnId: string, menuId: string): void {
	const moreActionsBtn = document.getElementById(menuBtnId) as HTMLButtonElement;
	const menu = document.getElementById(menuId) as HTMLElement;

	console.log('Initializing menu:', { menuBtnId, menuId, moreActionsBtn, menu });

	if (moreActionsBtn && menu) {
		moreActionsBtn.addEventListener('click', (event) => {
			console.log('More actions button clicked');
			event.stopPropagation(); // Prevent this click from immediately closing the dropdown
			toggleMenu(menu);
		});

		// Close the menu when clicking outside of it
		document.addEventListener('click', (event) => {
			if (!menu.contains(event.target as Node)) {
				closeMenu(menu);
			}
		});
	} else {
		console.error('Menu button or menu element not found:', { menuBtnId, menuId });
	}
}

export function toggleMenu(menu: HTMLElement): void {
	console.log('Toggling menu', menu);
	menu.classList.toggle('show');
	console.log('Menu classes after toggle:', menu.classList);
}

export function closeMenu(menu: HTMLElement): void {
	menu.classList.remove('show');
}

export function addMenuItemListener(
	menuItemId: string, 
	menuId: string, 
	callback: () => void
): void {
	const menuItem = document.getElementById(menuItemId);
	const menu = document.getElementById(menuId);
	if (menuItem && menu) {
		menuItem.replaceWith(menuItem.cloneNode(true));
		const newMenuItem = document.getElementById(menuItemId);
		if (newMenuItem) {
			newMenuItem.addEventListener('click', (event) => {
				event.preventDefault();
				closeMenu(menu);
				callback();
			});
		}
	} else {
		console.error('Menu item or menu not found:', { menuItemId, menuId });
	}
}
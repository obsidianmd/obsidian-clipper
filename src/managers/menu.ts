export function initializeMenu(menuBtnId: string, menuId: string): void {
	const moreActionsBtn = document.getElementById(menuBtnId) as HTMLButtonElement;
	const menu = document.getElementById(menuId) as HTMLElement;

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

		menu.querySelectorAll('.menu-item').forEach(item => {
			item.addEventListener('click', () => {
				closeMenu(menu);
			});
		});
	} else {
		console.error('Menu button or menu element not found:', { menuBtnId, menuId });
	}
}

export function toggleMenu(menu: HTMLElement): void {
	console.log('Toggling menu', menu);
	const isOpening = !menu.classList.contains('show');
	menu.classList.toggle('show');
	document.body.classList.toggle('menu-open', isOpening);
	console.log('Menu classes after toggle:', menu.classList);
}

export function closeMenu(menu: HTMLElement): void {
	menu.classList.remove('show');
	document.body.classList.remove('menu-open');
}

export function addMenuItemListener(
	selector: string, 
	menuId: string, 
	callback: (event: Event) => void
): void {
	const menuItems = document.querySelectorAll(selector);
	const menu = document.getElementById(menuId);
	if (menuItems.length && menu) {
		menuItems.forEach(menuItem => {
			menuItem.addEventListener('click', (event) => {
				event.preventDefault();
				closeMenu(menu);
				callback(event);
			});
		});
	} else {
		console.error('Menu item or menu not found:', { selector, menuId });
	}
}
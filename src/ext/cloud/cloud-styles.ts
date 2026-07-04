/**
 * Cloud storage styles as a flat CSS string.
 *
 * These styles were originally in `src/styles/interpreter.scss` (SCSS with
 * nesting). They have been expanded into plain CSS so they can be injected
 * at runtime via a <style> tag (no sass compilation required), keeping the
 * cloud module fully decoupled from the main style.scss pipeline.
 */

export const cloudStyles = `
.cloud-target-list-container {
	overflow-x: scroll;
}

#cloud-target-list {
	margin: 0 0 0.5rem 0;
}

#cloud-target-list .cloud-target-list-item {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 0.5rem;
	border-bottom: 1px solid var(--background-modifier-border);
	padding: 0.25rem 0;
	user-select: none;
	line-height: 1.2;
}

#cloud-target-list .cloud-target-list-item .cloud-target-list-item-info {
	display: flex;
	flex-direction: row;
	gap: 0.5rem;
	width: 60%;
}

#cloud-target-list .cloud-target-list-item .cloud-target-name {
	font-size: var(--font-ui-small);
	min-width: 50%;
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 0.5rem;
}

#cloud-target-list .cloud-target-list-item .cloud-target-name-text {
	overflow: hidden;
	text-overflow: ellipsis;
}

#cloud-target-list .cloud-target-list-item .cloud-target-type {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 0.25rem;
	font-size: var(--font-ui-smaller);
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

#cloud-target-list .cloud-target-list-item .cloud-target-list-item-actions {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: flex-end;
	margin-inline-start: auto;
	flex-shrink: 0;
}

#cloud-target-list .cloud-target-list-item .cloud-target-list-item-actions .clickable-icon {
	height: var(--clickable-icon-size);
	width: var(--clickable-icon-size);
}

.cloud-target-icon-container {
	background-color: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 50%;
	display: inline-block;
	min-width: 1.75rem;
	width: 1.75rem;
	height: 1.75rem;
	overflow: hidden;
	padding: 0.25rem;
	text-align: center;
	display: flex;
	align-items: center;
	justify-content: center;
}

.cloud-target-icon {
	display: inline-block;
	background-color: var(--text-normal);
	mask-size: contain;
	mask-repeat: no-repeat;
	mask-position: 50% 50%;
	height: 100%;
	width: 100%;
	mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='lucide lucide-cloud'%3E%3Cpath d='M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'/%3E%3C/svg%3E");
}

.mod-rtl .cloud-target-icon {
	mask-position: 100% 50%;
}
`;

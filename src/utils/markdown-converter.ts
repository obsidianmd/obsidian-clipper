import TurndownService from 'turndown';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { processUrls } from './string-utils';
import { debugLog } from './debug';

const footnotes: { [key: string]: string } = {};

export function createMarkdownContent(content: string, url: string) {
	debugLog('Markdown', 'Starting markdown conversion for URL:', url);
	debugLog('Markdown', 'Content length:', content.length);

	const baseUrl = new URL(url);
	// Process all URLs at the beginning
	const processedContent = processUrls(content, baseUrl);

	const turndownService = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		emDelimiter: '*',
		preformattedCode: true,
	});

	try {
		var taskListItems = require('turndown-plugin-gfm').taskListItems
		turndownService.use(taskListItems)
	} catch (error) {
		console.error('Error applying GFM plugin:', error);
	}

	turndownService.addRule('table', {
		filter: 'table',
		replacement: function(content, node) {
			if (!(node instanceof HTMLTableElement)) return content;

			// Check if it's an ArXiv equation table
			if (node.classList.contains('ltx_equation') || node.classList.contains('ltx_eqn_table')) {
				return handleNestedEquations(node);
			}

			// Check if the table has colspan or rowspan
			const hasComplexStructure = Array.from(node.querySelectorAll('td, th')).some(cell => 
				cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')
			);

			if (hasComplexStructure) {
				// Clean up the table HTML
				const cleanedTable = cleanupTableHTML(node);
				return '\n\n' + cleanedTable + '\n\n';
			}

			// Process simple tables as before
			const rows = Array.from(node.rows).map(row => {
				const cells = Array.from(row.cells).map(cell => {
					// Remove newlines and trim the content
					let cellContent = turndownService.turndown(cell.innerHTML)
						.replace(/\n/g, ' ')
						.trim();
					// Escape pipe characters
					cellContent = cellContent.replace(/\|/g, '\\|');
					return cellContent;
				});
				return `| ${cells.join(' | ')} |`;
			});

			// Create the separator row
			const separatorRow = `| ${Array(rows[0].split('|').length - 2).fill('---').join(' | ')} |`;

			// Combine all rows
			const tableContent = [rows[0], separatorRow, ...rows.slice(1)].join('\n');

			return `\n\n${tableContent}\n\n`;
		}
	});

	turndownService.remove(['style', 'script']);

	// Keep iframes, video, audio, sup, and sub elements
	// @ts-ignore
	turndownService.keep(['iframe', 'video', 'audio', 'sup', 'sub', 'svg', 'math']);
	turndownService.remove(['button']);

	// Custom rule to handle bullet lists without extra spaces
	turndownService.addRule('listItem', {
		filter: 'li',
		replacement: function (content: string, node: Node, options: TurndownService.Options) {
			content = content.trim();
			let prefix = options.bulletListMarker + ' ';
			let parent = node.parentNode;
			if (parent instanceof HTMLOListElement) {
				let start = parent.getAttribute('start');
				let index = Array.from(parent.children).indexOf(node as HTMLElement) + 1;
				prefix = (start ? Number(start) + index - 1 : index) + '. ';
			}
			return prefix + content + '\n';
		}
	});

	turndownService.addRule('figure', {
		filter: 'figure',
		replacement: function(content, node) {
			const figure = node as HTMLElement;
			const img = figure.querySelector('img');
			const figcaption = figure.querySelector('figcaption');
			
			if (!img) return content;

			const alt = img.getAttribute('alt') || '';
			const src = img.getAttribute('src') || '';
			let caption = '';

			if (figcaption) {
				const tagSpan = figcaption.querySelector('.ltx_tag_figure');
				const tagText = tagSpan ? tagSpan.textContent?.trim() : '';
				
				// Process the caption content, including math elements
				let captionContent = figcaption.innerHTML;
				captionContent = captionContent.replace(/<math.*?>(.*?)<\/math>/g, (match, mathContent, offset, string) => {
					const mathElement = new DOMParser().parseFromString(match, 'text/html').body.firstChild as Element;
					const latex = extractLatex(mathElement);
					const prevChar = string[offset - 1] || '';
					const nextChar = string[offset + match.length] || '';

					const isStartOfLine = offset === 0 || /\s/.test(prevChar);
					const isEndOfLine = offset + match.length === string.length || /\s/.test(nextChar);

					const leftSpace = (!isStartOfLine && !/[\s$]/.test(prevChar)) ? ' ' : '';
					const rightSpace = (!isEndOfLine && !/[\s$]/.test(nextChar)) ? ' ' : '';

					return `${leftSpace}$${latex}$${rightSpace}`;
				});

				// Convert the processed caption content to markdown
				const captionMarkdown = turndownService.turndown(captionContent);
				
				// Combine tag and processed caption
				caption = `${tagText} ${captionMarkdown}`.trim();
			}

			// Handle references in the caption
			caption = caption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
				return `[${text}](${href})`;
			});

			return `![${alt}](${src})\n\n${caption}\n\n`;
		}
	});

	// Use Obsidian format for YouTube embeds and tweets
	turndownService.addRule('embedToMarkdown', {
		filter: function (node: Node): boolean {
			if (node instanceof HTMLIFrameElement) {
				const src = node.getAttribute('src');
				return !!src && (
					!!src.match(/(?:youtube\.com|youtu\.be)/) ||
					!!src.match(/(?:twitter\.com|x\.com)/)
				);
			} else if (node instanceof HTMLElement) {
				if (node.tagName.toLowerCase() === 'lite-youtube') {
					return true;
				} else if (node.tagName.toLowerCase() === 'p') {
					return !!node.querySelector('lite-youtube');
				}
			}
			return false;
		},
		replacement: function (content: string, node: Node): string {
			if (node instanceof HTMLIFrameElement) {
				const src = node.getAttribute('src');
				if (src) {
					const youtubeMatch = src.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/);
					if (youtubeMatch && youtubeMatch[1]) {
						return `![](https://www.youtube.com/watch?v=${youtubeMatch[1]})`;
					}
					const tweetMatch = src.match(/(?:twitter\.com|x\.com)\/.*?(?:status|statuses)\/(\d+)/);
					if (tweetMatch && tweetMatch[1]) {
						return `![](https://x.com/i/status/${tweetMatch[1]})`;
					}
				}
			} else if (node instanceof HTMLElement) {
				let liteYoutubeElement: HTMLElement | null = null;
				if (node.tagName.toLowerCase() === 'lite-youtube') {
					liteYoutubeElement = node;
				} else if (node.tagName.toLowerCase() === 'p') {
					liteYoutubeElement = node.querySelector('lite-youtube');
				}
				
				if (liteYoutubeElement) {
					const videoId = liteYoutubeElement.getAttribute('videoid');
					if (videoId) {
						return `![](https://www.youtube.com/watch?v=${videoId})`;
					}
				}
			}
			return content;
		}
	});

	turndownService.addRule('highlight', {
		filter: 'mark',
		replacement: function(content) {
			return '==' + content + '==';
		}
	});

	turndownService.addRule('strikethrough', {
		filter: (node: Node) => 
			node.nodeName === 'DEL' || 
			node.nodeName === 'S' || 
			node.nodeName === 'STRIKE',
		replacement: function(content) {
			return '~~' + content + '~~';
		}
	});

	// Add a new custom rule for complex link structures
	turndownService.addRule('complexLinkStructure', {
		filter: function (node, options) {
			return (
				node.nodeName === 'A' &&
				node.childNodes.length > 1 &&
				Array.from(node.childNodes).some(child => ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(child.nodeName))
			);
		},
		replacement: function (content, node, options) {
			if (!(node instanceof HTMLElement)) return content;
			const href = node.getAttribute('href');
			const title = node.getAttribute('title');
			
			// Extract the heading
			const headingNode = node.querySelector('h1, h2, h3, h4, h5, h6');
			const headingContent = headingNode ? turndownService.turndown(headingNode.innerHTML) : '';
			
			// Remove the heading from the content
			if (headingNode) {
				headingNode.remove();
			}
			
			// Convert the remaining content
			const remainingContent = turndownService.turndown(node.innerHTML);
			
			// Construct the new markdown
			let markdown = `${headingContent}\n\n${remainingContent}\n\n`;
			if (href) {
				markdown += `[View original](${href})`;
				if (title) {
					markdown += ` "${title}"`;
				}
			}
			
			return markdown;
		}
	});

	function handleNestedEquations(table: Element): string {
		const mathElements = table.querySelectorAll('math[alttext]');
		if (mathElements.length === 0) return '';

		return Array.from(mathElements).map(mathElement => {
			const alttext = mathElement.getAttribute('alttext');
			if (alttext) {
				// Check if it's an inline or block equation
				const isInline = mathElement.closest('.ltx_eqn_inline') !== null;
				return isInline ? `$${alttext.trim()}$` : `\n$$$\n${alttext.trim()}\n$$$`;
			}
			return '';
		}).join('\n\n');
	}

	turndownService.addRule('arXivEnumerate', {
		filter: (node) => {
			return node.nodeName === 'OL' && node.classList.contains('ltx_enumerate');
		},
		replacement: function(content, node) {
			if (!(node instanceof HTMLElement)) return content;
			
			const items = Array.from(node.children).map((item, index) => {
				if (item instanceof HTMLElement) {
					const itemContent = item.innerHTML.replace(/^<span class="ltx_tag ltx_tag_item">\d+\.<\/span>\s*/, '');
					return `${index + 1}. ${turndownService.turndown(itemContent)}`;
				}
				return '';
			});
			
			return '\n\n' + items.join('\n\n') + '\n\n';
		}
	});

	turndownService.addRule('removeHiddenElements', {
		filter: function (node) {
			return (
				node.style.display === 'none'
			);
		},
		replacement: function () {
			return '';
		}
	});

	turndownService.addRule('citations', {
		filter: (node: Node): boolean => {
			if (node instanceof Element) {
				return (
					(node.nodeName === 'SUP' && node.classList.contains('reference')) ||
					(node.nodeName === 'CITE' && node.classList.contains('ltx_cite')) ||
					(node.nodeName === 'SUP' && node.id.startsWith('fnref:')) ||
					(node.nodeName === 'SPAN' && node.classList.contains('footnote-link'))
				);
			}
			return false;
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				if (node.nodeName === 'SUP' && node.classList.contains('reference')) {
					const links = node.querySelectorAll('a');
					const footnotes = Array.from(links).map(link => {
						const href = link.getAttribute('href');
						if (href) {
							const match = href.split('/').pop()?.match(/(?:cite_note|cite_ref)-(.+)/);
							if (match) {
								return `[^${match[1].toLowerCase()}]`;
							}
						}
						return '';
					});
					return footnotes.join('');
				} else if (node.nodeName === 'CITE' && node.classList.contains('ltx_cite')) {
					const link = node.querySelector('a');
					if (link) {
						const href = link.getAttribute('href');
						if (href) {
							const match = href.split('/').pop()?.match(/bib\.bib(\d+)/);
							if (match) {
								return `[^${match[1].toLowerCase()}]`;
							}
						}
					}
				} else if (node.nodeName === 'SUP' && node.id.startsWith('fnref:')) {
					const id = node.id.replace('fnref:', '');
					return `[^${id.toLowerCase()}]`;
				} else if (node.nodeName === 'SPAN' && node.classList.contains('footnote-link')) {
					const footnoteId = node.dataset.footnoteId;
					if (footnoteId) {
						return `[^${footnoteId}]`;
					}
				}
			}
			return content;
		}
	});

	turndownService.addRule('inlineFootnotes', {
		filter: (node: Node): boolean => {
			return node instanceof HTMLElement && 
					node.nodeName === 'SPAN' && 
					node.classList.contains('footnote-link');
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				const footnoteId = node.dataset.footnoteId;
				const footnoteContent = node.dataset.footnoteContent;
				
				if (footnoteId && footnoteContent) {
					// Store the footnote content for later use
					footnotes[footnoteId] = turndownService.turndown(
						decodeURIComponent(footnoteContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
					);
					
					// Return the footnote reference
					return `[^${footnoteId}]`;
				}
			}
			return content;
		}
	});

	// Update the reference list rule
	turndownService.addRule('referenceList', {
		filter: (node: Node): boolean => {
			if (node instanceof HTMLElement) {
				return (
					(node.nodeName === 'OL' && node.classList.contains('references')) ||
					(node.nodeName === 'OL' && node.classList.contains('footnotes-list')) ||
					(node.nodeName === 'UL' && node.classList.contains('ltx_biblist')) ||
					(node.nodeName === 'OL' && node.parentElement?.classList?.contains('footnotes') === true)
				);
			}
			return false;
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				const references = Array.from(node.children).map(li => {
					let id;
					if (li.id.startsWith('bib.bib')) {
						id = li.id.replace('bib.bib', '');
					} else if (li.id.startsWith('fn:')) {
						id = li.id.replace('fn:', '');
					} else {
						const match = li.id.split('/').pop()?.match(/cite_note-(.+)/);
						id = match ? match[1] : li.id;
					}
					
					// Remove the leading sup element if its content matches the footnote id
					const supElement = li.querySelector('sup');
					if (supElement && supElement.textContent?.trim() === id) {
						supElement.remove();
					}
					
					const referenceContent = turndownService.turndown(li.innerHTML);
					// Remove the backlink from the footnote content
					const cleanedContent = referenceContent.replace(/\s*↩︎$/, '').trim();
					return `[^${id.toLowerCase()}]: ${cleanedContent}`;
				});
				return '\n\n' + references.join('\n\n') + '\n\n';
			}
			return content;
		}
	});

	// General removal rules for varous website elements
	turndownService.addRule('removals', {
		filter: function (node) {
			if (!(node instanceof HTMLElement)) return false;
			// Back to top links
			if (node.id.startsWith('back-to-top')) return true;
			if (node.classList.contains('back-to-top')) return true;
			// Wikipedia edit buttons
			if (node.classList.contains('mw-editsection')) return true;
			// Wikipedia cite backlinks
			if (node.classList.contains('mw-cite-backlink')) return true;
			// Reference numbers and anchor links
			if (node.classList.contains('ltx_role_refnum')) return true;
			if (node.classList.contains('ltx_tag_bibitem')) return true;
			if (node.classList.contains('footnote-backref')) return true;
			if (node.classList.contains('ref') && (node.getAttribute('href')?.startsWith('#') || /\/#.+$/.test(node.getAttribute('href') || ''))) return true;
			if (node.classList.contains('anchor') && (node.getAttribute('href')?.startsWith('#') || /\/#.+$/.test(node.getAttribute('href') || ''))) return true;
			// anchor links within headings
			if (node.nodeName === 'A' && 
				node.parentElement && 
				/^H[1-6]$/.test(node.parentElement.nodeName) && 
				node.getAttribute('href')?.split('/').pop()?.startsWith('#')) {
				// Only remove if the text content is '#' or it contains an img
				return (node.textContent?.trim() === '#') || node.querySelector('img') !== null;
			}

			// Simplify headings with anchor links
			if (node.nodeName.match(/^H[1-6]$/) && 
				node.children.length === 1 && 
				node.firstElementChild?.nodeName === 'A' &&
				node.firstElementChild.getAttribute('href')?.split('/').pop()?.startsWith('#')) {
				return true;
			}

			return false;
		},
		replacement: function (content, node) {
			if (node instanceof HTMLElement && node.nodeName.match(/^H[1-6]$/)) {
				const level = node.nodeName.charAt(1);
				const text = node.textContent?.trim() || '';
				return `\n${'#'.repeat(Number(level))} ${text}\n`;
			}
			return '';
		}
	});

	turndownService.addRule('handleTextNodesInTables', {
		filter: function (node: Node): boolean {
			return node.nodeType === Node.TEXT_NODE && 
				   node.parentNode !== null && 
				   node.parentNode.nodeName === 'TD';
		},
		replacement: function (content: string): string {
			return content;
		}
	});

	turndownService.addRule('preformattedCode', {
		filter: (node) => {
			return node.nodeName === 'PRE';
		},
		replacement: (content, node) => {
			if (!(node instanceof HTMLElement)) return content;

			const codeElement = node.querySelector('code');

			// Function to get language from class
			const getLanguageFromClass = (classList: DOMTokenList): string => {
				for (const className of Array.from(classList)) {
					if (className.startsWith('language-')) {
						return className.slice(9); // Remove 'language-' prefix
					}
				}
				return '';
			};

			// Try to get the language from the class attribute
			let language = '';
			
			// Check pre element
			language = getLanguageFromClass(node.classList);
			
			// Check code element if language not found
			if (!language && codeElement) {
				language = getLanguageFromClass(codeElement.classList);
			}
			
			// Check parent elements if language still not found
			if (!language) {
				let parent = node.parentElement;
				while (parent && !language) {
					language = getLanguageFromClass(parent.classList);
					parent = parent.parentElement;
				}
			}

			// If no language found in class, fallback to data-language
			if (!language) {
				language = node.dataset.language || '';
			}

			// Function to recursively extract text content while preserving structure
			const extractStructuredText = (element: Node): string => {
				if (element.nodeType === Node.TEXT_NODE) {
					return element.textContent || '';
				} else if (element instanceof HTMLElement) {
					let text = '';
					element.childNodes.forEach(child => {
						if (child instanceof HTMLElement && child.classList.contains('ec-line')) {
							text += extractStructuredText(child) + '\n';
						} else {
							text += extractStructuredText(child);
						}
					});
					return text;
				}
				return '';
			};

			// Extract all text content from the pre element or its code child
			let codeContent = codeElement ? extractStructuredText(codeElement) : extractStructuredText(node);

			// Remove any extra newlines at the start or end
			codeContent = codeContent.replace(/^\n+|\n+$/g, '');

			// Escape any backticks in the code
			const escapedCode = codeContent.replace(/`/g, '\\`');

			return `\n\`\`\`${language}\n${escapedCode}\n\`\`\`\n`;
		}
	});

	turndownService.addRule('MathJax', {
		filter: (node) => {
			const isMjxContainer = node.nodeName.toLowerCase() === 'mjx-container';
			return isMjxContainer;
		},
		replacement: (content, node) => {
			if (!(node instanceof HTMLElement)) {
				return content;
			}

			const assistiveMml = node.querySelector('mjx-assistive-mml');
			if (!assistiveMml) {
				return content;
			}

			const mathElement = assistiveMml.querySelector('math');
			if (!mathElement) {
				return content;
			}

			let latex;
			try {
				latex = MathMLToLaTeX.convert(mathElement.outerHTML);
			} catch (error) {
				console.error('Error converting MathML to LaTeX:', error);
				return content;
			}

			// Check if it's an inline or block math element
			const isBlock = mathElement.getAttribute('display') === 'block';

			if (isBlock) {
				return `\n$$\n${latex}\n$$\n`;
			} else {
				return `$${latex}$`;
			}
		}
	});

	function extractLatex(element: Element): string {
		// Check if the element is a <math> element and has an alttext attribute
		if (element.nodeName.toLowerCase() === 'math') {
			const alttext = element.getAttribute('alttext');
			if (alttext) {
				return alttext.trim();
			}
		}

		// If not, look for a nested <math> element with alttext
		const mathElement = element.querySelector('math[alttext]');
		if (mathElement) {
			const alttext = mathElement.getAttribute('alttext');
			if (alttext) {
				return alttext.trim();
			}
		}

		// Fallback to existing logic
		const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
		if (annotation?.textContent) {
			return annotation.textContent.trim();
		}

		const mathNode = element.nodeName.toLowerCase() === 'math' ? element : element.querySelector('math');
		if (mathNode) {
			return MathMLToLaTeX.convert(mathNode.outerHTML);
		}

		const imgNode = element.querySelector('img');
		return imgNode?.getAttribute('alt') || '';
	}


	turndownService.addRule('math', {
		filter: (node) => {
			return node.nodeName.toLowerCase() === 'math' || 
				(node instanceof Element && node.classList && 
				(node.classList.contains('mwe-math-element') || 
				node.classList.contains('mwe-math-fallback-image-inline') || 
				node.classList.contains('mwe-math-fallback-image-display')));
		},
		replacement: (content, node) => {
			if (!(node instanceof Element)) return content;

			let latex = extractLatex(node);

			// Remove leading and trailing whitespace
			latex = latex.trim();

			// Check if the math element is within a table
			const isInTable = node.closest('table') !== null;

			// Check if it's an inline or block math element
			if (!isInTable && (
				node.getAttribute('display') === 'block' || 
				node.classList.contains('mwe-math-fallback-image-display') || 
				(node.parentElement && node.parentElement.classList.contains('mwe-math-element') && 
				node.parentElement.previousElementSibling && 
				node.parentElement.previousElementSibling.nodeName.toLowerCase() === 'p')
			)) {
				return `\n$$$\n${latex}\n$$$\n`;
			} else {
				// For inline math, ensure there's a space before and after only if needed
				const prevNode = node.previousSibling;
				const nextNode = node.nextSibling;
				const prevChar = prevNode?.textContent?.slice(-1) || '';
				const nextChar = nextNode?.textContent?.[0] || '';

				const isStartOfLine = !prevNode || (prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.trim() === '');
				const isEndOfLine = !nextNode || (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.trim() === '');

				const leftSpace = (!isStartOfLine && prevChar && !/[\s$]/.test(prevChar)) ? ' ' : '';
				const rightSpace = (!isEndOfLine && nextChar && !/[\s$]/.test(nextChar)) ? ' ' : '';

				return `${leftSpace}$${latex}$${rightSpace}`;
			}
		}
	});

	function cleanupTableHTML(table: HTMLTableElement): string {
		const allowedAttributes = ['src', 'href', 'style', 'align', 'width', 'height', 'rowspan', 'colspan', 'bgcolor', 'scope', 'valign', 'headers'];
		
		const cleanElement = (element: Element) => {
			Array.from(element.attributes).forEach(attr => {
				if (!allowedAttributes.includes(attr.name)) {
					element.removeAttribute(attr.name);
				}
			});
			
			element.childNodes.forEach(child => {
				if (child instanceof Element) {
					cleanElement(child);
				}
			});
		};

		// Create a clone of the table to avoid modifying the original DOM
		const tableClone = table.cloneNode(true) as HTMLTableElement;
		cleanElement(tableClone);

		return tableClone.outerHTML;
	}

	try {
		let markdown = turndownService.turndown(processedContent);
		debugLog('Markdown', 'Markdown conversion successful');

		// Remove the title from the beginning of the content if it exists
		const titleMatch = markdown.match(/^# .+\n+/);
		if (titleMatch) {
			markdown = markdown.slice(titleMatch[0].length);
		}

		// Remove any empty links e.g. [](example.com) that remain, along with surrounding newlines
		// But don't affect image links like ![](image.jpg)
		markdown = markdown.replace(/\n*(?<!!)\[]\([^)]+\)\n*/g, '');

		// Remove any consecutive newlines more than two
		markdown = markdown.replace(/\n{3,}/g, '\n\n');

		// Append footnotes at the end of the document
		if (Object.keys(footnotes).length > 0) {
			markdown += '\n\n---\n\n';
			for (const [id, content] of Object.entries(footnotes)) {
				markdown += `[^${id}]: ${content}\n\n`;
			}
		}

		// Clear the footnotes object for the next conversion
		Object.keys(footnotes).forEach(key => delete footnotes[key]);

		return markdown.trim();
	} catch (error) {
		console.error('Error converting HTML to Markdown:', error);
		console.log('Problematic content:', processedContent.substring(0, 1000) + '...');
		return `Partial conversion completed with errors. Original HTML:\n\n${processedContent}`;
	}
}

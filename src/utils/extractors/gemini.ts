import { BaseExtractor, ExtractorResult } from './_base';
import Defuddle from 'defuddle';
import DOMPurify from 'dompurify';

export class GeminiExtractor extends BaseExtractor {
  private conversationContainers: NodeListOf<Element> | null;

  constructor(document: Document, url: string) {
    super(document, url);
    this.conversationContainers = document.querySelectorAll('.conversation-container');
  }

  canExtract(): boolean {
    return !!this.conversationContainers && this.conversationContainers.length > 0;
  }

  extract(): ExtractorResult {
    const turns = this.extractConversationTurns();
    const title = this.getTitle();
    const rawContentHtml = this.createContentHtml(turns);

    // Create a temporary document to run Defuddle on our content
    const tempDoc = document.implementation.createHTMLDocument();
    const container = tempDoc.createElement('div');
    container.innerHTML = rawContentHtml;
    tempDoc.body.appendChild(container);

    // Pre-process Gemini's special structures before running Defuddle
    this.preprocessGeminiElements(tempDoc);

    // Run Defuddle on our formatted content
    const defuddled = new Defuddle(tempDoc).parse();
    
    // Get the content HTML
    let contentHtml = defuddled.content;

    return {
      content: contentHtml,
      contentHtml: contentHtml,
      extractedContent: {
        turns: turns.length.toString(),
      },
      variables: {
        title: title,
        site: 'Gemini',
        description: `Gemini conversation with ${turns.length} turns`,
        author: 'Gemini',
        wordCount: defuddled.wordCount?.toString() || '',
      }
    };
  }

  // Pre-process Gemini's special elements like tables, custom structures, etc.
  private preprocessGeminiElements(doc: Document): void {
    // Process tables
    this.processGeminiTables(doc);
    
    // Process any other special Gemini elements here if needed
    // For example: code blocks, special formats, etc.
  }

  // Process Gemini's special table structure
  private processGeminiTables(doc: Document): void {
    // Handle various custom table elements and containers Gemini might use
    const tableBlocks = doc.querySelectorAll('table-block, .table-block-component, .table-block, div.horizontal-scroll-wrapper > div');
    
    tableBlocks.forEach((tableBlock, index) => {
      // Find the actual table - try different selectors as Gemini structure might vary
      let table = tableBlock.querySelector('table.table-formatting');
      
      if (!table) {
        // Try alternate selectors if the class-based one failed
        table = tableBlock.querySelector('table');
      }
      
      if (!table) {
        // If still no table found, might be in a nested container
        const nestedContainer = tableBlock.querySelector('.table-content');
        if (nestedContainer) {
          table = nestedContainer.querySelector('table');
        }
      }
      
      if (table) {
        // Create a new standard HTML table
        const newTable = doc.createElement('table');
        newTable.className = 'gemini-table';
        newTable.setAttribute('data-gemini-table-index', index.toString());
        
        // Check if the table has header cells
        const firstRow = table.querySelector('tr');
        const hasHeaders = firstRow ? firstRow.querySelector('th') !== null : false;
        
        // Create thead if there are headers
        if (hasHeaders && firstRow) {
          const thead = doc.createElement('thead');
          const headerRow = firstRow.cloneNode(true);
          thead.appendChild(headerRow);
          newTable.appendChild(thead);
        }
        
        // Create tbody and add all rows (or all except the first if we have headers)
        const tbody = doc.createElement('tbody');
        const rows = Array.from(table.querySelectorAll('tr'));
        
        // Start from the second row if we have headers
        const startIdx = hasHeaders ? 1 : 0;
        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          const newRow = doc.createElement('tr');
          
          // Process cells
          const cells = row.querySelectorAll('th, td');
          cells.forEach(cell => {
            const isHeader = cell.tagName.toLowerCase() === 'th';
            const newCell = doc.createElement(isHeader ? 'th' : 'td');
            
            // Handle colspan and rowspan if present
            if (cell.hasAttribute('colspan')) {
              newCell.setAttribute('colspan', cell.getAttribute('colspan') || '');
            }
            if (cell.hasAttribute('rowspan')) {
              newCell.setAttribute('rowspan', cell.getAttribute('rowspan') || '');
            }
            
            // Handle empty cells
            if (!cell.innerHTML.trim()) {
              newCell.innerHTML = '&nbsp;';
            } else {
              newCell.innerHTML = cell.innerHTML;
            }
            
            newRow.appendChild(newCell);
          });
          
          tbody.appendChild(newRow);
        }
        
        newTable.appendChild(tbody);
        
        // Replace the complex structure with our simplified table
        const parent = tableBlock.parentNode;
        if (parent) {
          parent.replaceChild(newTable, tableBlock);
        }
      }
    });
  }

  private extractConversationTurns(): { role: string; content: string }[] {
    const turns: { role: string; content: string }[] = [];
    
    if (!this.conversationContainers) return turns;

    // Find if there's an extended response content - try different selectors
    let extendedContent = this.document.querySelector('#extended-response-markdown-content');
    
    if (!extendedContent) {
      // Try alternative selectors if the ID-based one failed
      extendedContent = this.document.querySelector('.message-content-readonly .markdown-main-panel');
    }
    
    if (!extendedContent) {
      // Try another selector for research content
      extendedContent = this.document.querySelector('.message-content-readonly .research-content');
    }
    
    let extendedContentHtml = '';
    
    if (extendedContent) {
      extendedContentHtml = this.processExtendedContent(extendedContent);
    }

    // Process each conversation turn
    this.conversationContainers.forEach((container, index) => {
      // Extract user query
      const userQueryElement = container.querySelector('.query-text');
      const userContent = userQueryElement?.textContent?.trim() || '';
      
      if (userContent) {
        turns.push({
          role: 'you',
          content: userContent
        });
      }

      // Extract model response - try different selectors if needed
      let modelResponseElement = container.querySelector('.markdown-main-panel');
      
      if (!modelResponseElement) {
        // Try alternative selectors if the class-based one failed
        modelResponseElement = container.querySelector('.response-content .model-response-text');
      }
      
      if (modelResponseElement) {
        let responseContent = modelResponseElement.innerHTML;
        
        // Clean up attachment containers that we don't need to display
        responseContent = responseContent.replace(/<div class="attachment-container[^>]*>[\s\S]*?<\/div><\/p>/g, '</p>');
        
        // For the last turn, add the extended content if available
        if (index === this.conversationContainers!.length - 1 && extendedContentHtml) {
          turns.push({
            role: 'gemini',
            content: extendedContentHtml
          });
        } else if (responseContent && !responseContent.includes('attachment-container')) {
          // Only add non-empty, non-attachment responses
          turns.push({
            role: 'gemini',
            content: DOMPurify.sanitize(responseContent.trim())
          });
        }
      }
    });

    // If we still have no turns and we have extended content, add it
    if (turns.length === 0 && extendedContentHtml) {
      // Try to get user query from any source
      const anyUserQuery = this.document.querySelector('.query-text');
      if (anyUserQuery && anyUserQuery.textContent) {
        turns.push({
          role: 'you',
          content: anyUserQuery.textContent.trim()
        });
      } else {
        // Add a placeholder user turn if we couldn't find one
        turns.push({
          role: 'you',
          content: 'Query'
        });
      }
      
      // Add the extended content as Gemini's response
      turns.push({
        role: 'gemini',
        content: extendedContentHtml
      });
    }

    return turns;
  }

  private processExtendedContent(container: Element): string {
    // Create a temporary document to work with the content
    const tempDoc = document.implementation.createHTMLDocument();
    const tempContainer = tempDoc.createElement('div');
    tempContainer.innerHTML = container.innerHTML;
    
    // Process Gemini's special elements in the extended content
    this.preprocessGeminiElements(tempDoc);
    
    // Get the updated HTML
    let content = tempContainer.innerHTML;
    
    // Process source links
    content = this.addSourceLinks(content);
    
    return content;
  }
  
  // Add source links section to the content
  private addSourceLinks(content: string): string {
    // Get source links if available - try different selectors
    let sourceList = this.document.querySelector('.source-list.used-sources');
    
    if (!sourceList) {
      // Try alternative selectors
      sourceList = this.document.querySelector('deep-research-source-lists .source-list');
    }
    
    if (sourceList) {
      const links = sourceList.querySelectorAll('a');
      const sources = Array.from(links).map(a => {
        const title = a.querySelector('.title')?.textContent?.trim() || '';
        const domain = a.querySelector('.domain')?.textContent?.trim() || '';
        return { 
          url: a.href, 
          title: title || domain, 
          domain 
        };
      }).filter(source => source.url); // Filter out any sources with empty URLs
      
      if (sources.length > 0) {
        content += '<h3>Sources</h3><ul>';
        sources.forEach(source => {
          // Use title if available, otherwise use domain
          const displayText = source.title || source.domain;
          content += `<li><a href="${source.url}">${displayText}</a>${source.domain ? ` (${source.domain})` : ''}</li>`;
        });
        content += '</ul>';
      }
    }
    
    return content;
  }

  private createContentHtml(turns: { role: string; content: string }[]): string {
    let content = turns.map((turn, index) => {
      const displayRole = turn.role === 'you' ? 'You' : 'Gemini';
      return `
      <div class="gemini-turn gemini-${turn.role}">
        <div class="gemini-role"><h2>${displayRole}</h2></div>
        <div class="gemini-content">
          ${turn.content}
        </div>
      </div>${index < turns.length - 1 ? '\n<hr>' : ''}`;
    }).join('\n').trim();

    return content;
  }

  private getTitle(): string {
    // Look for research title using multiple selectors
    const titleSelectors = [
      '[data-test-id="title-text"]',
      '.title-text',
      '.research-title'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = this.document.querySelector(selector);
      if (titleElement && titleElement.textContent) {
        return titleElement.textContent.trim();
      }
    }
    
    // Fallback to page title
    const pageTitle = this.document.title?.trim();
    if (pageTitle && !pageTitle.match(/^(Gemini|Google\s+Gemini)$/i)) {
      return pageTitle;
    }
    
    // Fallback to first user message
    const firstUserQuery = this.conversationContainers?.item(0)?.querySelector('.query-text');
    if (firstUserQuery) {
      const text = firstUserQuery.textContent || '';
      // Truncate to first 50 characters if longer
      return text.length > 50 ? text.slice(0, 50) + '...' : text;
    }
    
    return 'Gemini Conversation';
  }
}

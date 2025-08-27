import { processSimpleVariable } from './variables/simple';
import { processSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

import { processForLoop } from './tags/for';
import { evaluateBoolean } from './expression-evaluator';
import { processVariableAssignment } from './tags/set';

// Define a type for logic handlers
type LogicHandler = {
	type: string;
	regex: RegExp;
	process: (match: RegExpExecArray, variables: { [key: string]: any }, currentUrl: string, processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>) => Promise<string>;
};

// Define a type for assignment handlers that can modify variables
type AssignmentHandler = {
	type: string;
	regex: RegExp;
	process: (match: RegExpExecArray, variables: { [key: string]: any }, currentUrl: string) => Promise<void>;
};

// Define assignment handlers (processed first)
const assignmentHandlers: AssignmentHandler[] = [
	{
		type: 'set',
		regex: /{%\s*set\s+(\w+)\s*=\s*([\s\S]*?)\s*%}/g,
		process: async (match, variables, currentUrl) => {
			return processVariableAssignment(match, variables, currentUrl);
		}
	}
];

// Define logic handlers (processed after assignments)
const logicHandlers: LogicHandler[] = [
	{
		type: 'for',
		regex: /{%\s*for\s+(\w+)\s+in\s+([\w:@]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g,
		process: async (match, variables, currentUrl, processLogic) => {
			return processForLoop(match, variables, currentUrl, processLogic);
		}
	},
	// Add more logic handlers
];

// Main function to compile the template
export async function compileTemplate(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Process logic
	const processedText = await processLogic(text, variables, currentUrl);
	// Process other variables and filters
	return await processVariables(tabId, processedText, variables, currentUrl);
}

// Process assignments first (they define variables for later use)
export async function processAssignments(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;

	for (const handler of assignmentHandlers) {
		let match;
		while ((match = handler.regex.exec(processedText)) !== null) {
			await handler.process(match, variables, currentUrl);
			// Remove the tag. If the entire line only contains the tag and whitespace, remove the whole line; otherwise remove just the tag.
			const startOfLine = processedText.lastIndexOf('\n', match.index - 1) + 1;
			let endOfLine = processedText.indexOf('\n', match.index + match[0].length);
			if (endOfLine === -1) endOfLine = processedText.length;
			const lineBefore = processedText.slice(startOfLine, match.index);
			const lineAfter = processedText.slice(match.index + match[0].length, endOfLine);
			if (lineBefore.trim() === '' && lineAfter.trim() === '') {
				// Remove the entire line including a single trailing newline if present
				const after = processedText[endOfLine] === '\n' ? endOfLine + 1 : endOfLine;
				processedText = processedText.substring(0, startOfLine) + processedText.substring(after);
				handler.regex.lastIndex = startOfLine;
			} else {
				// Remove only the tag, keep other inline content intact
				processedText = processedText.substring(0, match.index) + processedText.substring(match.index + match[0].length);
				handler.regex.lastIndex = match.index;
			}
		}
	}

	return processedText;
}

// Process logic structures
export async function processLogic(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
    // First resolve IF blocks (and conditionally process assignments within selected branches)
    let processedText = await processIfBlocks(text, variables, currentUrl);

    // Process any remaining top-level assignments (outside IFs) before other logic expands
    processedText = await processAssignments(processedText, variables, currentUrl);

    // Then process other logic structures (e.g., for)
    for (const handler of logicHandlers) {
        let match;
        while ((match = handler.regex.exec(processedText)) !== null) {
            const result = await handler.process(match, variables, currentUrl, processLogic);
            processedText = processedText.substring(0, match.index) + result + processedText.substring(match.index + match[0].length);
            handler.regex.lastIndex = match.index + result.length;
        }
    }

    return processedText;
}

// Parse and process nested-aware IF blocks
async function processIfBlocks(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
  let result = '';
  let idx = 0;
  const startRe = /{%\s*if\b/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text)) !== null) {
    const start = m.index;
    // append preceding text
    const before = text.slice(idx, start);
    // Process assignments in the chunk before the IF
    const beforeAfterAssign = await processAssignments(before, variables, currentUrl);
    const beforeRendered = await processVariables(0, beforeAfterAssign, variables, currentUrl);
    result += beforeRendered;
    // find end of start tag
    const startTagEnd = text.indexOf('%}', start);
    if (startTagEnd === -1) {
      // malformed, append rest and break
      result += text.slice(start);
      idx = text.length;
      break;
    }
    const cond = text.slice(m.index + m[0].length, startTagEnd).trim();
    let pos = startTagEnd + 2;
    let depth = 1;
    let sections: { type: 'if' | 'elif' | 'else'; condition?: string; content: string }[] = [];
    let current = { type: 'if' as const, condition: cond, content: '' };

    const tagRe = /{%\s*(if|elif|elseif|else|endif)\b([\s\S]*?)%}/g;
    tagRe.lastIndex = pos;
    let t: RegExpExecArray | null;
    let matchedEnd = false;
    while ((t = tagRe.exec(text)) !== null) {
      const tag = t[1];
      const tagFullEnd = tagRe.lastIndex;
      const chunk = text.slice(pos, t.index);
      // Always append the chunk before the tag
      current.content += chunk;

      if (tag === 'if') {
        // Enter nested IF
        depth++;
        current.content += text.slice(t.index, tagFullEnd);
        pos = tagFullEnd;
        continue;
      }

      if (tag === 'endif') {
        if (depth === 1) {
          sections.push(current);
          pos = tagFullEnd;
          matchedEnd = true;
          break;
        } else {
          // Close a nested IF
          depth--;
          current.content += text.slice(t.index, tagFullEnd);
          pos = tagFullEnd;
          continue;
        }
      }

      if (depth === 1 && (tag === 'elif' || tag === 'elseif')) {
        sections.push(current);
        current = { type: 'elif', condition: t[2].trim(), content: '' } as any;
        pos = tagFullEnd;
        continue;
      }

      if (depth === 1 && tag === 'else') {
        sections.push(current);
        current = { type: 'else', content: '' } as any;
        pos = tagFullEnd;
        continue;
      }

      // Tag within nested content or unhandled at this depth: keep literal
      current.content += text.slice(t.index, tagFullEnd);
      pos = tagFullEnd;
    }

    const endIndex = pos;

    // If we never matched a proper endif at depth 1, treat the whole block as literal text to avoid content loss
    if (!matchedEnd) {
      result += text.slice(start, endIndex);
      idx = endIndex;
      startRe.lastIndex = idx;
      continue;
    }

    // choose section
    let selected: string = '';
    let picked = false;
    for (const s of sections) {
      if (s.type === 'if' || s.type === 'elif') {
        try {
          const ok = await evaluateBoolean((s.condition || '').trim(), variables, currentUrl);
          if (ok) {
            selected = s.content;
            picked = true;
            break;
          }
        } catch (e) {
          console.error('Error evaluating condition:', s.condition, e);
        }
      }
    }
    if (!picked) {
      const elseSec = sections.find(s => s.type === 'else');
      if (elseSec) selected = elseSec.content;
    }

    // Recurse into selected branch first (so nested IFs are resolved),
    // then variable rendering happens afterwards.
    const processed = await processLogic(selected, variables, currentUrl);
    const processedRendered = await processVariables(0, processed, variables, currentUrl);
    result += processedRendered;
    idx = endIndex;
    startRe.lastIndex = idx;
  }
  // Process assignments in the trailing chunk after the last IF
  const tail = text.slice(idx);
  const tailAfterAssign = await processAssignments(tail, variables, currentUrl);
  const tailRendered = await processVariables(0, tailAfterAssign, variables, currentUrl);
  result += tailRendered;
  return result;
}

// Process variables and apply filters
export async function processVariables(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();

		let replacement: string;

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			replacement = await processSelector(tabId, fullMatch, currentUrl);
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('"') || trimmedMatch.startsWith('prompt:')) {
			replacement = await processPrompt(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('literal:')) {
			// Handle string literals with literal: prefix
			const literalContent = trimmedMatch.substring(8); // Remove 'literal:' prefix
			if ((literalContent.startsWith('"') && literalContent.endsWith('"')) ||
				(literalContent.startsWith("'") && literalContent.endsWith("'"))) {
				replacement = literalContent.slice(1, -1);
			} else {
				replacement = literalContent;
			}
		} else {
			// Check if it's a custom variable first, then fall back to simple variable processing
			if (variables.hasOwnProperty(trimmedMatch)) {
				// Handle custom variables set with {% set %}
				const customValue = variables[trimmedMatch];
				if (trimmedMatch.includes('|')) {
					// Apply filters to custom variables
					replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
				} else {
					replacement = String(customValue ?? '');
				}
			} else {
				replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
			}
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}

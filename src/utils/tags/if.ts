import { processVariables } from '../template-compiler';
import { evaluateBoolean } from '../expression-evaluator';

export async function processIfCondition(
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string,
	processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<string> {
	console.log('Processing if condition:', match[0]);

	// Extended match layout: 1=ifCondition, 2=ifContent, 3=elifBlock(s) concatenated, 4=elseContent
	const condition = match[1];
	const ifContent = match[2];
	const elifBlocksConcat = match[3];
	const elseContent = match[4];

	let selected: string | undefined;

	try {
		const condVal = await evaluateBoolean(condition.trim(), variables, currentUrl);
		console.log(`Condition "${condition}" evaluates to:`, condVal);
		if (condVal) {
			selected = ifContent;
		}
	} catch (error) {
		console.error(`Error evaluating condition "${condition}":`, error);
		// fall through to elif/else
	}

	// If main if not selected, try elif/elseif chain
	if (!selected && elifBlocksConcat) {
		const elifRegex = /{%\s*(?:elif|elseif)\s+([\s\S]*?)\s*%}([\s\S]*?)(?=(?:{%\s*(?:elif|elseif)\s+|{%\s*else\s*%}|{%\s*endif\s*%}))/g;
		let m: RegExpExecArray | null;
		while ((m = elifRegex.exec(elifBlocksConcat)) !== null) {
			const elifCond = m[1];
			const elifContent = m[2];
			try {
				const ok = await evaluateBoolean(elifCond.trim(), variables, currentUrl);
				if (ok) {
					selected = elifContent;
					break;
				}
			} catch (e) {
				console.error(`Error evaluating elif/elseif condition "${elifCond}":`, e);
			}
		}
	}

	if (!selected && elseContent !== undefined) {
		selected = elseContent;
	}

	if (!selected) return '';

	// Process nested logic structures and variables recursively
	let processedContent = await processLogic(selected, variables, currentUrl);
	processedContent = await processVariables(0, processedContent, variables, currentUrl);
	return processedContent.trim();
}

// Variable resolution utility for Obsidian Web Clipper
// Supports preset variables, global custom variables, and per-clip custom variables
// Handles nested variable resolution and circular reference detection

export interface ResolveVariablesOptions {
  text: string;
  presetVars: Record<string, string>;
  globalCustomVars?: Record<string, string>;
  clipCustomVars?: Record<string, string>;
}

const VARIABLE_REGEX = /\{\{([a-zA-Z][a-zA-Z0-9_-]*)\}\}/g;

export function resolveVariables({
  text,
  presetVars,
  globalCustomVars = {},
  clipCustomVars = {},
}: ResolveVariablesOptions): string {
  // Merge variables by priority: clip > global > preset
  const allVars: Record<string, string> = {
    ...presetVars,
    ...globalCustomVars,
    ...clipCustomVars,
  };

  // Track variable stack for circular reference detection
  function resolve(str: string, stack: string[] = []): string {
    return str.replace(VARIABLE_REGEX, (match, varName) => {
      if (stack.includes(varName)) {
        throw new Error(
          `Circular reference detected in custom variables: ${stack.join(' -> ')} -> ${varName}`
        );
      }
      const value = allVars[`{{${varName}}}`] ?? '';
      if (value === '') return '';
      return resolve(value, [...stack, varName]);
    });
  }

  return resolve(text);
}
/**
 * Zod Configuration for Browser Extension CSP Compatibility
 * 
 * This module MUST be imported before any AI SDK code to configure Zod
 * to work in browser extension environments where CSP blocks eval/Function.
 * 
 * Zod v4 uses JIT compilation with `new Function()` by default, which triggers
 * CSP violations in browser extensions. Setting `jitless: true` disables this.
 * 
 * IMPORTANT: This file has side effects and must be imported early.
 * 
 * The configuration must be applied BEFORE zod/v4/classic/schemas.js loads,
 * because that module calculates `fastEnabled = jit && allowsEval.value` at
 * module initialization time. We import zod/v4/core directly to set the config
 * before the schemas module is loaded.
 */

// Import the Zod v4 core module directly to configure it before schemas.js loads
// This bypasses the classic/external.js which imports schemas.js
import { config } from 'zod/v4/core';

// Disable JIT mode to avoid CSP eval violations
// This must happen before any schema parsing occurs
config({ jitless: true });

export const zodConfigured = true;

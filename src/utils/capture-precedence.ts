import { CaptureResolutionInput, CaptureResult, resolveCaptureResult } from './capture-source';

export type CaptureSource = CaptureResult['source'];
export type CapturePrecedenceInput = CaptureResolutionInput;
export type CapturePrecedenceResult = CaptureResult;

// Kept as a compatibility entry point while callers move to CaptureResult.
export const resolveCaptureContent = resolveCaptureResult;

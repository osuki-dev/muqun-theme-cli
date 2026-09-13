/**
 * Cancellation, in the shape `package.ts` expects.
 *
 * The app carries a larger version of this file because React Native's
 * abort-controller polyfill has neither `reason` nor `throwIfAborted`, so it
 * has to keep causes in a side table. Node has both since 18, so here the whole
 * thing collapses to the two lines below. This is the one module that is a
 * deliberate rewrite rather than a copy.
 */
export function themeAbortReason(signal?: AbortSignal): unknown {
  if (signal?.reason != null) return signal.reason;
  const error = new Error('Theme operation canceled');
  error.name = 'AbortError';
  return error;
}

export function throwIfThemeAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw themeAbortReason(signal);
}

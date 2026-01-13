import { ActionRetrier } from "@convex-dev/action-retrier";
import { components } from "./_generated/api";

/**
 * Action retrier for generateSingleModel. Retries failed AI generation calls
 * (e.g. due to network errors, transient API failures, or rate limits) with
 * exponential backoff. Up to 4 retries with 1s initial backoff, base 2
 * (so backoffs: 1s, 2s, 4s, 8s before giving up).
 */
export const retrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 1000,
  base: 2,
  maxFailures: 4,
});

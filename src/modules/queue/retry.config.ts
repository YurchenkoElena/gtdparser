export const RETRY_CONFIG = {
  maxAttempts: 20,
  backoffDelays: [
    5 * 1000,      // 5 seconds
    15 * 1000,     // 15 seconds
    30 * 1000,     // 30 seconds
    60 * 1000,     // 1 minute
    2 * 60 * 1000, // 2 minutes
    5 * 60 * 1000, // 5 minutes
    10 * 60 * 1000, // 10 minutes
    15 * 60 * 1000, // 15 minutes
  ],
};

export function getBackoffDelay(attemptNumber: number): number {
  const { backoffDelays } = RETRY_CONFIG;

  if (attemptNumber <= 0) {
    return backoffDelays[0];
  }

  const index = Math.min(attemptNumber - 1, backoffDelays.length - 1);
  return backoffDelays[index];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

export const DLQ_QUEUE_NAME = 'gtd_dlq';


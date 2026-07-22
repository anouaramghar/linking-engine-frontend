import { useMutation, useQueryClient } from "@tanstack/react-query";

import { publishSite } from "../api/sites";
import { isConflict } from "../lib/errors";

export interface PublishOutcome {
  queued: number;
  alreadyRunning: number;
  failed: number;
}

/**
 * Publishing is per site, so shipping an approved backlog spanning several sites
 * means one job each. A site whose publish job is already running is not a
 * failure — the work the editor asked for is already happening.
 */
export const usePublishSites = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (siteIds: number[]): Promise<PublishOutcome> => {
      const results = await Promise.allSettled(siteIds.map(publishSite));
      return results.reduce<PublishOutcome>(
        (outcome, result) => {
          if (result.status === "fulfilled") outcome.queued += 1;
          else if (isConflict(result.reason)) outcome.alreadyRunning += 1;
          else outcome.failed += 1;
          return outcome;
        },
        { queued: 0, alreadyRunning: 0, failed: 0 },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
};

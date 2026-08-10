import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePublicationPlans,
  listPendingPublication,
  preparePublicationPlans,
  queueApprovedPlans,
  type PublicationPreparation,
} from "../api/publish";

export const usePendingPublication = (enabled = true) =>
  useQuery({
    queryKey: ["publish", "pending"],
    queryFn: listPendingPublication,
    enabled,
  });

/**
 * Read the live articles and store the exact edits, only when the operator asks.
 * A mutation prevents focus/remount refetches from repeating live requests or
 * paid placement work. Retry remains an explicit button click.
 */
export const usePreparePublicationPlans = () =>
  useMutation<PublicationPreparation, Error, number>({
    mutationFn: (siteId: number) => preparePublicationPlans(siteId),
  });

/**
 * Approve exactly the plans on screen, named by id *and* hash.
 *
 * Deliberately separate from queueing. Approval is the human decision and must
 * be recorded before any job exists; queueing is a retryable no-decision step.
 * Fusing them would mean a failed enqueue looked like a failed approval, and
 * the operator would be asked to agree to the same edits twice.
 */
export const useApprovePlans = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      plans,
    }: {
      siteId: number;
      plans: { id: number; plan_hash: string }[];
    }) => approvePublicationPlans(siteId, plans),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["publish", "pending"] });
    },
  });
};

/** Start the job for a site's already-approved plans. Decides nothing. */
export const useQueueApprovedPlans = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, planIds }: { siteId: number; planIds?: number[] }) =>
      queueApprovedPlans(siteId, planIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["publish", "pending"] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
};

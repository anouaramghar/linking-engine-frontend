import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getJob } from "../api/jobs";

/** Poll a job until it settles, then refresh whatever it produced. */
export const useJob = (jobId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const job = await getJob(jobId!);
      if (job.status === "finished" || job.status === "failed") {
        qc.invalidateQueries({ queryKey: ["suggestions"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        qc.invalidateQueries({ queryKey: ["sites"] });
      }
      return job;
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "finished" || s === "failed" ? false : 2000;
    },
  });
};

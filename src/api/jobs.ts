import { api } from "./client";
import type { JobRun, JobStatus } from "../types/job";

export const getJob = (id: string) => api.get<JobStatus>(`/jobs/${id}`).then((r) => r.data);

export const getActiveJobs = () =>
  api.get<JobRun[]>("/jobs/active").then((response) => response.data);

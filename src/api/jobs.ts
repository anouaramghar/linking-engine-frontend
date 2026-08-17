import { api } from "./client";
import type { JobRun, JobStatus } from "../types/job";

export const getJob = <TResult = Record<string, unknown>>(id: string) =>
  api.get<JobStatus<TResult>>(`/jobs/${id}`).then((r) => r.data);

export const getActiveJobs = () =>
  api.get<JobRun[]>("/jobs/active").then((response) => response.data);

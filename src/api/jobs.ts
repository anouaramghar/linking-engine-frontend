import { api } from "./client";
import type { JobStatus } from "../types/job";

export const getJob = (id: string) => api.get<JobStatus>(`/jobs/${id}`).then((r) => r.data);

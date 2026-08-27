import type { JobKind } from "../../types/job";

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  ingestion: "Crawl",
  analysis: "Analysis",
  publication_preparation: "Exact edits",
  publication: "Publication",
};

export const CANCELLATION_COPY: Record<JobKind, { title: string; description: string }> = {
  ingestion: {
    title: "Stop crawl?",
    description:
      "The current crawl snapshot will be discarded. Existing active content stays unchanged.",
  },
  analysis: {
    title: "Stop analysis?",
    description: "Suggestions already generated remain; no new suggestions will be added.",
  },
  publication_preparation: {
    title: "Stop exact edits?",
    description: "Any edit plan already prepared remains available; unfinished work will be stopped.",
  },
  publication: {
    title: "Stop publication?",
    description: "Changes already published remain; unfinished publication work will be stopped.",
  },
};

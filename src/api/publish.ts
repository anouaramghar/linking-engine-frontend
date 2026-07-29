import { api } from "./client";

export interface PendingPublicationSite {
  site_id: number;
  awaiting_publication: number;
}

export const listPendingPublication = () =>
  api
    .get<PendingPublicationSite[]>("/publish/pending")
    .then((response) => response.data);

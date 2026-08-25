import Modal from "../Modal";
import { LogoLoadingIndicator } from "../LogoLoadingAnimation";
import GraphLens from "../publish/GraphLens";
import type { GraphNetwork } from "../../types/graph";
import type { Site } from "../../types/site";

interface Props {
  site: Site;
  data?: GraphNetwork;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export default function SiteGraphModal({
  site,
  data,
  loading,
  error,
  onRetry,
  onClose,
}: Props) {
  return (
    <Modal
      title={`Link graph · ${site.name}`}
      description="Read-only view of this site’s active internal links and structural signals."
      onClose={onClose}
      panelClassName="max-w-[1600px] max-h-[calc(100dvh-2rem)]"
    >
      {loading && (
        <div role="status" className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
          <LogoLoadingIndicator text={`Loading ${site.name}’s link graph…`} size="lg" />
          <p className="max-w-md text-caption leading-normal text-muted">
            Reading the latest crawl snapshot. Nothing on the site will be changed.
          </p>
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="flex min-h-80 flex-col items-center justify-center text-center">
          <div className="text-body-md font-medium text-ink">The link graph could not be loaded</div>
          <p className="mt-1 max-w-md text-body-sm leading-normal text-body">
            LinkMesh could not read the latest network for {site.name}. The rest of the Sites page is
            still available.
          </p>
          <button type="button" onClick={onRetry} className="btn btn-outline mt-4">
            Try again
          </button>
        </div>
      )}

      {data && !loading && !error && <GraphLens data={data} />}
    </Modal>
  );
}

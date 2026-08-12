import Highlighted from "../Highlighted";
import { LogoLoadingIndicator } from "../LogoLoadingAnimation";
import { errorDetail } from "../../lib/errors";
import type { Placement } from "../../types/suggestion";

/**
 * The placement query, flattened to what the card actually renders. Passing the
 * whole react-query result would tie a presentational component to the data
 * layer; this is the same four facts without the dependency.
 */
export interface PlacementState {
  data?: Placement;
  /** True for the first generation and for a retry, so the card shows progress
   *  both times rather than sitting on a stale error. */
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

interface Props {
  placement: PlacementState;
}

/** 503 is the engine saying the feature is switched off, not that it failed. */
const isUnconfigured = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status === 503;

function Body({ placement }: Props) {
  const { data, isLoading, error, onRetry } = placement;

  if (isLoading) {
    return (
      <LogoLoadingIndicator
        text="Reading the article…"
        className="mt-2 gap-2.5 text-body-sm text-muted"
      />
    );
  }


  if (error) {
    // Two different situations. An unset API key is not fixed by trying again,
    // so that one states the cause and offers no button.
    return isUnconfigured(error) ? (
      <div className="mt-2 text-body-sm leading-normal text-muted">
        Placement context is not configured on this engine.
      </div>
    ) : (
      <div className="mt-2">
        <div className="text-body-sm leading-normal text-muted">
          {errorDetail(error, "Could not work out where this link belongs.")}
        </div>
        <button type="button" onClick={onRetry} className="btn btn-outline btn-sm mt-3">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  if (!data.found || !data.placement_context) {
    return (
      <div className="mt-2 text-body-sm leading-normal text-muted">
        No natural spot for this link in the article.
      </div>
    );
  }

  return (
    <>
      <blockquote className="mt-2 border-l-2 border-hairline-strong pl-3 text-body-sm leading-normal text-body">
        <Highlighted context={data.placement_context} anchor={data.anchor_text} />
      </blockquote>
      <div className="mt-3 text-caption leading-normal text-muted">
        Quoted from the source article. Selecting this suggestion starts the
        review flow; it is not written in-text yet.
      </div>
    </>
  );
}

/**
 * Where in the source article the suggested link belongs.
 *
 * The passage is quoted verbatim from the article — the engine discards
 * anything the model could not locate there — so an editor is deciding about a
 * real position, not a plausible-sounding one.
 */
export default function PlacementContextCard({ placement }: Props) {
  return (
    <div className="card px-5 py-4">
      <div className="eyebrow">Placement context</div>
      <Body placement={placement} />
    </div>
  );
}

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import BulkRecoveryPanel from "./BulkRecoveryPanel";

afterEach(cleanup);

it("shows exact failed identities and retries only that set", () => {
  const retry = vi.fn();
  const proceed = vi.fn();
  render(
    <BulkRecoveryPanel
      recovery={{ status: "rejected", failedIds: [14, 18], notAttemptedIds: [22] }}
      busy={false}
      onRetryFailed={retry}
      onContinue={proceed}
      onDismiss={vi.fn()}
    />,
  );

  expect(screen.getByText(/#14, #18/)).not.toBeNull();
  expect(screen.getByText(/#22/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry failed only" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(proceed).not.toHaveBeenCalled();
});

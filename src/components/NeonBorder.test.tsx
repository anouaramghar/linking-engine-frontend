import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NeonBorder from "./NeonBorder";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NeonBorder", () => {
  it("does not schedule animation frames when motion is frozen", () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");

    render(
      <div style={{ height: 100, width: 100 }}>
        <NeonBorder speed={0} />
      </div>,
    );

    expect(requestFrame).not.toHaveBeenCalled();
  });
});

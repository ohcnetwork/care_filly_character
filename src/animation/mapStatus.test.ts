import { describe, expect, it } from "vitest";
import { mapStatusToState } from "./mapStatus";

describe("mapStatusToState", () => {
  it("maps every FillyStatus", () => {
    expect(mapStatusToState("idle")).toBe("idle");
    expect(mapStatusToState("recording")).toBe("listening");
    expect(mapStatusToState("recording", { speaking: true })).toBe("talking");
    expect(mapStatusToState("recording", { speaking: false })).toBe("listening");
    expect(mapStatusToState("paused")).toBe("sleepy");
    expect(mapStatusToState("processing")).toBe("thinking");
    expect(mapStatusToState("completed")).toBe("happy");
    expect(mapStatusToState("failed")).toBe("surprised");
  });

  it("falls back to idle for unknown input", () => {
    expect(mapStatusToState("bogus")).toBe("idle");
    expect(mapStatusToState("")).toBe("idle");
  });

  it("speaking only affects recording", () => {
    expect(mapStatusToState("processing", { speaking: true })).toBe("thinking");
    expect(mapStatusToState("idle", { speaking: true })).toBe("idle");
  });
});

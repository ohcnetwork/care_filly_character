import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../src/react/FillyCharacter", () => ({
  FillyCharacter: () => createElement("div", { "data-testid": "filly-character" }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("playground routing", () => {
  it.each(["/exhibit", "/exhibit/"])("renders the exhibition at %s before query-based tools", (pathname) => {
    vi.stubGlobal("window", { location: { pathname, search: "?state=happy&sheet=1" } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('aria-label="CARE exhibition"');
    expect(html).toContain("Meet CARE.");
    expect(html).toContain("Filly, the CARE mascot");
  });

  it("preserves the deterministic frame route", () => {
    vi.stubGlobal("window", { location: { pathname: "/", search: "?state=happy&t=1" } });
    expect(renderToStaticMarkup(createElement(App))).toContain('class="frame"');
  });
});
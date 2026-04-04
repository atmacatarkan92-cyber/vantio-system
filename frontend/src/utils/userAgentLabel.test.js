import { getDeviceLabelFromUserAgent } from "./userAgentLabel";

describe("getDeviceLabelFromUserAgent", () => {
  it("returns default for empty input", () => {
    expect(getDeviceLabelFromUserAgent("")).toBe("Unbekanntes Gerät");
    expect(getDeviceLabelFromUserAgent(null)).toBe("Unbekanntes Gerät");
  });

  it("maps Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(getDeviceLabelFromUserAgent(ua)).toBe("Chrome auf Windows");
  });

  it("maps Safari on iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(getDeviceLabelFromUserAgent(ua)).toBe("Safari auf iPhone");
  });

  it("maps Edge on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    expect(getDeviceLabelFromUserAgent(ua)).toBe("Edge auf Windows");
  });

  it("maps Firefox on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";
    expect(getDeviceLabelFromUserAgent(ua)).toBe("Firefox auf macOS");
  });
});

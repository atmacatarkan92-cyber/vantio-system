import { buildLoginDeviceStatusMap } from "./loginDeviceAuditStatus";
import { computeDeviceFingerprint } from "./loginDeviceFingerprint";

describe("computeDeviceFingerprint", () => {
  it("returns null if UA missing", () => {
    expect(computeDeviceFingerprint(null, "1.2.3.4")).toBeNull();
  });
  it("returns null if IP missing", () => {
    expect(computeDeviceFingerprint("Mozilla/5.0", null)).toBeNull();
  });
  it("returns stable string when both set", () => {
    expect(computeDeviceFingerprint("UA", "10.0.0.1")).toBe("UA\u001f10.0.0.1");
  });
});

describe("buildLoginDeviceStatusMap", () => {
  const ua = "Mozilla/5.0 Test";
  const ip = "198.51.100.1";

  it("marks first login for user as new when no older match", () => {
    const rows = [
      {
        id: "a",
        action: "login",
        actor_user_id: "u1",
        metadata: { user_agent: ua, ip_address: ip },
      },
    ];
    const m = buildLoginDeviceStatusMap(rows);
    expect(m.get("a")).toBe("new");
  });

  it("marks known when older row has same fingerprint", () => {
    const rows = [
      {
        id: "newer",
        action: "login",
        actor_user_id: "u1",
        metadata: { user_agent: ua, ip_address: ip },
      },
      {
        id: "older",
        action: "login",
        actor_user_id: "u1",
        metadata: { user_agent: ua, ip_address: ip },
      },
    ];
    const m = buildLoginDeviceStatusMap(rows);
    expect(m.get("newer")).toBe("known");
    expect(m.get("older")).toBe("new");
  });

  it("ignores other users", () => {
    const rows = [
      {
        id: "a",
        action: "login",
        actor_user_id: "u1",
        metadata: { user_agent: ua, ip_address: ip },
      },
      {
        id: "b",
        action: "login",
        actor_user_id: "u2",
        metadata: { user_agent: ua, ip_address: ip },
      },
    ];
    const m = buildLoginDeviceStatusMap(rows);
    expect(m.get("a")).toBe("new");
    expect(m.get("b")).toBe("new");
  });

  it("returns unknown for incomplete metadata", () => {
    const rows = [
      {
        id: "x",
        action: "login",
        actor_user_id: "u1",
        metadata: { user_agent: ua },
      },
    ];
    expect(buildLoginDeviceStatusMap(rows).get("x")).toBe("unknown");
  });
});

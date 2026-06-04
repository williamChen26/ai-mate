import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_SYNC_ROUTE,
  isOriginAllowed,
  loadServerConfig
} from "../config.js";

describe("server config", () => {
  it("uses explicit local defaults", () => {
    const config = loadServerConfig({});

    expect(config.host).toBe(DEFAULT_HOST);
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.syncRoute).toBe(DEFAULT_SYNC_ROUTE);
    expect(config.allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it("parses env overrides and normalizes routes/origins", () => {
    const config = loadServerConfig({
      HOST: "0.0.0.0",
      PORT: "4123",
      SYNC_ROUTE: "sync/connect",
      ALLOWED_ORIGINS: " http://127.0.0.1:3100, http://localhost:3100 "
    });

    expect(config).toEqual({
      host: "0.0.0.0",
      port: 4123,
      syncRoute: "/sync/connect",
      allowedOrigins: ["http://127.0.0.1:3100", "http://localhost:3100"]
    });
  });

  it("rejects invalid ports and wildcard origins", () => {
    expect(() => loadServerConfig({ PORT: "0" })).toThrow(/PORT/);
    expect(() => loadServerConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadServerConfig({ ALLOWED_ORIGINS: "*" })).toThrow(
      /ALLOWED_ORIGINS/
    );
  });

  it("allows exact configured browser origins and absent local smoke origins", () => {
    const config = loadServerConfig({
      ALLOWED_ORIGINS: "http://127.0.0.1:3100"
    });

    expect(isOriginAllowed(undefined, config.allowedOrigins)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:3100", config.allowedOrigins)).toBe(
      true
    );
    expect(isOriginAllowed("http://localhost:3100", config.allowedOrigins)).toBe(
      false
    );
  });
});

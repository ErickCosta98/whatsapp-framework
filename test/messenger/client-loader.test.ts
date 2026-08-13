import { describe, it, expect, vi } from "vitest";

vi.mock("module", () => ({
  createRequire: vi.fn(),
}));

import { createRequire } from "module";
import { loadMessengerClient } from "../../src/messenger/client-loader.js";

describe("messenger / client-loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns nkxfca module when installed", async () => {
    const mockRequire = vi.fn(() => ({ login: vi.fn() }));
    (createRequire as any).mockReturnValue(mockRequire);

    const result = await loadMessengerClient();
    expect(result).toHaveProperty("login");
    expect(mockRequire).toHaveBeenCalledWith("@neoaz07/nkxfca");
  });

  it("throws clear error when nkxfca is missing", async () => {
    const mockRequire = vi.fn(() => {
      throw new Error("Cannot find module");
    });
    (createRequire as any).mockReturnValue(mockRequire);

    await expect(loadMessengerClient()).rejects.toThrow(
      "Missing optional peer dependency @neoaz07/nkxfca. Install it to use Messenger support.",
    );
  });
});

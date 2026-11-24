import { describe, expect, it } from "vitest";
import { moveArrayItem, isPlaintextIpForEncryptedDns } from "./shared";

describe("moveArrayItem", () => {
  it("moves an item forward and backward without mutating the source", () => {
    const original = ["a", "b", "c", "d"];
    expect(moveArrayItem(original, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveArrayItem(original, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(original).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same array for no-op moves", () => {
    const original = ["a", "b"];
    expect(moveArrayItem(original, 0, 0)).toBe(original);
    expect(moveArrayItem(original, 0, -1)).toBe(original);
    expect(moveArrayItem(original, 0, 2)).toBe(original);
  });
});

describe("isPlaintextIpForEncryptedDns", () => {
  it("flags encrypted types paired with known plaintext-only DNS IPs", () => {
    expect(isPlaintextIpForEncryptedDns("https", "119.29.29.29")).toBe(true);
    expect(isPlaintextIpForEncryptedDns("tls", "114.114.114.114")).toBe(true);
    expect(isPlaintextIpForEncryptedDns("h3", "180.76.76.76")).toBe(true);
    expect(isPlaintextIpForEncryptedDns("quic", "119.29.29.29")).toBe(true);
  });

  it("handles an optional :port suffix", () => {
    expect(isPlaintextIpForEncryptedDns("https", "119.29.29.29:443")).toBe(true);
  });

  it("does not flag valid DoH IPs with encrypted types", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "223.5.5.5", "1.12.12.12"]) {
      expect(isPlaintextIpForEncryptedDns("https", ip)).toBe(false);
    }
  });

  it("does not flag plaintext IPs with the udp type", () => {
    expect(isPlaintextIpForEncryptedDns("udp", "119.29.29.29")).toBe(false);
  });

  it("does not flag hostname servers", () => {
    expect(isPlaintextIpForEncryptedDns("https", "doh.pub")).toBe(false);
  });
});

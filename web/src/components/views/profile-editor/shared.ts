/** Move an item inside an array without mutating the source (used by all reorderable lists). */
export function moveArrayItem<T>(
  arr: T[],
  fromIdx: number,
  toIdx: number,
): T[] {
  if (toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return arr;
  const next = [...arr];
  const [removed] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, removed);
  return next;
}

/** Encrypted DNS transports (DoH / DoT / DoH3 / DoQ). */
export const ENCRYPTED_DNS_TYPES = ["https", "tls", "h3", "quic"] as const;

/**
 * Well-known plaintext-only DNS resolver IPs. These answer on UDP 53 but do not
 * serve encrypted DNS on 443/853, so pairing one with an encrypted `type` fails
 * at runtime (e.g. `dial tcp 119.29.29.29:443: i/o timeout`).
 * Keep in sync with `PLAINTEXT_ONLY_DNS_IPS` in schema_validator.rs.
 */
export const PLAINTEXT_ONLY_DNS_IPS = [
  "119.29.29.29",
  "114.114.114.114",
  "180.76.76.76",
];

/** Returns the host part of a `server` value, stripping a single optional `:port`. */
function serverHost(server: string): string {
  const trimmed = server.trim();
  const firstColon = trimmed.indexOf(":");
  // Only strip a port for a plain address with one colon and a numeric suffix
  // (e.g. "119.29.29.29:443"). IPv6 (multiple colons) and hostnames stay intact.
  if (firstColon > 0 && firstColon === trimmed.lastIndexOf(":")) {
    const host = trimmed.slice(0, firstColon);
    if (/^\d+$/.test(trimmed.slice(firstColon + 1))) return host;
  }
  return trimmed;
}

/** True when switching an address to an encrypted type would be incompatible. */
export function isPlaintextIpForEncryptedDns(
  type: string,
  server: string,
): boolean {
  return (
    (ENCRYPTED_DNS_TYPES as readonly string[]).includes(type) &&
    PLAINTEXT_ONLY_DNS_IPS.includes(serverHost(server))
  );
}

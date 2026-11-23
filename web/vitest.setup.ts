// Node 26 exposes a global `localStorage` accessor that returns `undefined`
// unless the process is started with --localstorage-file. Vitest's jsdom
// environment collides with that accessor, leaving window.localStorage broken
// in tests. Replace it with a spec-compliant in-memory implementation.
class TestStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new TestStorage(),
  configurable: true,
  writable: true,
});

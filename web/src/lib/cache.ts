/** Simple in-memory cache with TTL. */

export class TTLCache<K, V> {
  private entries = new Map<K, { value: V; expires: number }>();

  constructor(private ttl: number) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.set(key, { value, expires: Date.now() + this.ttl });
  }

  clear(): void {
    this.entries.clear();
  }
}

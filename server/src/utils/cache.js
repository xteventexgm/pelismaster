class SimpleCache {
  constructor(defaultTtlSeconds = 600) {
    this.cache = new Map();
    this.defaultTtl = defaultTtlSeconds * 1000;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttlSeconds) {
    const ttl = (ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  clear() {
    this.cache.clear();
  }
}

export const memoryCache = new SimpleCache(600); // 10 minutes default

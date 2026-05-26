export type AssetKind = "image" | "audio" | "json" | "text";

export class AssetLoader {
  private cache = new Map<string, unknown>();

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get<T>(key: string): T {
    const asset = this.cache.get(key);
    if (asset === undefined) {
      throw new Error(`Asset not loaded: ${key}`);
    }
    return asset as T;
  }

  set<T>(key: string, value: T): T {
    this.cache.set(key, value);
    return value;
  }

  async image(key: string, url: string): Promise<HTMLImageElement> {
    if (this.has(key)) {
      return this.get<HTMLImageElement>(key);
    }
    const image = new Image();
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    });
    image.src = url;
    return this.set(key, await loaded);
  }

  async audio(key: string, url: string): Promise<HTMLAudioElement> {
    if (this.has(key)) {
      return this.get<HTMLAudioElement>(key);
    }
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("canplaythrough", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error(`Failed to load audio: ${url}`)), { once: true });
      audio.load();
    });
    return this.set(key, audio);
  }

  async json<T>(key: string, url: string): Promise<T> {
    if (this.has(key)) {
      return this.get<T>(key);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${url}`);
    }
    return this.set(key, (await response.json()) as T);
  }

  async text(key: string, url: string): Promise<string> {
    if (this.has(key)) {
      return this.get<string>(key);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load text: ${url}`);
    }
    return this.set(key, await response.text());
  }
}

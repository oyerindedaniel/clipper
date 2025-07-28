import { ClipOptions } from "@/types/app";
import logger from "@/utils/logger";

interface ClipCacheEntry {
  blob: Blob;
  cachedAt: number;
}

/** Provides access to FFmpeg-recorded video clips with in-memory caching. */

class RecordingService {
  private static instance: RecordingService | null = null;
  private readonly clipCache: Map<string, ClipCacheEntry> = new Map();
  private readonly cacheTTL = 10 * 60 * 1000;

  public static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }
    return RecordingService.instance;
  }

  public async getClipBlob(
    startTime: number,
    endTime: number,
    options: ClipOptions = {}
  ): Promise<Blob | null> {
    const { convertAspectRatio = "original", cropMode = "letterbox" } = options;
    const cacheKey = `${startTime}-${endTime}-${convertAspectRatio}-${cropMode}`;

    const cached = this.clipCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      logger.log("📦 Using cached clip blob", {
        cacheKey: cacheKey.slice(0, 50) + "...",
        size: cached.blob.size,
      });
      return cached.blob;
    }

    if (typeof window === "undefined" || !window.electronAPI) {
      logger.error("❌ ElectronAPI not available");
      return null;
    }

    try {
      logger.log("🎞️ Requesting new clip blob", {
        startTime,
        endTime,
        duration: endTime - startTime,
        options,
      });

      const result = await window.electronAPI.getClipBlob(
        startTime,
        endTime,
        options
      );

      if (!result.success || !result.blob) {
        logger.error("❌ Failed to retrieve clip blob:", result.error);
        return null;
      }

      const blob = new Blob([result.blob], { type: "video/webm" });
      this.clipCache.set(cacheKey, { blob, cachedAt: Date.now() });
      this.cleanCache();

      logger.log("✅ Clip blob received and cached", {
        blobSize: blob.size,
        sizeInMB: (blob.size / 1024 / 1024).toFixed(2),
        cacheSize: this.clipCache.size,
      });

      return blob;
    } catch (error) {
      logger.error("❌ Error during clip blob fetch:", error);
      return null;
    }
  }

  public async getBufferDuration(): Promise<number> {
    if (typeof window === "undefined" || !window.electronAPI) {
      return 0;
    }

    try {
      return await window.electronAPI.getBufferDuration();
    } catch (error) {
      logger.warn("⚠️ Failed to get buffer duration:", error);
      return 0;
    }
  }

  public clearCache(): void {
    this.clipCache.clear();
    logger.log("🧹 Clip cache cleared");
  }

  public getCacheStats(): { size: number; totalMemoryMB: number } {
    let totalSize = 0;
    for (const entry of this.clipCache.values()) {
      totalSize += entry.blob.size;
    }

    return {
      size: this.clipCache.size,
      totalMemoryMB: totalSize / 1024 / 1024,
    };
  }

  private cleanCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.clipCache.entries()) {
      if (now - entry.cachedAt > this.cacheTTL) {
        expiredKeys.push(key);
        this.clipCache.delete(key);
      }
    }

    if (expiredKeys.length > 0) {
      logger.log(
        `🗑️ Cleaned ${expiredKeys.length} expired clip(s). Remaining: ${this.clipCache.size}`
      );
    }
  }
}

const recordingService = RecordingService.getInstance();
export default recordingService;

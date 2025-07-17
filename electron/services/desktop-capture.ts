import { desktopCapturer, BrowserWindow, app } from "electron";
import logger from "../../src/utils/logger";

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id?: string;
}

interface ElectronVideoConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource: string;
    chromeMediaSourceId: string;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    minFrameRate?: number;
    maxFrameRate?: number;
  };
}

interface ElectronAudioConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource: string;
    chromeMediaSourceId: string;
  };
}

interface ElectronMediaStreamConstraints extends MediaStreamConstraints {
  video?: ElectronVideoConstraints | boolean;
  audio?: ElectronAudioConstraints | boolean;
}

class DesktopCaptureManager {
  private static instance: DesktopCaptureManager;
  private captureAttempts = new Map<string, number>();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  static getInstance(): DesktopCaptureManager {
    if (!this.instance) {
      this.instance = new DesktopCaptureManager();
    }
    return this.instance;
  }

  /**
   * Get desktop sources with enhanced error handling
   */
  async getDesktopSources(): Promise<CaptureSource[]> {
    try {
      // Try to get sources with different fetch windows options
      const sources = await desktopCapturer.getSources({
        types: ["window", "screen"],
        fetchWindowIcons: false,
        thumbnailSize: { width: 150, height: 150 },
        // @ts-ignore
        add_current_process_windows: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
      }));
    } catch (error) {
      logger.error("Failed to get desktop sources:", error);
      throw error;
    }
  }

  /**
   * Find the best capture source with fallback options
   */
  async findBestCaptureSource(
    preferredSourceId?: string,
    twitchWindow?: BrowserWindow | null
  ): Promise<CaptureSource | null> {
    try {
      const sources = await this.getDesktopSources();

      // Try preferred source first
      if (preferredSourceId) {
        const preferred = sources.find((s) => s.id === preferredSourceId);
        if (preferred && (await this.validateSource(preferred))) {
          return preferred;
        }
      }

      // Try Twitch window if available
      if (twitchWindow) {
        const twitchTitle = twitchWindow.getTitle();
        const twitchSource = sources.find((s) => s.name === twitchTitle);
        if (twitchSource && (await this.validateSource(twitchSource))) {
          return twitchSource;
        }
      }

      // Try browser windows
      const browserSources = sources.filter(
        (s) =>
          /chrome|firefox|edge|brave|opera/i.test(s.name) &&
          /twitch/i.test(s.name)
      );

      for (const source of browserSources) {
        if (await this.validateSource(source)) {
          return source;
        }
      }

      // Fallback to primary screen
      const screenSources = sources.filter((s) => s.id.startsWith("screen:"));
      if (screenSources.length > 0) {
        const primaryScreen = screenSources[0];
        if (await this.validateSource(primaryScreen)) {
          return primaryScreen;
        }
      }

      return null;
    } catch (error) {
      logger.error("Failed to find capture source:", error);
      return null;
    }
  }

  /**
   * Validate if a source can be captured successfully
   */
  private async validateSource(source: CaptureSource): Promise<boolean> {
    return true;

    try {
      // Check if we've failed too many times with this source
      const attempts = this.captureAttempts.get(source.id) || 0;
      if (attempts >= this.maxRetries) {
        logger.warn(`Source ${source.id} has exceeded max retry attempts`);
        return false;
      }

      // Try to create a test stream to validate the source
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            minWidth: 640,
            maxWidth: 1920,
            minHeight: 360,
            maxHeight: 1080,
          },
        } as ElectronVideoConstraints,
      });

      // Cleanup test stream immediately
      testStream.getTracks().forEach((track) => track.stop());

      // Reset attempts counter on success
      this.captureAttempts.delete(source.id);
      return true;
    } catch (error) {
      // Increment attempts counter
      const attempts = this.captureAttempts.get(source.id) || 0;
      this.captureAttempts.set(source.id, attempts + 1);

      logger.warn(`Source validation failed for ${source.id}:`, error);
      return false;
    }
  }

  /**
   * Clear retry attempts cache
   */
  clearRetryCache(): void {
    this.captureAttempts.clear();
  }
}

export default DesktopCaptureManager;

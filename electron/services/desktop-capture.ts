import { desktopCapturer, BrowserWindow } from "electron";
import logger from "../../src/utils/logger";

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id?: string;
}

class DesktopCaptureManager {
  private static instance: DesktopCaptureManager;

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
        // types: ["window", "screen"],
        types: ["window"],
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
        if (preferred) {
          return preferred;
        }
      }

      // Try Twitch window if available
      if (twitchWindow) {
        const twitchTitle = twitchWindow.getTitle();
        const twitchSource = sources.find((s) => s.name === twitchTitle);
        if (twitchSource) {
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
        return source; // Return the first valid browser source found
      }

      // Fallback to primary screen
      const screenSources = sources.filter((s) => s.id.startsWith("screen:"));
      if (screenSources.length > 0) {
        const primaryScreen = screenSources[0];
        return primaryScreen;
      }

      return null;
    } catch (error) {
      logger.error("Failed to find capture source:", error);
      return null;
    }
  }
}

export default DesktopCaptureManager;

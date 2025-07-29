import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import logger from "@/utils/logger";

interface PlatformConfig {
  sourceFolder: string;
  executable: string;
  requiredFiles: string[];
}

const IS_DEV = process.env.NODE_ENV !== "production";
const ROOT_DIR = path.resolve(__dirname, "..");
const OBS_SOURCE_DIR = path.join(ROOT_DIR, "obs-binaries");
const OBS_TARGET_DIR = path.join(ROOT_DIR, "dist", "obs-studio-portable");

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  win32: {
    sourceFolder: "windows",
    executable: "bin/64bit/obs64.exe",
    requiredFiles: ["bin/", "data/", "obs-plugins/", "config/"],
  },
  darwin: {
    sourceFolder: "macos",
    executable: "OBS.app/Contents/MacOS/OBS",
    requiredFiles: ["OBS.app/"],
  },
  linux: {
    sourceFolder: "linux",
    executable: "bin/obs",
    requiredFiles: ["bin/", "lib/", "share/", "data/"],
  },
};

/**
 * Recursively copy a directory or file from `src` to `dest`.
 */
function copyRecursiveSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Validate platform-specific OBS binaries structure and presence.
 */
function validateObsBinaries(
  platform: NodeJS.Platform,
  config: PlatformConfig
): string {
  logger.log("🔍 Validating OBS binaries...");

  const platformDir = path.join(OBS_SOURCE_DIR, config.sourceFolder);

  if (!fs.existsSync(platformDir)) {
    logger.error(`❌ OBS source not found: ${platformDir}`);
    process.exit(1);
  }

  const executablePath = path.join(platformDir, config.executable);
  if (!fs.existsSync(executablePath)) {
    logger.error(`❌ OBS executable missing: ${executablePath}`);
    process.exit(1);
  }

  const missing = config.requiredFiles.filter(
    (file) => !fs.existsSync(path.join(platformDir, file))
  );

  if (missing.length > 0) {
    logger.error("❌ Missing required OBS components:");
    missing.forEach((file) => logger.error(` - ${file}`));
    process.exit(1);
  }

  logger.log("✅ OBS binaries validated.");
  return platformDir;
}

/**
 * Setup OBS Studio portable build into dist folder for development use.
 */
async function setupOBS(): Promise<void> {
  if (!IS_DEV) {
    logger.log("Skipping OBS setup in production mode.");
    return;
  }

  const platform = process.platform as NodeJS.Platform;
  const config = PLATFORM_CONFIGS[platform];

  if (!config) {
    logger.error(`❌ Unsupported platform: ${platform}`);
    process.exit(1);
  }

  const platformSourceDir = validateObsBinaries(platform, config);

  logger.log("🧹 Cleaning existing OBS output directory...");
  if (fs.existsSync(OBS_TARGET_DIR)) {
    fs.rmSync(OBS_TARGET_DIR, { recursive: true, force: true });
  }

  logger.log("📦 Copying OBS files to dist...");
  copyRecursiveSync(platformSourceDir, OBS_TARGET_DIR);

  if (platform !== "win32") {
    try {
      const execPath = path.join(OBS_TARGET_DIR, config.executable);
      execSync(`chmod +x "${execPath}"`);
      logger.log("✅ Set executable permissions.");
    } catch (error) {
      logger.warn("⚠️ Could not set executable permissions:", error);
    }
  }

  const configDir = path.join(OBS_TARGET_DIR, "config", "basic", "scenes");
  fs.mkdirSync(configDir, { recursive: true });

  logger.log("🎉 OBS Studio setup complete.");
  logger.log(`📁 Output: ${OBS_TARGET_DIR}`);
  logger.log(`🎯 Executable: ${path.join(OBS_TARGET_DIR, config.executable)}`);
}

setupOBS().catch((err) => {
  logger.error("❌ OBS setup failed:", err);
  process.exit(1);
});

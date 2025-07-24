import * as fs from "fs";
import * as path from "path";
import logger from "@/utils/logger";

function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    logger.warn(`Source directory does not exist: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
      continue;
    }

    const isFontFile = /\.(ttf|otf|woff2?)$/i.test(entry.name);
    if (!isFontFile) {
      continue;
    }

    if (fs.existsSync(destPath)) {
      const srcStat = fs.statSync(srcPath);
      const destStat = fs.statSync(destPath);

      if (srcStat.size === destStat.size) {
        logger.debug(`Skipped (already exists): ${entry.name}`);
        continue;
      }
    }

    fs.copyFileSync(srcPath, destPath);
    logger.info(`Copied font: ${entry.name}`);
  }
}

const srcFonts = path.join(__dirname, "..", "src", "assets", "fonts");
const destFonts = path.join(__dirname, "..", "dist", "assets", "fonts");

logger.log("📝 Copying fonts...");
logger.log(`From: ${srcFonts}`);
logger.log(`To: ${destFonts}`);

copyDirectory(srcFonts, destFonts);

logger.log("✅ Font copy complete.");

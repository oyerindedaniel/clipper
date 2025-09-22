import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { deregisterAllFonts, registerFont } from "canvas";
import logger from "../../src/utils/logger";
import { FontDefinition, FontStyle, FontWeight } from "../../src/types/app";
import { app } from "electron";

type CanvasFontOptions = Parameters<typeof registerFont>[1];

class FontManager {
  private static instance: FontManager;
  private registeredFonts = new Map<string, FontDefinition>();
  private systemFonts = new Map<string, string>();

  private constructor() {
    this.initializeSystemFonts();
    this.registerDefaultFonts();
  }

  static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  /**
   * Generates a normalized key for font map access
   */
  private getFontKey(family: string, weight?: string, style?: string): string {
    return `${family}-${weight || "normal"}-${style || "normal"}`;
  }

  /**
   * Initialize system font paths based on OS
   */
  private initializeSystemFonts(): void {
    const platform = os.platform();

    const commonFonts: Record<string, string | null> = {
      Arial: this.getSystemFontPath("Arial", platform),
      "Times New Roman": this.getSystemFontPath("Times New Roman", platform),
      "Courier New": this.getSystemFontPath("Courier New", platform),
      Helvetica: this.getSystemFontPath("Helvetica", platform),
      Georgia: this.getSystemFontPath("Georgia", platform),
      Verdana: this.getSystemFontPath("Verdana", platform),
      "Trebuchet MS": this.getSystemFontPath("Trebuchet MS", platform),
      "Comic Sans MS": this.getSystemFontPath("Comic Sans MS", platform),
      Impact: this.getSystemFontPath("Impact", platform),
      "Lucida Console": this.getSystemFontPath("Lucida Console", platform),
    };

    for (const [family, fontPath] of Object.entries(commonFonts)) {
      if (fontPath && fs.existsSync(fontPath)) {
        this.systemFonts.set(family, fontPath);
        logger.log(`✅ Found system font: ${family} at ${fontPath}`);
      } else {
        logger.warn(`⚠️ System font not found: ${family}`);
      }
    }
  }

  private getSystemFontPath(fontName: string, platform: string): string | null {
    switch (platform) {
      case "win32":
        return this.findWindowsFont(fontName);
      case "darwin":
        return this.findMacFont(fontName);
      case "linux":
        return this.findLinuxFont(fontName);
      default:
        return null;
    }
  }

  private findWindowsFont(fontName: string): string | null {
    const windowsFontDirs = [
      "C:\\Windows\\Fonts",
      path.join(
        os.homedir(),
        "AppData",
        "Local",
        "Microsoft",
        "Windows",
        "Fonts"
      ),
    ];

    const fontMappings: Record<string, string[]> = {
      Arial: ["arial.ttf"],
      "Times New Roman": ["times.ttf"],
      "Courier New": ["cour.ttf"],
      Helvetica: ["helvetica.ttf", "arial.ttf"],
      Georgia: ["georgia.ttf"],
      Verdana: ["verdana.ttf"],
      "Trebuchet MS": ["trebuc.ttf"],
      "Comic Sans MS": ["comic.ttf"],
      Impact: ["impact.ttf"],
      "Lucida Console": ["lucon.ttf"],
    };

    const files = fontMappings[fontName] || [`${fontName}.ttf`];

    for (const dir of windowsFontDirs) {
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
    return null;
  }

  private findMacFont(fontName: string): string | null {
    const macFontDirs = [
      "/System/Library/Fonts",
      "/Library/Fonts",
      path.join(os.homedir(), "Library", "Fonts"),
    ];

    const fontMappings: Record<string, string[]> = {
      Arial: ["Arial.ttf", "Arial.ttc"],
      "Times New Roman": ["Times New Roman.ttf"],
      "Courier New": ["Courier New.ttf"],
      Helvetica: ["Helvetica.ttc", "Helvetica.ttf"],
      Georgia: ["Georgia.ttf"],
      Verdana: ["Verdana.ttf"],
      "Trebuchet MS": ["Trebuchet MS.ttf"],
      "Comic Sans MS": ["Comic Sans MS.ttf"],
      Impact: ["Impact.ttf"],
    };

    const files = fontMappings[fontName] || [
      `${fontName}.ttf`,
      `${fontName}.ttc`,
    ];

    for (const dir of macFontDirs) {
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
    return null;
  }

  private findLinuxFont(fontName: string): string | null {
    const dirs = [
      "/usr/share/fonts",
      "/usr/local/share/fonts",
      path.join(os.homedir(), ".fonts"),
      path.join(os.homedir(), ".local", "share", "fonts"),
    ];

    const walk = (dir: string): string[] => {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;

      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results.push(...walk(fullPath));
          } else {
            results.push(fullPath);
          }
        } catch {}
      }
      return results;
    };

    for (const dir of dirs) {
      const files = walk(dir);
      for (const file of files) {
        const name = file.toLowerCase();
        if (
          (name.includes(fontName.toLowerCase()) ||
            name.includes(fontName.replace(/\s+/g, "").toLowerCase())) &&
          (file.endsWith(".ttf") || file.endsWith(".otf"))
        ) {
          return file;
        }
      }
    }
    return null;
  }

  private registerDefaultFonts(): void {
    for (const [family, fontPath] of this.systemFonts.entries()) {
      try {
        registerFont(fontPath, { family });
        this.registeredFonts.set(this.getFontKey(family), {
          family,
          path: fontPath,
        });
        logger.log(`📝 Registered system font: ${family}`);
      } catch (error) {
        logger.warn(`Failed to register system font ${family}:`, error);
      }
    }
  }

  registerCustomFont(
    fontPath: string,
    family: string,
    weight?: FontWeight,
    style?: FontStyle
  ): boolean {
    if (!fs.existsSync(fontPath)) {
      logger.error(`Font file not found: ${fontPath}`);
      return false;
    }

    try {
      const options: CanvasFontOptions = { family, weight, style };
      registerFont(fontPath, options);

      const key = this.getFontKey(family, weight, style);
      this.registeredFonts.set(key, { family, weight, style, path: fontPath });

      logger.log(`✅ Registered custom font: ${family}`, {
        weight,
        style,
        path: fontPath,
      });
      return true;
    } catch (error) {
      logger.error(`Failed to register custom font ${family}:`, error);
      return false;
    }
  }

  getFontFamily(
    requestedFamily: string,
    weight?: FontWeight,
    style?: FontStyle
  ): string {
    const key = this.getFontKey(requestedFamily, weight, style);
    if (this.registeredFonts.has(key)) return requestedFamily;
    if (
      this.registeredFonts.has(requestedFamily) ||
      this.systemFonts.has(requestedFamily)
    ) {
      return requestedFamily;
    }

    const lowerRequested = requestedFamily.toLowerCase();
    for (const registered of this.registeredFonts.keys()) {
      if (registered.toLowerCase().startsWith(lowerRequested)) {
        return registered.split("-")[0];
      }
    }

    const fallbacks = ["Arial", "Helvetica", "sans-serif"];
    for (const fallback of fallbacks) {
      if (this.systemFonts.has(fallback)) {
        logger.warn(
          `Font '${requestedFamily}' not found, using fallback: ${fallback}`
        );
        return fallback;
      }
    }

    logger.warn(
      `No suitable font found for '${requestedFamily}', using default`
    );
    return "Arial";
  }

  loadFontsFromDirectory(fontsDir: string): void {
    if (!fs.existsSync(fontsDir)) {
      logger.warn(`Fonts directory not found: ${fontsDir}`);
      return;
    }

    const supportedExtensions = [".ttf", ".otf", ".woff", ".woff2"];

    const fontFiles = fs.readdirSync(fontsDir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    });

    fontFiles.sort();

    for (const file of fontFiles) {
      const fullPath = path.join(fontsDir, file);
      const baseName = path.basename(file, path.extname(file));
      const lowerName = baseName.toLowerCase();

      let weight: FontWeight = "normal";
      let style: FontStyle = "normal";

      if (lowerName.includes("thin")) weight = "100";
      else if (lowerName.includes("extralight")) weight = "200";
      else if (lowerName.includes("light")) weight = "300";
      else if (lowerName.includes("regular")) weight = "400";
      else if (lowerName.includes("medium")) weight = "500";
      else if (lowerName.includes("semibold")) weight = "600";
      else if (lowerName.includes("bold")) weight = "700";
      else if (lowerName.includes("extrabold")) weight = "800";
      else if (lowerName.includes("black")) weight = "900";

      if (lowerName.includes("italic")) style = "italic";
      else if (lowerName.includes("oblique")) style = "oblique";

      const familyName = baseName
        .replace(
          /[-_](regular|bold|light|italic|medium|thin|black|semibold|extrabold|extralight|oblique|[0-9]+pt)/gi,
          ""
        )
        .trim();

      logger.debug("🎨 Font family name parsed", {
        baseName,
        familyName,
        style,
        weight,
      });

      this.registerCustomFont(fullPath, familyName, weight, style);
    }
  }

  getAvailableFonts(): string[] {
    const fonts = new Set<string>();
    for (const def of this.registeredFonts.values()) fonts.add(def.family);
    for (const family of this.systemFonts.keys()) fonts.add(family);
    return Array.from(fonts).sort();
  }

  cleanup(): void {
    try {
      this.registeredFonts.clear();
      this.systemFonts.clear();

      // Deregister all fonts from Canvas
      // WARNING: This may cause memory leaks in some versions of node-canvas
      // See: https://github.com/Automattic/node-canvas/issues/1974
      deregisterAllFonts();
      logger.log("🧹 Deregistered all Canvas fonts");

      logger.log("✅ FontManager cleanup completed");
    } catch (error) {
      logger.error("❌ FontManager cleanup failed:", error);
    }
  }
}

logger.info("🟡 Initializing FontManager and loading bundled fonts...");

const fontManager = FontManager.getInstance();
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const bundledFontsDir = path.join(
  isDev ? path.resolve(__dirname, "..", "..") : process.resourcesPath,
  "assets",
  "fonts"
);

if (fs.existsSync(bundledFontsDir)) {
  fontManager.loadFontsFromDirectory(bundledFontsDir);
  logger.info(`✅ Finished loading fonts from: ${bundledFontsDir}`);
} else {
  logger.warn(`⚠️ Bundled fonts directory does not exist: ${bundledFontsDir}`);
}

export default fontManager;

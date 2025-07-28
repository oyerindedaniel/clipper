import { ExportSettings } from "@/types/app";

export const DEFAULT_ASPECT_RATIO = "original";
export const DEFAULT_CROP_MODE = "letterbox";

export const DEFAULT_CLIP_PRE_MARK_MS = 10000;
export const DEFAULT_CLIP_POST_MARK_MS = 10000;
export const CLIP_BUFFER_MS = 3000;
export const WAIT_UNTIL_BUFFER_TIMEOUT_MS = 10000;

export const EXPORT_BITRATE_MAP: Record<
  ExportSettings["resolution"],
  Record<ExportSettings["fps"], { min: number; standard: number; high: number }>
> = {
  "720p": {
    24: { min: 2.5, standard: 5, high: 7 },
    30: { min: 2.5, standard: 5, high: 7 },
    60: { min: 4, standard: 7.5, high: 10 },
  },
  "1080p": {
    24: { min: 4, standard: 8, high: 12 },
    30: { min: 4, standard: 8, high: 12 },
    60: { min: 6, standard: 12, high: 15 },
  },
  "1440p": {
    24: { min: 10, standard: 16, high: 24 },
    30: { min: 10, standard: 16, high: 24 },
    60: { min: 16, standard: 24, high: 30 },
  },
  "4k": {
    24: { min: 25, standard: 35, high: 45 },
    30: { min: 25, standard: 35, high: 45 },
    60: { min: 35, standard: 53, high: 68 },
  },
};

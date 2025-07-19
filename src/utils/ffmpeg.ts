import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import logger from "./logger";

let ffmpeg: FFmpeg | null = null;

export const initFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = "/ffmpeg";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  return ffmpeg;
};

/**
 * Remuxes WebM chunks into a valid, playable WebM Blob between a time range.
 *
 * @param chunks - Array of WebM Blob parts.
 * @param startMs - Clip start time in ms.
 * @param endMs - Clip end time in ms.
 * @returns Promise resolving to a remuxed WebM Blob.
 */
export async function remuxClip(
  chunks: Blob[],
  startMs: number,
  endMs: number
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("remuxClip can only be called on the client side");
  }

  const ffmpeg = await initFFmpeg();

  logger.log("🧩 remuxClip: startMs =", startMs, "endMs =", endMs);

  const inputBlob = new Blob(chunks, { type: "video/webm" });
  const inputFileName = "input.webm";
  const outputFileName = "output.webm";

  // Write buffer to FFmpeg's FS
  ffmpeg.writeFile(inputFileName, await fetchFile(inputBlob));

  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = ((endMs - startMs) / 1000).toFixed(3);

  logger.log(
    `🔧 remuxClip: ffmpeg.exec with -ss ${startSec}, -t ${durationSec}`
  );

  await ffmpeg.exec([
    "-i",
    inputFileName,
    "-ss",
    startSec,
    "-t",
    durationSec,
    "-c",
    "copy",
    outputFileName,
  ]);

  logger.log("✅ remuxClip: ffmpeg.exec completed");

  const outputData = await ffmpeg.readFile(outputFileName);
  logger.log("📦 remuxClip: outputData length =", outputData.length);

  return new Blob([outputData], { type: "video/webm" });
}

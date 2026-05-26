import { browser } from "$app/environment";
import { getClientFfmpeg } from "./getClientFfmpeg";
import { buildPitchShiftFilter } from "./utils";

const SAMPLE_RATE = 24000;

export async function shiftPitch(
  wavBuffer: ArrayBuffer,
  semitones: number,
): Promise<ArrayBuffer> {
  if (semitones === 0) return wavBuffer;

  return browser
    ? shiftPitchClient(wavBuffer, semitones)
    : shiftPitchServer(wavBuffer, semitones);
}

async function shiftPitchClient(
  wavBuffer: ArrayBuffer,
  semitones: number,
): Promise<ArrayBuffer> {
  const ffmpeg = await getClientFfmpeg();
  const inputName = `input-${crypto.randomUUID()}.wav`;
  const outputName = `output-${crypto.randomUUID()}.wav`;

  ffmpeg.writeFile(inputName, new Uint8Array(wavBuffer));

  const filter = buildPitchShiftFilter(semitones, SAMPLE_RATE);
  await ffmpeg.exec(["-i", inputName, "-filter:a", filter, outputName]);

  const data = await ffmpeg.readFile(outputName, "binary");
  if (typeof data === "string") throw new Error("Expected binary data");
  return data.buffer as ArrayBuffer;
}

async function shiftPitchServer(
  wavBuffer: ArrayBuffer,
  semitones: number,
): Promise<ArrayBuffer> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const ffmpeg = (await import("fluent-ffmpeg")).default;

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input-${crypto.randomUUID()}.wav`);
  const outputPath = path.join(tmpDir, `output-${crypto.randomUUID()}.wav`);

  await fs.writeFile(inputPath, Buffer.from(wavBuffer));

  const filter = buildPitchShiftFilter(semitones, SAMPLE_RATE);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .noVideo()
      .audioFilters(filter)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  const data = await fs.readFile(outputPath);
  fs.unlink(inputPath).catch(() => {});
  fs.unlink(outputPath).catch(() => {});

  return new Uint8Array(data).buffer;
}

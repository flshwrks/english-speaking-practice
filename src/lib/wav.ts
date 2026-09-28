/** サーバー側の録音の検証（ブラウザの recorder.ts の toWav が作る 16kHz mono 16bit PCM の WAV） */
import { SAMPLE_RATE } from "./client/recorder";

export const WAV_HEADER = 44;

/** 指定秒数の WAV のバイト数（本文の大きさの上限に使う） */
export const wavBytes = (sec: number) => WAV_HEADER + sec * SAMPLE_RATE * 2;

/** toWav の形式なら音声の秒数、そうでなければ null */
export function wavSeconds(wav: Buffer) {
  const ok =
    wav.length > WAV_HEADER &&
    wav.toString("ascii", 0, 4) === "RIFF" &&
    wav.toString("ascii", 8, 12) === "WAVE" &&
    wav.readUInt16LE(20) === 1 &&
    wav.readUInt16LE(22) === 1 &&
    wav.readUInt32LE(24) === SAMPLE_RATE &&
    wav.readUInt16LE(34) === 16;
  return ok ? (wav.length - WAV_HEADER) / (SAMPLE_RATE * 2) : null;
}

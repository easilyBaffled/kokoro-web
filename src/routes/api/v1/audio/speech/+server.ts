import { json } from "@sveltejs/kit";
import zod from "zod";
import { fromError } from "zod-validation-error";
import type { RequestHandler } from "./$types";
import { generateVoice, parseVoiceFormula } from "$lib/shared/kokoro";
import {
  voicesIds,
  modelsIds,
  voicesMap,
  prosodyPresetIds,
  type VoiceId,
  type ModelId,
  type ProsodyPresetId,
} from "$lib/shared/resources";
import { authenticate } from "$lib/server/authenticate";

/**
 * @openapi
 * /api/v1/audio/speech:
 *   post:
 *     summary: Generate audio from the input text
 *     description: >
 *       This endpoint is compatible with the OpenAI API.
 *
 *
 *       Python Example:
 *
 *           from pathlib import Path
 *           from openai import OpenAI
 *
 *           client = OpenAI(
 *               base_url="http://localhost:5173/api/v1",
 *               api_key="no-key",
 *           )
 *
 *           speech_file_path = Path(__file__).parent / "speech.mp3"
 *           response = client.audio.speech.create(
 *               model="model_q8f16",
 *               voice="af_heart",
 *               input="Today is a wonderful day to build something people love!",
 *           )
 *
 *           response.stream_to_file(speech_file_path)
 *
 *       JavaScript Example:
 *
 *           import fs from "fs";
 *           import path from "path";
 *           import OpenAI from "openai";
 *
 *           const openai = new OpenAI({
 *             baseURL: "http://localhost:5173/api/v1",
 *             apiKey: "no-key",
 *           });
 *           const speechFile = path.resolve("./speech.mp3");
 *
 *           const mp3 = await openai.audio.speech.create({
 *             model: "model_q8f16",
 *             voice: "af_heart",
 *             input: "Today is a wonderful day to build something people love!",
 *           });
 *
 *           const buffer = Buffer.from(await mp3.arrayBuffer());
 *           await fs.promises.writeFile(speechFile, buffer);
 *
 *       Note about the **voice** (*voice formula*) field:
 *
 *           • This field is used to specify a synthesis formula.
 *           • It must follow the pattern: voice1*weight1 + voice2*weight2 + ... + voiceN*weightN.
 *           • Voice IDs must be one of those returned by the voices endpoint.
 *           • Each weight must be a number between 0 and 1, rounded to the nearest 0.1.
 *           • If a single voice is provided without an asterisk, it is assumed to have weight 1.
 *           • The language of the first voice in the formula is used for the phonemizer.
 *
 *     tags:
 *       - Speech
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *                 description: Model to use for the synthesis
 *               voice:
 *                 type: string
 *                 description: Voice formula to use for the synthesis
 *               input:
 *                 type: string
 *                 description: Input text to synthesize
 *               response_format:
 *                 type: string
 *                 enum: [mp3, wav]
 *                 default: mp3
 *                 description: Response format, either `mp3` or `wav`
 *               speed:
 *                 type: number
 *                 minimum: 0.25
 *                 maximum: 5
 *                 default: 1
 *                 description: Speed of the synthesis
 *     responses:
 *       200:
 *         description: Audio file with the synthesized speech
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message
 *             example:
 *               message: "Validation error ..."
 */

const schema = zod.object({
  model: zod.string().refine((val) => modelsIds.includes(val as ModelId), {
    message: `Model not found, use one of: ${modelsIds.join(", ")}`,
  }),
  voice: zod.string().refine(
    (val) => {
      try {
        const parsedVoices = parseVoiceFormula(val);
        return parsedVoices.every(({ voiceId }) =>
          voicesIds.includes(voiceId as VoiceId),
        );
      } catch (e) {
        return false;
      }
    },
    {
      message: `Invalid voice formula. Voice IDs must be one of: ${voicesIds.join(", ")} and follow the pattern voice*weight.`,
    },
  ),
  input: zod.string(),
  response_format: zod.enum(["mp3", "wav"]).default("mp3").optional(),
  speed: zod.number().min(0.25).max(5).default(1).optional(),
  prosody_preset: zod
    .enum(prosodyPresetIds as [ProsodyPresetId, ...ProsodyPresetId[]])
    .default("expressive")
    .optional(),
  pitch_shift: zod.number().min(-6).max(6).default(0).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    authenticate(request);
  } catch (e: any) {
    return json({ message: e.message }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return json(
      { message: fromError(parsed.error).toString() },
      { status: 400 },
    );
  }

  const { model, input, voice, speed, response_format, prosody_preset, pitch_shift } =
    parsed.data;

  // Find the language of the first voice of the formula
  const voices = parseVoiceFormula(voice);
  const firstVoiceId = voices[0].voiceId as VoiceId;
  const voiceFound = voicesMap[firstVoiceId] ?? voicesMap["af_alloy"];
  const lang = voiceFound.lang;

  try {
    const result = await generateVoice({
      text: input,
      lang: lang.id,
      voiceFormula: voice,
      model: model,
      speed: speed ?? 1,
      format: response_format ?? "mp3",
      acceleration: "cpu",
      prosodyPreset: prosody_preset,
      pitchShift: pitch_shift,
    });

    return new Response(result.buffer, {
      headers: {
        "Content-Type": result.mimeType,
      },
    });
  } catch (e: any) {
    return json({ message: e.message }, { status: 500 });
  }
};

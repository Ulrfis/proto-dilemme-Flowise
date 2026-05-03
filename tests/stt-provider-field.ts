/**
 * Integration test: /api/transcribe response must include `provider`.
 *
 * Creates an isolated Express app that wires the real route logic but
 * injects a stub STT provider so no real API credentials are required.
 * Sends a minimal multipart audio request and asserts the JSON response
 * contains a non-empty `provider` string.
 */

import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import { createServer } from "http";
import type { ISTTProvider } from "../server/providers/stt/types.js";

const STUB_PROVIDER_NAME = "stub-openai";

const stubProvider: ISTTProvider = {
  name: STUB_PROVIDER_NAME,
  isAvailable: () => true,
  transcribe: async () => ({ text: "bonjour le monde", language: "fr" }),
};

async function buildApp() {
  const app = express();
  const upload = multer({
    dest: "/tmp/",
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("audio/")) cb(null, true);
      else cb(new Error("Only audio files are allowed"));
    },
  });

  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    const provider = stubProvider;
    const audioBuffer = await fs.readFile(req.file.path);

    const result = await provider.transcribe({
      audio: audioBuffer,
      filename: req.file.originalname || "audio.webm",
      mimeType: req.file.mimetype,
      language: "fr",
    });

    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      text: result.text,
      language: result.language || "fr",
      provider: provider.name,
    });
  });

  return app;
}

async function run() {
  const app = await buildApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // Use Node 20 native globals (Blob, FormData, fetch)
    const audioBytes = Buffer.from("RIFF\x00\x00\x00\x00WAVE");
    const blob = new (globalThis as any).Blob([audioBytes], { type: "audio/wav" });

    const form = new (globalThis as any).FormData();
    form.append("audio", blob, "test.wav");

    const res = await (globalThis as any).fetch(
      `http://127.0.0.1:${port}/api/transcribe`,
      { method: "POST", body: form },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = (await res.json()) as Record<string, unknown>;

    if (typeof json.text !== "string" || json.text.length === 0) {
      throw new Error(`FAIL: response missing 'text'. Got: ${JSON.stringify(json)}`);
    }
    if (typeof json.provider !== "string" || json.provider.length === 0) {
      throw new Error(
        `FAIL: response missing 'provider'. Got: ${JSON.stringify(json)}`,
      );
    }
    if (json.provider !== STUB_PROVIDER_NAME) {
      throw new Error(
        `FAIL: expected provider="${STUB_PROVIDER_NAME}", got "${json.provider}"`,
      );
    }

    console.log(
      `PASS: /api/transcribe returned provider="${json.provider}", text="${json.text}"`,
    );
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

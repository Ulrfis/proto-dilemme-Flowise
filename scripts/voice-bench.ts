/* eslint-disable no-console */
/**
 * Voice provider benchmark — measures latency, byte size and round-trip
 * STT accuracy for the active voice providers. Designed to run against
 * the local Express server (`http://localhost:5000`).
 *
 * Usage:
 *   tsx scripts/voice-bench.ts [--out scripts/voice-bench-results.json]
 *
 * It cycles through TTS providers (`elevenlabs`, `openai`) and, for STT,
 * synthesises a reference clip with ElevenLabs (best French quality) then
 * transcribes it back through every available STT provider. Cost figures
 * use public per-character / per-minute prices recorded at eval time.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

interface SampleCase {
  id: string;
  label: string;
  text: string; // reference text used both as TTS input and as STT ground truth
}

interface TTSResult {
  caseId: string;
  provider: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  bytes: number;
  bytesPerChar?: number;
  error?: string;
}

interface STTResult {
  caseId: string;
  provider: string;
  refSource: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  expected: string;
  transcript: string;
  wer: number; // 0..1
  cer: number; // 0..1
  error?: string;
}

const BASE = process.env.BENCH_BASE_URL || "http://localhost:5000";
const OUTPUT = (() => {
  const idx = process.argv.indexOf("--out");
  return idx > 0 && process.argv[idx + 1]
    ? process.argv[idx + 1]
    : "scripts/voice-bench-results.json";
})();

// 8 short French samples representative of student/Peter interactions.
const SAMPLES: SampleCase[] = [
  {
    id: "s1-greeting",
    label: "Salut court",
    text: "Salut Peter ! Comment vas-tu aujourd'hui ?",
  },
  {
    id: "s2-question-courte",
    label: "Question courte",
    text: "Pourquoi le plastique est-il un problème pour les océans ?",
  },
  {
    id: "s3-reponse-info",
    label: "Réponse type information",
    text:
      "Chaque année, environ huit millions de tonnes de plastique finissent dans les mers du monde, soit l'équivalent d'un camion-benne déversé chaque minute.",
  },
  {
    id: "s4-question-ouverte",
    label: "Question ouverte (pédagogique)",
    text:
      "À ton avis, quelles habitudes du quotidien pourrais-tu changer pour réduire ta consommation de plastique à usage unique ?",
  },
  {
    id: "s5-acronymes",
    label: "Acronymes et chiffres",
    text:
      "Le PET, le PEHD et le PVC se recyclent différemment ; un sac plastique met entre 100 et 1000 ans à se dégrader.",
  },
  {
    id: "s6-noms-propres",
    label: "Noms propres et lieux",
    text:
      "Le 7e continent de plastique, situé entre Hawaï et la Californie, fait environ trois fois la taille de la France.",
  },
  {
    id: "s7-eleve-bafouille",
    label: "Phrase d'élève hésitant",
    text:
      "Euh… je pense que… enfin, je crois que recycler c'est bien, mais ça suffit pas vraiment non ?",
  },
  {
    id: "s8-message-long",
    label: "Message long (Peter expliquant)",
    text:
      "Lorsque le plastique se retrouve dans l'océan, il se fragmente sous l'effet du soleil et des vagues en minuscules morceaux appelés microplastiques. Ces particules sont ingérées par le plancton, puis par les poissons, et remontent toute la chaîne alimentaire jusqu'à notre assiette. C'est pour cela que la solution doit commencer en amont, par la réduction à la source.",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Cost tables (May 2026 public pricing)
// ────────────────────────────────────────────────────────────────────────────
const TTS_COST_PER_1K_CHARS_USD: Record<string, number> = {
  // OpenAI tts-1 : $15 / 1M chars  → $0.015 / 1K
  openai: 0.015,
  // ElevenLabs Multilingual v2 (Creator $22 / 100K = $0.22/1K) — production tier
  elevenlabs: 0.22,
};
const STT_COST_PER_MIN_USD: Record<string, number> = {
  // Whisper-1 = $0.006 / minute
  openai: 0.006,
  // ElevenLabs Scribe = $0.40 / hour ≈ $0.0067 / min
  elevenlabs: 0.0067,
  // Deepgram Nova-3 = $0.0043 / min (pay-as-you-go) – not measured here
  deepgram: 0.0043,
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      prev = tmp;
    }
  }
  return dp[n];
}

function wer(reference: string, hypothesis: string): number {
  const ref = normalize(reference).split(" ").filter(Boolean);
  const hyp = normalize(hypothesis).split(" ").filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

function cer(reference: string, hypothesis: string): number {
  const ref = normalize(reference).replace(/ /g, "").split("");
  const hyp = normalize(hypothesis).replace(/ /g, "").split("");
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  // Run the bench inline by overriding env vars on the *local server* via headers
  // is not possible — instead we override env on the bench process itself and
  // ask the server to use the requested provider through an HTTP override.
  // The /api/tts and /api/transcribe endpoints already read process.env at call
  // time, so we use a side-channel: a tiny override route would be ideal, but
  // to avoid touching production code we simply mutate env BEFORE spinning the
  // request — which works because we share the same process? We don't.
  // Practical workaround: use the dedicated bench endpoint added in routes.ts.
  return fn();
}

async function ttsRequest(provider: string, text: string): Promise<TTSResult> {
  const start = Date.now();
  const url = `${BASE}/api/_bench/tts`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, text }),
    });
    const elapsed = Date.now() - start;
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        caseId: "",
        provider,
        ok: false,
        status: resp.status,
        latencyMs: elapsed,
        bytes: 0,
        error: detail.slice(0, 200),
      };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      caseId: "",
      provider,
      ok: true,
      status: resp.status,
      latencyMs: elapsed,
      bytes: buf.length,
      bytesPerChar: buf.length / text.length,
    };
  } catch (e) {
    return {
      caseId: "",
      provider,
      ok: false,
      latencyMs: Date.now() - start,
      bytes: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function getReferenceAudio(
  text: string,
  source: "elevenlabs" | "openai" = "elevenlabs",
): Promise<{ audio: Buffer; mime: string } | null> {
  const start = Date.now();
  const resp = await fetch(`${BASE}/api/_bench/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: source, text }),
  });
  if (!resp.ok) {
    console.error(`Reference audio (${source}) generation failed: ${resp.status}`);
    return null;
  }
  const audio = Buffer.from(await resp.arrayBuffer());
  console.log(
    `  reference[${source}] audio (${audio.length} bytes) generated in ${Date.now() - start}ms`,
  );
  return { audio, mime: resp.headers.get("content-type") || "audio/mpeg" };
}

async function sttRequest(
  provider: string,
  refSource: string,
  audio: Buffer,
  mime: string,
  filename: string,
  expected: string,
): Promise<STTResult> {
  const start = Date.now();
  const form = new FormData();
  form.append("provider", provider);
  form.append("audio", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  try {
    const resp = await fetch(`${BASE}/api/_bench/transcribe`, {
      method: "POST",
      body: form,
    });
    const elapsed = Date.now() - start;
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        caseId: "",
        provider,
        refSource,
        ok: false,
        status: resp.status,
        latencyMs: elapsed,
        expected,
        transcript: "",
        wer: 1,
        cer: 1,
        error: detail.slice(0, 200),
      };
    }
    const data = (await resp.json()) as { text?: string };
    const transcript = data.text || "";
    return {
      caseId: "",
      provider,
      refSource,
      ok: true,
      status: resp.status,
      latencyMs: elapsed,
      expected,
      transcript,
      wer: wer(expected, transcript),
      cer: cer(expected, transcript),
    };
  } catch (e) {
    return {
      caseId: "",
      provider,
      refSource,
      ok: false,
      latencyMs: Date.now() - start,
      expected,
      transcript: "",
      wer: 1,
      cer: 1,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Run
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▶ Voice bench — server=${BASE}, samples=${SAMPLES.length}`);

  // Discover available providers
  const providersResp = await fetch(`${BASE}/api/providers`).then((r) => r.json());
  console.log("Active providers:", providersResp);
  const availableTTS: string[] = (providersResp.tts?.available || []).filter(
    (p: string) => p !== "none",
  );
  const availableSTT: string[] = providersResp.stt?.available || [];

  console.log(`TTS to bench: ${availableTTS.join(", ")}`);
  console.log(`STT to bench: ${availableSTT.join(", ")}`);

  const ttsResults: TTSResult[] = [];
  const sttResults: STTResult[] = [];

  // ── TTS ────────────────────────────────────────────────────────────────
  for (const sample of SAMPLES) {
    console.log(`\n[TTS] ${sample.id} — "${sample.text.slice(0, 60)}…"`);
    for (const provider of availableTTS) {
      const r = await ttsRequest(provider, sample.text);
      r.caseId = sample.id;
      ttsResults.push(r);
      console.log(
        `  • ${provider.padEnd(10)} ${r.ok ? "OK" : "ERR"}  ${r.latencyMs}ms  ${r.bytes}B  ${
          r.error ? `(${r.error})` : ""
        }`,
      );
    }
  }

  // ── STT (with reference audio from each available TTS provider) ────────
  // Using two reference sources removes the synthetic-voice bias (a STT engine
  // tends to do best when transcribing audio synthesised by the same family).
  const refSources = availableTTS.filter((p) => p === "elevenlabs" || p === "openai");
  for (const sample of SAMPLES) {
    console.log(`\n[STT] ${sample.id} — generating reference clips…`);
    for (const refSource of refSources) {
      const ref = await getReferenceAudio(sample.text, refSource as "elevenlabs" | "openai");
      if (!ref) continue;
      for (const provider of availableSTT) {
        const r = await sttRequest(
          provider,
          refSource,
          ref.audio,
          ref.mime,
          `${sample.id}-${refSource}.mp3`,
          sample.text,
        );
        r.caseId = sample.id;
        sttResults.push(r);
        console.log(
          `  • [${refSource}→${provider.padEnd(10)}] ${r.ok ? "OK" : "ERR"}  ${r.latencyMs}ms  WER=${(r.wer * 100).toFixed(1)}%  CER=${(r.cer * 100).toFixed(1)}%  "${r.transcript.slice(0, 70)}"`,
        );
      }
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────
  function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, n) => s + n, 0) / arr.length;
  }

  const ttsSummary = availableTTS.map((p) => {
    const rows = ttsResults.filter((r) => r.provider === p && r.ok);
    const totalChars = SAMPLES.reduce((s, c) => s + c.text.length, 0);
    return {
      provider: p,
      samples: rows.length,
      avgLatencyMs: Math.round(avg(rows.map((r) => r.latencyMs))),
      p95LatencyMs: rows.length
        ? rows.sort((a, b) => a.latencyMs - b.latencyMs)[
            Math.min(rows.length - 1, Math.floor(rows.length * 0.95))
          ].latencyMs
        : 0,
      avgBytes: Math.round(avg(rows.map((r) => r.bytes))),
      bytesPerChar: Number(avg(rows.map((r) => r.bytesPerChar || 0)).toFixed(2)),
      costPer1KCharsUSD: TTS_COST_PER_1K_CHARS_USD[p] ?? null,
      estimatedCostPerMessageUSD: TTS_COST_PER_1K_CHARS_USD[p]
        ? Number(((totalChars / SAMPLES.length / 1000) * TTS_COST_PER_1K_CHARS_USD[p]).toFixed(5))
        : null,
    };
  });

  const sttSummary: Array<Record<string, unknown>> = [];
  for (const p of availableSTT) {
    const allRows = sttResults.filter((r) => r.provider === p && r.ok);
    sttSummary.push({
      provider: p,
      refSource: "ALL",
      samples: allRows.length,
      avgLatencyMs: Math.round(avg(allRows.map((r) => r.latencyMs))),
      p95LatencyMs: allRows.length
        ? allRows.sort((a, b) => a.latencyMs - b.latencyMs)[
            Math.min(allRows.length - 1, Math.floor(allRows.length * 0.95))
          ].latencyMs
        : 0,
      avgWerPct: Number((avg(allRows.map((r) => r.wer)) * 100).toFixed(2)),
      avgCerPct: Number((avg(allRows.map((r) => r.cer)) * 100).toFixed(2)),
      perfectTranscripts: allRows.filter((r) => r.wer === 0).length,
      costPerMinUSD: STT_COST_PER_MIN_USD[p] ?? null,
    });
    // Per-refSource breakdown to expose synthetic-voice bias
    const sources = Array.from(new Set(allRows.map((r) => r.refSource)));
    for (const src of sources) {
      const rows = allRows.filter((r) => r.refSource === src);
      sttSummary.push({
        provider: p,
        refSource: src,
        samples: rows.length,
        avgLatencyMs: Math.round(avg(rows.map((r) => r.latencyMs))),
        avgWerPct: Number((avg(rows.map((r) => r.wer)) * 100).toFixed(2)),
        avgCerPct: Number((avg(rows.map((r) => r.cer)) * 100).toFixed(2)),
        perfectTranscripts: rows.filter((r) => r.wer === 0).length,
      });
    }
  }

  const out = {
    runAt: new Date().toISOString(),
    base: BASE,
    samples: SAMPLES,
    tts: { results: ttsResults, summary: ttsSummary },
    stt: { results: sttResults, summary: sttSummary },
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`\n✔ Wrote ${OUTPUT}`);
  console.log("\n=== TTS SUMMARY ===");
  console.table(ttsSummary);
  console.log("\n=== STT SUMMARY ===");
  console.table(sttSummary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

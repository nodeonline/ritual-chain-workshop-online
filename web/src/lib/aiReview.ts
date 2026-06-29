import { hexToString } from "viem";

export type RankingEntry = {
  index: number;
  score: number;
  reason: string;
};

export type JudgeResult = {
  winnerIndex: number;
  ranking: RankingEntry[];
  summary: string;
};

export type DecodedAiReview = {
  /** Raw decoded text (UTF-8 best-effort) of the on-chain `aiReview` bytes. */
  raw: string;
  /** Parsed judge result, or null if the bytes weren't parseable JSON. */
  parsed: JudgeResult | null;
};

const EMPTY_BYTES = new Set(["", "0x"]);

/**
 * Decode the on-chain `aiReview` bytes into text and, when possible, a parsed
 * judge result.
 *
 * The contract stores the model's response bytes. We try to read them as UTF-8,
 * strip any stray markdown fences, pull out the first JSON object, and parse it
 * into the `{ winnerIndex, ranking, summary }` shape. If anything fails we still
 * return the raw text so the UI can show it verbatim.
 */
export function decodeAiReview(aiReviewHex?: string): DecodedAiReview | null {
  if (!aiReviewHex || EMPTY_BYTES.has(aiReviewHex)) return null;

  let raw: string;
  try {
    raw = hexToString(aiReviewHex as `0x${string}`);
  } catch {
    // Not valid UTF-8 bytes — surface the hex itself.
    raw = aiReviewHex;
  }

  const parsed = tryParseJudgeResult(raw);
  return { raw, parsed };
}

function tryParseJudgeResult(text: string): JudgeResult | null {
  const candidates = [
    extractJson(text),
    text.match(/\{[\s\S]*\}/)?.[0] ?? null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const parsed = parseJudgeCandidate(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function parseJudgeCandidate(candidate: string): JudgeResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const winnerIndexValue = o.winnerIndex ?? o.winner_index;
  const winnerIndex =
    typeof winnerIndexValue === "number" ? winnerIndexValue : Number(winnerIndexValue);
  if (!Number.isInteger(winnerIndex)) return null;

  const ranking: RankingEntry[] = Array.isArray(o.ranking)
    ? (o.ranking as unknown[])
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const e = r as Record<string, unknown>;
          const indexValue = e.index ?? e.submissionIndex ?? e.submission_index;
          const scoreValue = e.score ?? e.value;
          const index = typeof indexValue === "number" ? indexValue : Number(indexValue);
          const score = typeof scoreValue === "number" ? scoreValue : Number(scoreValue);
          if (!Number.isInteger(index) || !Number.isFinite(score)) return null;
          return {
            index,
            score,
            reason: typeof e.reason === "string" ? e.reason : String(e.reason ?? ""),
          } satisfies RankingEntry;
        })
        .filter((r): r is RankingEntry => r !== null)
    : [];

  return {
    winnerIndex,
    ranking,
    summary:
      typeof o.summary === "string"
        ? o.summary
        : typeof o.overallSummary === "string"
          ? o.overallSummary
          : "",
  };
}

/** Strip markdown fences and isolate the first balanced JSON object. */
function extractJson(text: string): string | null {
  let t = text.trim();
  // Remove ```json ... ``` fences if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }

  return null;
}

export type RevealedAnswerItem = {
  index: number;
  answer: string;
  submitter?: string;
};

export type RevealedAnswersBundle = {
  winnerIndex: number;
  ranking?: Array<{ index: number; score: number; reason?: string }>;
  summary?: string;
  revealedAnswers?: RevealedAnswerItem[];
};

function toFetchUrl(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  return null;
}

export async function fetchRevealedAnswersBundle(ref: string): Promise<RevealedAnswersBundle | null> {
  const url = toFetchUrl(ref);
  if (!url) return null;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as unknown;
  if (!data || typeof data !== "object") return null;

  const bundle = data as Partial<RevealedAnswersBundle> & Record<string, unknown>;
  const winnerIndex =
    typeof bundle.winnerIndex === "number" ? bundle.winnerIndex : Number(bundle.winnerIndex);
  if (!Number.isInteger(winnerIndex)) return null;

  const revealedAnswers = Array.isArray(bundle.revealedAnswers)
    ? bundle.revealedAnswers
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const o = item as Record<string, unknown>;
          const index = typeof o.index === "number" ? o.index : Number(o.index);
          const answer = typeof o.answer === "string" ? o.answer : "";
          const submitter = typeof o.submitter === "string" ? o.submitter : undefined;
          if (!Number.isInteger(index) || !answer) return null;
          return { index, answer, submitter } satisfies RevealedAnswerItem;
        })
        .filter((item): item is RevealedAnswerItem => item !== null)
    : undefined;

  return {
    winnerIndex,
    ranking: Array.isArray(bundle.ranking)
      ? (bundle.ranking as RevealedAnswersBundle["ranking"])
      : undefined,
    summary: typeof bundle.summary === "string" ? bundle.summary : undefined,
    revealedAnswers,
  };
}

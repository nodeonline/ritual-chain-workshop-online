import { encrypt, ECIES_CONFIG } from "eciesjs";
import type { Hex } from "viem";

ECIES_CONFIG.symmetricNonceLength = 12;

export function buildEncryptedSubmissionBlob(
  executorPublicKey: Hex,
  submissionIndex: number,
  answer: string,
): `0x${string}` {
  const payload = JSON.stringify({ [`SUBMISSION_${submissionIndex}`]: answer });
  const encrypted = encrypt(executorPublicKey.slice(2), Buffer.from(payload));
  return `0x${Buffer.from(encrypted).toString("hex")}`;
}

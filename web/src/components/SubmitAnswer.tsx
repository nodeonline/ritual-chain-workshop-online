"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canSubmit, type Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import { fetchLlmExecutorService } from "@/lib/ritualLlm";
import { buildEncryptedSubmissionBlob } from "@/lib/ritualSecrets";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  TxStatus,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const [answer, setAnswer] = useState("");
  const [salt, setSalt] = useState("");
  const now = useNow();
  const tx = useWriteTx(() => {
    setAnswer("");
    setSalt("");
    onSubmitted();
  });

  // Submission window closed — nothing to show.
  if (!canSubmit(bounty, now)) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !address) return;
    try {
      const trimmedAnswer = answer.trim();
      const submissionSalt = salt.trim() || randomSalt();
      const commitment = keccak256(
        encodeAbiParameters(parseAbiParameters("string, bytes32, address, uint256"), [
          trimmedAnswer,
          submissionSalt as `0x${string}`,
          address,
          bountyId,
        ]),
      );
      if (!bounty.isPrivate) {
        persistRevealDraft(bountyId, address, {
          answer: trimmedAnswer,
          salt: submissionSalt as `0x${string}`,
          submitter: address,
          commitment,
        });
      }

      if (bounty.isPrivate) {
        if (!publicClient) return;
        const executor = await fetchLlmExecutorService(publicClient);
        const encryptedAnswer = buildEncryptedSubmissionBlob(
          executor.publicKey,
          Number(bounty.submissionCount),
          trimmedAnswer,
        );

        await tx.run({
          address: contractAddress,
          abi: aiJudgeAbi,
          functionName: "submitEncryptedCommitment",
          args: [bountyId, commitment, encryptedAnswer],
          chainId: ritualChain.id,
        });
        return;
      }

      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title={bounty.isPrivate ? "Submit an encrypted answer" : "Submit an answer"}
        subtitle={
          bounty.isPrivate
            ? "Encrypted in the browser and kept hidden until TEE batch judging completes."
            : "Open until the deadline. One entry, judged against the rubric."
        }
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Your answer">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Write your submission…"
            />
          </Field>
          <Field label="Salt" hint="Optional; generated automatically when left blank.">
            <Input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="0x..."
            />
          </Field>
          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy
              ? "Submitting…"
              : bounty.isPrivate
                ? "Submit encrypted answer"
                : "Submit answer"}
          </Button>
          {!isConnected && (
            <p className="text-xs text-zinc-500">
              Connect your wallet to submit.
            </p>
          )}
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}

function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function persistRevealDraft(
  bountyId: bigint,
  submitter: `0x${string}`,
  draft: {
    answer: string;
    salt: `0x${string}`;
    submitter: `0x${string}`;
    commitment: `0x${string}`;
  },
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `ai-judge-reveal:${bountyId.toString()}:${submitter.toLowerCase()}`,
    JSON.stringify(draft),
  );
}

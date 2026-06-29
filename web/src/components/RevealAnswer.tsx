"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { type Bounty, getBountyStatus } from "@/lib/bounty";
import { useNow } from "@/hooks/useNow";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  Notice,
  TxStatus,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

type RevealDraft = {
  answer: string;
  salt: `0x${string}`;
  submitter: `0x${string}`;
  commitment: `0x${string}`;
};

export function RevealAnswer({
  bountyId,
  bounty,
  onRevealed,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onRevealed: () => void;
}) {
  const { isConnected } = useAccount();
  const { address } = useAccount();
  const now = useNow();
  const [answer, setAnswer] = useState("");
  const [salt, setSalt] = useState("");
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const tx = useWriteTx(() => {
    if (address) {
      clearRevealDraft(bountyId, address);
    }
    setHasStoredDraft(false);
    setAnswer("");
    setSalt("");
    onRevealed();
  });

  const readyToReveal =
    !bounty.isPrivate &&
    getBountyStatus(bounty, now) !== "open" &&
    !bounty.judged &&
    !bounty.finalized;

  useEffect(() => {
    if (!readyToReveal) return;
    const timer = window.setTimeout(() => {
      if (!address) {
        setAnswer("");
        setSalt("");
        setHasStoredDraft(false);
        return;
      }

      const draft = loadRevealDraft(bountyId, address);
      if (!draft) {
        setAnswer("");
        setSalt("");
        setHasStoredDraft(false);
        return;
      }

      setAnswer((current) => current || draft.answer);
      setSalt((current) => current || draft.salt);
      setHasStoredDraft(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [bountyId, address, readyToReveal]);

  if (!readyToReveal) return null;

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress || !answer.trim() || !salt.trim()) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, answer.trim(), salt.trim() as `0x${string}`],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Reveal your answer"
        subtitle="Public bounties require the original answer and salt after the deadline."
      />
      <CardBody>
        <form onSubmit={handleReveal} className="space-y-3">
          {hasStoredDraft && (
            <Notice tone="indigo">
              Loaded your saved answer and salt from this browser.
            </Notice>
          )}
          <Field label="Original answer">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Paste the exact answer used for the commitment."
            />
          </Field>
          <Field label="Original salt">
            <Input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="0x..."
            />
          </Field>
          <Button
            type="submit"
            disabled={
              !isConnected ||
              !answer.trim() ||
              !salt.trim() ||
              tx.isBusy
            }
            className="w-full"
          >
            {tx.isBusy ? "Revealing…" : "Reveal answer"}
          </Button>
          {!isConnected && (
            <p className="text-xs text-zinc-500">Connect your wallet to reveal.</p>
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

function storageKey(bountyId: bigint, submitter?: string) {
  return submitter
    ? `ai-judge-reveal:${bountyId.toString()}:${submitter.toLowerCase()}`
    : `ai-judge-reveal:${bountyId.toString()}`;
}

function loadRevealDraft(
  bountyId: bigint,
  submitter?: string,
): RevealDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(bountyId, submitter));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RevealDraft;
  } catch {
    return null;
  }
}

function clearRevealDraft(bountyId: bigint, submitter?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(bountyId, submitter));
}

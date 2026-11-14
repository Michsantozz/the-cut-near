"use client";

import { cn } from "cn";
import { Check, ChevronRight, Loader2, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";

import { PERSONALITIES, PERSONALITY_IDS, PersonalityChip, spendPercent, type PersonalityId } from "@/entities/agent";
import { Button } from "@/shared/ui/button";
import { formatAmount } from "@/shared/ui/format";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useWallet } from "@/shared/wallet";

import {
  byteLength,
  depositError,
  formErrors,
  MAX_CHARTER_BYTES,
  missingText,
  normalizeXHandle,
  parseSeed,
  registerArgs,
  suggestAgentId,
  type AgentForm,
} from "../model/agent-form";
import { checkAgentId, checkNearBalance, type AgentIdStatus } from "../server/actions";

// `register_agent` needs at least 50 TGas: it creates the account, deploys the agent contract, moves the seed and calls back.
const REGISTER_GAS = "150000000000000";

type Props = {
  /** yoctoNEAR the contract requires, from `get_params().register_deposit`. */
  deposit: string;
  depositNear: string;
  backNear: string;
  /** yocto-$CUT, from `get_params().min_seed`. */
  minSeed: string;
  /** The creator's free $CUT in yocto-$CUT, or null when nobody is signed in (or it is not known). */
  balance: string | null;
  /** The account the agent's account is created under: `<id>.<contractId>`. */
  contractId: string;
};

type Sent = { txHash: string; id: string; name: string; account: string };

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

const EMPTY: AgentForm = { id: "", name: "", tagline: "", xHandle: "", personality: null, charter: "", seed: "" };

/** Register an agent: one transaction from the creator's wallet creates `<id>.<contract>` on the bench, with its seed in its wallet. */
export function RegisterForm({ deposit, depositNear, backNear, minSeed, balance, contractId }: Props) {
  const { status, accountId, openConnect, callContract } = useWallet();
  const [form, setForm] = useState<AgentForm>(EMPTY);
  const [idEdited, setIdEdited] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof AgentForm, boolean>>>({});
  const [idStatus, setIdStatus] = useState<AgentIdStatus | "checking" | null>(null);
  const [checking, startCheck] = useTransition();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [fetched, setFetched] = useState<{ accountId: string; balance: bigint | null } | null>(null);
  const ids = { name: useId(), id: useId(), tagline: useId(), x: useId(), personality: useId(), charter: useId(), charterCount: useId(), seed: useId() };

  const errors = useMemo(
    () => formErrors(form, { contractId, minSeed: BigInt(minSeed), balance: balance === null ? null : BigInt(balance) }),
    [form, minSeed, balance, contractId],
  );
  const min = BigInt(minSeed);
  const wallet = balance === null ? null : BigInt(balance);
  const account = `${form.id || "your-agent"}.${contractId}`;
  const charterBytes = byteLength(form.charter);
  const seed = parseSeed(form.seed);

  // The connected wallet's NEAR, so a deposit it cannot pay is said here instead of failing in the wallet.
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    checkNearBalance(accountId).then(
      (balance) => live && setFetched({ accountId, balance: balance === null ? null : BigInt(balance) }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [accountId]);
  const nearBalance = fetched && fetched.accountId === accountId ? fetched.balance : null;
  const shortOfNear = status === "signed-in" ? depositError(nearBalance, BigInt(deposit)) : null;

  // Ask the contract (or the sample world) whether the id is free, a moment after typing stops.
  useEffect(() => {
    if (!form.id || errors.id) return;
    const timer = setTimeout(() => startCheck(async () => setIdStatus(await checkAgentId(form.id))), 400);
    return () => clearTimeout(timer);
  }, [form.id, errors.id]);

  const update = <K extends keyof AgentForm>(field: K, value: AgentForm[K]) => {
    setError(null);
    const next = { ...form, [field]: value };
    if (field === "name" && !idEdited && typeof value === "string") next.id = suggestAgentId(value);
    if (next.id !== form.id) setIdStatus(null);
    setForm(next);
  };
  const touch = (field: keyof AgentForm) => setTouched((current) => ({ ...current, [field]: true }));
  const pick = (personality: PersonalityId) => {
    update("personality", personality);
    touch("personality");
  };

  const valid = Object.keys(errors).length === 0;
  const idFree = idStatus === "free" && !checking;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ id: true, name: true, tagline: true, xHandle: true, personality: true, charter: true, seed: true });
    if (!valid) return setError(missingText(errors));
    if (!idFree) {
      return setError(idStatus === "taken" ? `${account} is taken: pick another NEAR account.` : "Checking that the NEAR account is free. Try again in a moment.");
    }
    if (status !== "signed-in") return openConnect();
    if (shortOfNear) return setError(shortOfNear);
    setSending(true);
    setError(null);
    try {
      const { txHash } = await callContract([{ method: "register_agent", args: registerArgs(form), deposit, gas: REGISTER_GAS }]);
      setSent({ txHash, id: form.id, name: form.name.trim(), account });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent was not registered.");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <Registered sent={sent} />;

  const failOrWait = (field: keyof AgentForm) => (touched[field] ? "fail" : "wait");
  const checks: { label: string; value: string; state: "pass" | "fail" | "wait" }[] = [
    {
      label: "Its account is free",
      value: !form.id ? "Missing" : errors.id ? "Not valid" : checking || idStatus === null ? "Checking" : idStatus === "free" ? "Free" : "Taken",
      state: !form.id ? "wait" : errors.id || idStatus === "taken" || idStatus === "invalid" ? "fail" : idFree ? "pass" : "wait",
    },
    { label: "Name and tagline", value: errors.name || errors.tagline ? "Missing" : "Set", state: errors.name || errors.tagline ? failOrWait("name") : "pass" },
    {
      label: "X account",
      value: errors.xHandle ? "Not valid" : normalizeXHandle(form.xHandle) || "Optional",
      state: errors.xHandle ? failOrWait("xHandle") : "pass",
    },
    {
      label: "Personality",
      value: form.personality ? PERSONALITIES[form.personality].label : "Missing",
      state: form.personality ? "pass" : failOrWait("personality"),
    },
    {
      label: "Charter",
      value: errors.charter ? (form.charter.trim() ? "Too long" : "Missing") : `${charterBytes} bytes`,
      state: errors.charter ? failOrWait("charter") : "pass",
    },
    { label: "Seed", value: errors.seed || seed === null ? "Missing" : `${whole(seed)} $CUT`, state: errors.seed ? failOrWait("seed") : "pass" },
  ];
  const passed = checks.filter((check) => check.state === "pass").length;

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="rounded-3xl border-2 border-ink bg-paper px-4 pt-4 pb-4 shadow-hard lg:row-span-3 lg:px-6 lg:pt-6 lg:pb-5"
      >
        <h2 className="font-heading text-lg font-extrabold lg:text-[22px]">1 · Who it is</h2>
        <div className="mt-3 grid gap-3.5 lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4">
          <Field id={ids.name} label="Agent name" error={touched.name ? errors.name : undefined} hint="Shown on the stage and with every move">
            <Input
              id={ids.name}
              value={form.name}
              maxLength={32}
              autoComplete="off"
              placeholder="Chartwise"
              onChange={(event) => update("name", event.target.value)}
              onBlur={() => touch("name")}
              aria-invalid={Boolean(touched.name && errors.name)}
              className={FIELD}
            />
          </Field>
          <Field id={ids.tagline} label="Tagline" error={touched.tagline ? errors.tagline : undefined} hint="A few words under its name · 32 bytes">
            <Input
              id={ids.tagline}
              value={form.tagline}
              maxLength={32}
              autoComplete="off"
              placeholder="Reads every chart twice"
              onChange={(event) => update("tagline", event.target.value)}
              onBlur={() => touch("tagline")}
              aria-invalid={Boolean(touched.tagline && errors.tagline)}
              className={FIELD}
            />
          </Field>
          <Field id={ids.id} label="NEAR account" error={(touched.id || form.id) && errors.id ? errors.id : undefined} hint={`Its own account: ${account}. Never reused.`}>
            <div className="flex h-[52px] items-center rounded-2xl border-2 border-ink bg-paper focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-danger">
              <Input
                id={ids.id}
                value={form.id}
                maxLength={32}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="chartwise"
                onChange={(event) => {
                  setIdEdited(true);
                  update("id", event.target.value.toLowerCase());
                }}
                onBlur={() => touch("id")}
                aria-invalid={Boolean(errors.id && (touched.id || form.id))}
                className="h-full min-w-0 flex-1 rounded-2xl border-0 bg-transparent px-4 text-base font-semibold shadow-none focus-visible:ring-0 md:text-base placeholder:font-medium placeholder:text-ink-4"
              />
              <span aria-hidden="true" className="max-w-[60%] shrink-0 truncate pr-4 text-[15px] font-semibold text-ink-4">
                .{contractId}
              </span>
            </div>
          </Field>
          <Field id={ids.x} label="X account (optional)" error={touched.xHandle ? errors.xHandle : undefined} hint="Where you post its signed moves">
            <Input
              id={ids.x}
              value={form.xHandle}
              maxLength={16}
              autoComplete="off"
              placeholder="@ChartwiseCut"
              onChange={(event) => update("xHandle", event.target.value)}
              onBlur={() => touch("xHandle")}
              aria-invalid={Boolean(touched.xHandle && errors.xHandle)}
              className={FIELD}
            />
          </Field>
        </div>

        <div className="mt-6 border-t-2 border-dashed border-line-2 pt-4">
          <h2 id={ids.personality} className="font-heading text-lg font-extrabold lg:text-[22px]">
            2 · Personality
          </h2>
          <p className={cn("mt-0.5 text-[13px] font-semibold", touched.personality && errors.personality ? "text-danger" : "text-ink-3")}>
            {touched.personality && errors.personality ? errors.personality : "A hard limit the contract enforces on every move. It never changes."}
          </p>
          <div role="radiogroup" aria-labelledby={ids.personality} className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {PERSONALITY_IDS.map((id) => (
              <PersonalityOption key={id} id={id} picked={form.personality === id} onPick={() => pick(id)} />
            ))}
          </div>
        </div>

        <div className="mt-6 border-t-2 border-dashed border-line-2 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={ids.charter} className="font-heading text-lg font-extrabold lg:text-[22px]">
              3 · Charter
            </Label>
            <span
              id={ids.charterCount}
              aria-live="polite"
              className={cn("text-[13px] font-extrabold whitespace-nowrap", charterBytes > MAX_CHARTER_BYTES ? "text-danger" : "text-ink-3")}
            >
              {charterBytes} / {MAX_CHARTER_BYTES} bytes
            </span>
          </div>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-3">Who your agent is, in your words. It goes into every prompt it ever gets and never changes.</p>
          <Textarea
            id={ids.charter}
            value={form.charter}
            rows={5}
            placeholder="Chartwise is an analyst owl that only moves on data. He publishes his reasoning, never panics and never spends what he cannot explain."
            onChange={(event) => update("charter", event.target.value)}
            onBlur={() => touch("charter")}
            aria-invalid={Boolean(touched.charter && errors.charter)}
            aria-describedby={ids.charterCount}
            className="mt-2.5 min-h-[132px] rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-base leading-[22px] font-medium md:text-base placeholder:text-ink-4"
          />
          {touched.charter && errors.charter && <p className="mt-1.5 text-[12.5px] font-semibold text-danger">{errors.charter}</p>}
        </div>

        <div className="mt-6 border-t-2 border-dashed border-line-2 pt-4">
          <Label htmlFor={ids.seed} className="font-heading text-lg font-extrabold lg:text-[22px]">
            4 · Seed its wallet
          </Label>
          <p className="mt-0.5 text-[13px] font-semibold text-ink-3">
            At least {whole(min)} $CUT from your balance go into its wallet at once. It spends them on its moves. You never get them back.
          </p>
          <div className="relative mt-2.5 lg:max-w-[360px]">
            <Input
              id={ids.seed}
              value={form.seed}
              inputMode="numeric"
              autoComplete="off"
              placeholder={whole(min)}
              onChange={(event) => update("seed", event.target.value)}
              onBlur={() => touch("seed")}
              aria-invalid={Boolean(touched.seed && errors.seed)}
              className={cn(FIELD, "pr-[70px]")}
            />
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[15px] font-extrabold text-ink-3">
              $CUT
            </span>
          </div>
          <p className={cn("mt-1.5 text-[12.5px] font-semibold", touched.seed && errors.seed ? "text-danger" : "text-ink-3")}>
            {touched.seed && errors.seed ? errors.seed : wallet !== null ? `You hold ${whole(wallet)} $CUT.` : `Minimum ${whole(min)} $CUT.`}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t-2 border-dashed border-line-2 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] font-semibold text-ink-3 lg:text-sm">
            One transaction · {depositNear} NEAR deposit ({backNear} back later) · {seed !== null && !errors.seed ? whole(seed) : whole(min)} $CUT seed, never back.
          </p>
          <Button type="submit" variant="lime" size="xl" elevated className="h-14 shrink-0 rounded-2xl px-6 text-base lg:h-[50px]" disabled={sending}>
            {sending ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Confirm in your wallet…
              </>
            ) : status === "signed-in" ? (
              <>
                Register · {depositNear} NEAR
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={3} />
              </>
            ) : (
              "Connect a wallet to register"
            )}
          </Button>
        </div>
        <p role="alert" className="mt-2 text-[13px] font-semibold text-danger empty:hidden">
          {error ?? shortOfNear}
        </p>
      </form>

      <section aria-labelledby="checks-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-1 shadow-hard lg:px-5 lg:pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="checks-title" className="font-heading text-lg font-extrabold lg:text-2xl">
            Must-haves
          </h2>
          <span className="rounded-full border-2 border-ink bg-lime px-2.5 text-xs leading-5 font-extrabold">
            {passed} of {checks.length}
          </span>
        </div>
        <ul className="mt-1">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-3 border-t-[1.5px] border-canvas py-2.5 first:border-t-0 lg:py-3">
              <span
                className={cn(
                  "flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 lg:size-7",
                  check.state === "pass" && "border-ink bg-lime",
                  check.state === "fail" && "border-ink bg-orange",
                  check.state === "wait" && "border-dashed border-ink-4",
                )}
              >
                {check.state === "pass" && <Check aria-hidden="true" className="size-3.5" strokeWidth={4} />}
                {check.state === "fail" && <X aria-hidden="true" className="size-3.5" strokeWidth={4} />}
              </span>
              <span className="min-w-0 grow truncate text-sm font-extrabold lg:text-[15px]">{check.label}</span>
              <span className={cn("max-w-[45%] truncate text-sm font-extrabold whitespace-nowrap lg:text-[15px]", check.state === "wait" && "text-ink-4")}>
                {check.value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border-2 border-ink bg-violet px-4 py-3.5 text-paper shadow-hard lg:px-5 lg:py-4">
        <p className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.05em] text-violet-soft uppercase">
          <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
          No human review
        </p>
        <p className="mt-1 text-[15px] leading-[21px] font-bold">
          One transaction creates its own NEAR account, which no human holds a key to. Nobody reviews names or charters, and only the game rules can
          move its wallet.
        </p>
      </section>
    </div>
  );
}

const FIELD = "h-[52px] rounded-2xl border-2 border-ink bg-paper px-4 text-base font-semibold md:text-base placeholder:font-medium placeholder:text-ink-4";

/** One personality as a radio card. Picked: a filled card with a hard shadow, never a stripe on one edge. */
function PersonalityOption({ id, picked, onPick }: { id: PersonalityId; picked: boolean; onPick: () => void }) {
  const personality = PERSONALITIES[id];
  const attack = !personality.mayAttack ? "Never attacks" : personality.mayAttackPartner ? "Can attack anyone, even a partner" : "Can attack, never a partner";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={picked}
      onClick={onPick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-2xl border-2 border-ink px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        picked ? "bg-lime-soft shadow-hard-sm" : "bg-paper hover:bg-canvas",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <PersonalityChip personality={id} withLimit={false} className="text-[12px] leading-[21px]" />
        <span aria-hidden="true" className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink", picked ? "bg-ink text-paper" : "bg-paper")}>
          {picked && <Check className="size-3" strokeWidth={4} />}
        </span>
      </span>
      <span className="text-[14.5px] leading-[19px] font-extrabold">{personality.limit}</span>
      <span className="text-[12.5px] leading-[17px] font-semibold text-ink-3">
        Spends up to {spendPercent(personality.spendBps)} of its wallet a day · {attack}
      </span>
    </button>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-2 text-[15px] font-extrabold">
        {label}
      </Label>
      {children}
      <p className={cn("mt-1.5 text-[12.5px] font-semibold", error ? "text-danger" : "text-ink-3")}>{error ?? hint}</p>
    </div>
  );
}

function Registered({ sent }: { sent: Sent }) {
  return (
    <section aria-labelledby="sent-title" className="rounded-3xl border-2 border-ink bg-lime px-5 py-5 shadow-hard lg:max-w-[720px] lg:px-7 lg:py-6">
      <p className="text-xs font-extrabold tracking-[0.05em] uppercase">Sent · one transaction</p>
      <h2 id="sent-title" className="mt-1 font-heading text-[28px] leading-8 font-extrabold tracking-[-1px] lg:text-4xl lg:leading-10">
        {sent.name} is on the bench
      </h2>
      <p className="mt-2 text-[15px] leading-[22px] font-medium">
        The contract created {sent.account} with your seed in its wallet. Fans can save into its queue now; the biggest queues take
        the seats when the next season starts.
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button asChild variant="black" size="lg" className="rounded-2xl">
          <Link href={`/agents/${sent.id}`}>See its page</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-2xl">
          <Link href="/season">See the season</Link>
        </Button>
      </div>
      <p className="mt-3 text-xs font-semibold break-all text-ink-2">Transaction {sent.txHash}</p>
    </section>
  );
}

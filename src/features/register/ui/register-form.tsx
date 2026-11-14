"use client";

import { cn } from "cn";
import { Check, ChevronRight, Loader2, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";

import { publicEnv } from "@/shared/config/public";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useWallet } from "@/shared/wallet";

import { formErrors, normalizeXHandle, registerArgs, ROBOT_KINDS, suggestRobotId, type RobotForm } from "../model/robot-form";
import { checkRobotId, type RobotIdStatus } from "../server/actions";

// `register_robot` needs at least 50 TGas: it creates the account, deploys the robot contract and calls back.
const REGISTER_GAS = "150000000000000";

type Props = {
  /** yoctoNEAR the contract requires, from `get_params().register_deposit`. */
  deposit: string;
  depositNear: string;
  backNear: string;
};

type Sent = { txHash: string; id: string; name: string };

/** Register a robot: one transaction from the creator's wallet creates `<id>.<contract>` on the bench. */
export function RegisterForm({ deposit, depositNear, backNear }: Props) {
  const { status, openConnect, callContract } = useWallet();
  const [form, setForm] = useState<RobotForm>({ id: "", name: "", kind: "", xHandle: "" });
  const [idEdited, setIdEdited] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof RobotForm, boolean>>>({});
  const [idStatus, setIdStatus] = useState<RobotIdStatus | "checking" | null>(null);
  const [checking, startCheck] = useTransition();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const ids = { name: useId(), id: useId(), kind: useId(), x: useId(), kinds: useId() };

  const errors = useMemo(() => formErrors(form, publicEnv.contractId), [form]);
  const account = `${form.id || "your-robot"}.${publicEnv.contractId}`;

  // Ask the contract (or the sample day) whether the id is free, a moment after typing stops.
  useEffect(() => {
    if (!form.id || errors.id) return;
    const timer = setTimeout(() => startCheck(async () => setIdStatus(await checkRobotId(form.id))), 400);
    return () => clearTimeout(timer);
  }, [form.id, errors.id]);

  const update = (field: keyof RobotForm, value: string) => {
    setError(null);
    const next = { ...form, [field]: value };
    if (field === "name" && !idEdited) next.id = suggestRobotId(value);
    if (next.id !== form.id) setIdStatus(null);
    setForm(next);
  };

  const valid = Object.keys(errors).length === 0;
  const idFree = idStatus === "free" && !checking;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ id: true, name: true, kind: true, xHandle: true });
    if (!valid || !idFree) return;
    if (status !== "signed-in") return openConnect();
    setSending(true);
    setError(null);
    try {
      const { txHash } = await callContract([{ method: "register_robot", args: registerArgs(form), deposit, gas: REGISTER_GAS }]);
      setSent({ txHash, id: form.id, name: form.name.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The robot was not registered.");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <Registered sent={sent} />;

  const checks: { label: string; value: string; state: "pass" | "fail" | "wait" }[] = [
    {
      label: `${account} is free`,
      value: !form.id ? "Missing" : errors.id ? "Not valid" : checking || idStatus === null ? "Checking" : idStatus === "free" ? "Free" : "Taken",
      state: !form.id ? "wait" : errors.id || idStatus === "taken" || idStatus === "invalid" ? "fail" : idFree ? "pass" : "wait",
    },
    { label: "Name and kind", value: errors.name || errors.kind ? "Missing" : "Set", state: errors.name || errors.kind ? (touched.name ? "fail" : "wait") : "pass" },
    { label: "X account", value: errors.xHandle ? "Missing" : normalizeXHandle(form.xHandle), state: errors.xHandle ? (touched.xHandle ? "fail" : "wait") : "pass" },
  ];
  const passed = checks.filter((check) => check.state === "pass").length;

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="rounded-3xl border-2 border-ink bg-paper px-4 pt-4 pb-4 shadow-hard lg:row-span-2 lg:px-6 lg:pt-6 lg:pb-5"
      >
        <div className="grid gap-3.5 lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4">
          <Field id={ids.name} label="Robot name" error={touched.name ? errors.name : undefined} hint="Shown on the lineup and in every post">
            <Input
              id={ids.name}
              value={form.name}
              maxLength={32}
              autoComplete="off"
              placeholder="Chartwise"
              onChange={(event) => update("name", event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, name: true }))}
              aria-invalid={Boolean(touched.name && errors.name)}
              className={FIELD}
            />
          </Field>
          <Field id={ids.kind} label="Kind" error={touched.kind ? errors.kind : undefined} hint="Shown under its name on the lineup">
            <Input
              id={ids.kind}
              list={ids.kinds}
              value={form.kind}
              maxLength={32}
              autoComplete="off"
              placeholder="AI analyst"
              onChange={(event) => update("kind", event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, kind: true }))}
              aria-invalid={Boolean(touched.kind && errors.kind)}
              className={FIELD}
            />
            <datalist id={ids.kinds}>
              {ROBOT_KINDS.map((kind) => (
                <option key={kind} value={kind} />
              ))}
            </datalist>
          </Field>
          <Field id={ids.id} label="NEAR account" error={(touched.id || form.id) && errors.id ? errors.id : undefined} hint={`Its NEAR account: ${account}. Never reused.`}>
            <div className="relative">
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
                onBlur={() => setTouched((current) => ({ ...current, id: true }))}
                aria-invalid={Boolean(errors.id && (touched.id || form.id))}
                className={cn(FIELD, "pr-[130px]")}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[15px] font-semibold text-ink-4">
                .{publicEnv.contractId}
              </span>
            </div>
          </Field>
          <Field id={ids.x} label="X account" error={touched.xHandle ? errors.xHandle : undefined} hint="Where the robot posts, signed by NEAR AI">
            <Input
              id={ids.x}
              value={form.xHandle}
              maxLength={16}
              autoComplete="off"
              placeholder="@ChartwiseCut"
              onChange={(event) => update("xHandle", event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, xHandle: true }))}
              aria-invalid={Boolean(touched.xHandle && errors.xHandle)}
              className={FIELD}
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t-2 border-dashed border-line-2 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] font-semibold text-ink-3 lg:text-sm">
            One transaction · {depositNear} NEAR deposit, {backNear} back when it leaves.
          </p>
          <Button type="submit" variant="lime" size="xl" elevated className="h-14 rounded-2xl px-6 text-base lg:h-[50px]" disabled={sending}>
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
          {error}
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
            <li key={check.label} className="flex items-center gap-3 border-t-[1.5px] border-canvas py-2.5 first:border-t-0 lg:py-3.5">
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
              <span className={cn("text-sm font-extrabold whitespace-nowrap lg:text-[15px]", check.state === "wait" && "text-ink-4")}>{check.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border-2 border-ink bg-violet px-4 py-3.5 text-paper shadow-hard lg:px-5 lg:py-4">
        <p className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.05em] text-violet-soft uppercase">
          <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
          No human review
        </p>
        <p className="mt-1 text-[15px] leading-[21px] font-bold">One transaction creates its own NEAR account, which no human holds a key to. It starts on the bench.</p>
      </section>
    </div>
  );
}

const FIELD = "h-[52px] rounded-2xl border-2 border-ink bg-paper px-4 text-base font-semibold md:text-base placeholder:font-medium placeholder:text-ink-4";

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
        {sent.id}.{publicEnv.contractId} is created by the contract. Fans can save into its queue now; the biggest queue takes the next empty seat.
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Button asChild variant="black" size="lg" className="rounded-2xl">
          <Link href={`/robots/${sent.id}`}>See its page</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-2xl">
          <Link href="/">See the lineup</Link>
        </Button>
      </div>
      <p className="mt-3 text-xs font-semibold break-all text-ink-2">Transaction {sent.txHash}</p>
    </section>
  );
}

import { connection } from "next/server";
import { Suspense } from "react";

import { getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { RegisterScreen } from "@/features/register";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Register a robot · The Cut" };

// For creators: register a robot with one transaction (5 NEAR deposit). The contract checks everything.
export default function CreatorsPage() {
  return (
    <>
      <AppHeader title="Register a robot" sub="For creators · the contract checks everything, no human review" />
      <Suspense fallback={<Skeleton className="mx-5 mt-3 h-[520px] rounded-3xl bg-paper lg:mx-8" />}>
        <Register />
      </Suspense>
    </>
  );
}

async function Register() {
  await connection();
  const [params, nextCut] = await Promise.all([getParams(), getNextCut()]);
  return <RegisterScreen registerDeposit={params.registerDeposit} robotFunding={params.robotFunding} cutAt={nextCut.at} />;
}

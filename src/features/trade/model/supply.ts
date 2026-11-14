// Where all the $CUT are (the Value screen): saved in piles, free, burned. Parts add up to the launch supply.

export type SupplySplit = { launch: bigint; saved: bigint; free: bigint; burned: bigint };

/** `saved` is what sits in stage piles; everything not saved and not burned is free. */
export function splitSupply({ launch, current, saved }: { launch: bigint; current: bigint; saved: bigint }): SupplySplit {
  const burned = launch > current ? launch - current : 0n;
  const kept = saved < current ? saved : current;
  return { launch, saved: kept, free: current - kept, burned };
}

/**
 * Exact mirror of PayrailRouter's pricing math (contracts/contracts/PayrailRouter.sol).
 *
 * The router is a self-contained x·y=k pool over (token0, token1) with an input fee:
 *   amountInAfterFee = amountIn * (10000 - feeBps) / 10000   (floor)
 *   amountOut       = reserve1 * amountInAfterFee / (reserve0 + amountInAfterFee) (floor)
 *
 * BigInt flooring matches Solidity's uint256 division exactly.
 */

export const FEE_DENOM = 10_000n;

/** Output for an exact input, mirroring the contract. */
export function outputForExactInput(
  reserve0: bigint,
  reserve1: bigint,
  amountIn: bigint,
  feeBps: bigint,
): bigint {
  const amountInAfterFee = (amountIn * (FEE_DENOM - feeBps)) / FEE_DENOM;
  return (reserve1 * amountInAfterFee) / (reserve0 + amountInAfterFee);
}

/**
 * Smallest amountIn such that the contract's output is >= amountOut.
 * Returns null when the pool cannot pay amountOut (reserve1 exhausted or fee >= 100%).
 */
export function inputForExactOutput(
  reserve0: bigint,
  reserve1: bigint,
  amountOut: bigint,
  feeBps: bigint,
): bigint | null {
  if (amountOut <= 0n || feeBps >= FEE_DENOM || reserve1 <= amountOut) return null;
  // inAfter = ceil(reserve0 * amountOut / (reserve1 - amountOut))
  const num = reserve0 * amountOut;
  const den = reserve1 - amountOut;
  const inAfter = num / den + (num % den === 0n ? 0n : 1n);
  // amountIn = ceil(inAfter * 10000 / (10000 - fee))
  const den2 = FEE_DENOM - feeBps;
  const num2 = inAfter * FEE_DENOM;
  return num2 / den2 + (num2 % den2 === 0n ? 0n : 1n);
}

/** Basis-point price impact of an exact-input trade vs a straight-line move. */
export function priceImpactBps(
  reserve0: bigint,
  reserve1: bigint,
  amountIn: bigint,
  feeBps: bigint,
): number {
  const amountInAfterFee = (amountIn * (FEE_DENOM - feeBps)) / FEE_DENOM;
  if (reserve0 <= 0n || reserve1 <= 0n || amountInAfterFee <= 0n) return 0;
  const straightLine = (reserve1 * amountInAfterFee) / reserve0; // no-price-degradation output
  const actual = (reserve1 * amountInAfterFee) / (reserve0 + amountInAfterFee);
  if (straightLine <= actual) return 0;
  const impact = FEE_DENOM - (actual * FEE_DENOM) / straightLine;
  return Number(impact > 10_000n ? 10_000n : impact);
}

/** Input fee in input-token base units for an exact-input trade. */
export function inputFee(amountIn: bigint, feeBps: bigint): bigint {
  return (amountIn * feeBps) / FEE_DENOM;
}
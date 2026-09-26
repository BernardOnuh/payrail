import { expect } from "chai";
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import type { PayrailRouter, MockERC20, MockERC20Veto } from "../typechain-types";

/* eslint-disable @typescript-eslint/no-explicit-any -- contract factories + signers are loosely typed here */
type AnyFactory = { deploy(...args: unknown[]): Promise<any> };
const H = hre.ethers as any;
const factory = (name: string): Promise<AnyFactory> => H.getContractFactory(name) as Promise<AnyFactory>;
const signers = (): Promise<any[]> => H.getSigners() as Promise<any[]>;

const FEE_BPS = 30n;

/** Exact mirror of the router's pricing formula (and api/liquidity TS source). */
function quoteOut(reserve0: bigint, reserve1: bigint, amountIn: bigint, feeBps: bigint): bigint {
  const amountInAfterFee = (amountIn * (10_000n - feeBps)) / 10_000n;
  return (reserve1 * amountInAfterFee) / (reserve0 + amountInAfterFee);
}

async function deployFixture() {
  const [owner, payer, recipient1, recipient2, outsider]: any[] = await signers();
  const Mock = await factory("MockERC20");
  const usdc = (await Mock.deploy(6n)) as MockERC20;
  const eurc = (await Mock.deploy(6n)) as MockERC20;

  const lower = BigInt(await usdc.getAddress()) < BigInt(await eurc.getAddress());
  const token0 = lower ? usdc : eurc;
  const token1 = lower ? eurc : usdc;

  const Router = await factory("PayrailRouter");
  const router = (await Router.deploy(await token0.getAddress(), await token1.getAddress(), FEE_BPS)) as PayrailRouter;

  const SEED0 = 2_000_000n; // 2.0 USDC
  const SEED1 = 1_760_000n; // 1.76 EURC (rate ~0.88)
  await token0.mint(owner.address, SEED0);
  await token1.mint(owner.address, SEED1);
  await token0.connect(owner).approve(await router.getAddress(), SEED0);
  await token1.connect(owner).approve(await router.getAddress(), SEED1);
  await router.connect(owner).seedPool(SEED0, SEED1);

  return { router, usdc, eurc, token0, token1, owner, payer, recipient1, recipient2, outsider, SEED0, SEED1 };
}

describe("PayrailRouter", () => {
  describe("deployment + seed", () => {
    it("stores pair and fee, enforces sorted order", async () => {
      const f = await deployFixture();
      expect(await f.router.token0()).to.equal(await f.token0.getAddress());
      expect(await f.router.token1()).to.equal(await f.token1.getAddress());
      expect(await f.router.feeBps()).to.equal(FEE_BPS);
      expect(await f.router.owner()).to.equal(f.owner.address);
      const [r0, r1] = await f.router.getReserves();
      expect(r0).to.equal(f.SEED0);
      expect(r1).to.equal(f.SEED1);
      expect(await f.router.seeded()).to.equal(true);
      expect(await f.router.swapCount()).to.equal(0n);
    });

    it("cannot seed twice or by a non-owner", async () => {
      const f = await deployFixture();
      await expect(f.router.connect(f.outsider).seedPool(1n, 1n)).to.be.revertedWithCustomError(f.router, "Unauthorized");
      await expect(f.router.connect(f.owner).seedPool(1n, 1n)).to.be.revertedWithCustomError(f.router, "AlreadySeeded");
    });
  });

  describe("batchTransfer", () => {
    it("pulls the exact total then forwards atomic per-recipient transfers", async () => {
      const f = await deployFixture();
      const router = await f.router.getAddress();
      const a1 = 123_456n;
      const a2 = 654_321n;
      await f.token0.mint(f.payer.address, a1 + a2);
      await f.token0.connect(f.payer).approve(router, a1 + a2);

      const b0 = await f.token0.balanceOf(f.recipient1.address);
      const b1 = await f.token0.balanceOf(f.recipient2.address);
      await expect(
        f.router.connect(f.payer).batchTransfer(await f.token0.getAddress(), [
          { to: f.recipient1.address, amount: a1 },
          { to: f.recipient2.address, amount: a2 },
        ]),
      ).to.emit(f.router, "BatchTransferred");

      expect(await f.token0.balanceOf(f.recipient1.address)).to.equal(b0 + a1);
      expect(await f.token0.balanceOf(f.recipient2.address)).to.equal(b1 + a2);
      expect(await f.token0.balanceOf(f.payer.address)).to.equal(0n);
    });

    it("reverts on missing allowance (pull fails atomically)", async () => {
      const f = await deployFixture();
      await f.token0.mint(f.payer.address, 100n);
      await expect(
        f.router.connect(f.payer).batchTransfer(await f.token0.getAddress(), [{ to: f.recipient1.address, amount: 100n }]),
      ).to.be.revertedWithCustomError(f.router, "PullFailed");
    });

    it("reverts on zero total", async () => {
      const f = await deployFixture();
      await expect(
        f.router.connect(f.payer).batchTransfer(await f.token0.getAddress(), [{ to: f.recipient1.address, amount: 0n }]),
      ).to.be.revertedWithCustomError(f.router, "ZeroAmount");
    });
  });

  describe("swapExactIn", () => {
    it("computes the exact constant-product output with input fee", async () => {
      const f = await deployFixture();
      const router = await f.router.getAddress();
      const amountIn = 500_000n; // 0.5 USDC
      await f.token0.mint(f.payer.address, amountIn);
      await f.token0.connect(f.payer).approve(router, amountIn);

      const out = quoteOut(f.SEED0, f.SEED1, amountIn, FEE_BPS);
      const beforeEurc = await f.token1.balanceOf(f.recipient1.address);
      const beforeUsdc = await f.token0.balanceOf(f.payer.address);

      await expect(f.router.connect(f.payer).swapExactIn(amountIn, out, f.recipient1.address))
        .to.emit(f.router, "Swap")
        .withArgs(f.payer.address, amountIn, out, FEE_BPS, f.SEED0 + amountIn, f.SEED1 - out);

      expect(await f.token1.balanceOf(f.recipient1.address)).to.equal(beforeEurc + out);
      expect(await f.token0.balanceOf(f.payer.address)).to.equal(beforeUsdc - amountIn);
      const [r0, r1] = await f.router.getReserves();
      expect(r0).to.equal(f.SEED0 + amountIn);
      expect(r1).to.equal(f.SEED1 - out);
      expect(await f.router.swapCount()).to.equal(1n);
    });

    it("reverts below minAmountOut (slippage protection)", async () => {
      const f = await deployFixture();
      const router = await f.router.getAddress();
      const amountIn = 500_000n;
      const out = quoteOut(f.SEED0, f.SEED1, amountIn, FEE_BPS);
      await f.token0.mint(f.payer.address, amountIn);
      await f.token0.connect(f.payer).approve(router, amountIn);
      await expect(f.router.connect(f.payer).swapExactIn(amountIn, out + 1n, f.recipient1.address)).to.be.revertedWithCustomError(
        f.router,
        "SlippageExceeded",
      );
    });

    it("credits the caller when recipient is zero address", async () => {
      const f = await deployFixture();
      const router = await f.router.getAddress();
      const amountIn = 100_000n;
      const out = quoteOut(f.SEED0, f.SEED1, amountIn, FEE_BPS);
      await f.token0.mint(f.payer.address, amountIn);
      await f.token0.connect(f.payer).approve(router, amountIn);
      await f.router.connect(f.payer).swapExactIn(amountIn, 1n, "0x0000000000000000000000000000000000000000");
      expect(await f.token1.balanceOf(f.payer.address)).to.equal(out);
    });

    it("reverts before seed", async () => {
      const [, payer]: any[] = await signers();
      const Mock = await factory("MockERC20");
      const a = (await Mock.deploy(6n)) as MockERC20;
      const b = (await Mock.deploy(6n)) as MockERC20;
      const t0 = BigInt(await a.getAddress()) < BigInt(await b.getAddress()) ? a : b;
      const Router = await factory("PayrailRouter");
      const router = (await Router.deploy(await t0.getAddress(), t0 === a ? b.target : a.target, FEE_BPS)) as PayrailRouter;
      await a.mint(payer.address, 100n);
      await a.connect(payer).approve(await router.getAddress(), 100n);
      await expect(router.connect(payer).swapExactIn(100n, 1n, payer.address)).to.be.revertedWithCustomError(router, "ZeroReserve");
    });

    it("reverts entirely if a mid-list transfer fails (atomicity)", async () => {
      const [owner, payer, r1, r2]: any[] = await signers();
      const Mock = await factory("MockERC20Veto");
      const MockPlain = await factory("MockERC20");
      const veto = (await Mock.deploy(6n)) as MockERC20Veto;
      const plain = (await Mock.deploy(6n)) as MockERC20;
      void MockPlain;
      const [token0, token1] = [veto, plain].sort((x, y) => (BigInt(x.target as string) < BigInt(y.target as string) ? -1 : 1));
      const Router = await factory("PayrailRouter");
      const router = (await Router.deploy(await token0.getAddress(), await token1.getAddress(), FEE_BPS)) as PayrailRouter;
      await veto.mint(payer.address, 1000n);
      await veto.connect(payer).approve(await router.getAddress(), 1000n);
      await veto.blockAddress(r2.address);
      await expect(
        router.connect(payer).batchTransfer(await veto.getAddress(), [
          { to: r1.address, amount: 500n },
          { to: r2.address, amount: 500n },
        ]),
      ).to.be.revertedWithCustomError(router, "TransferFailed");
      expect(await veto.balanceOf(r1.address)).to.equal(0n);
      expect(await veto.balanceOf(payer.address)).to.equal(1000n);
      void owner;
    });
  });
});
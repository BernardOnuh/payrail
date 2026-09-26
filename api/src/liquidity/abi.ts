/**
 * PayrailRouter ABI (contracts/contracts/PayrailRouter.sol), lifted to keep the
 * API package self-contained. Keep in sync with contracts/export/PayrailRouter.json
 * (the artifacts package is the deploy-time source of truth).
 */

export const payrailRouterAbi = [
  {
    type: "event",
    name: "BatchTransferred",
    anonymous: false,
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "payer", type: "address" },
      { indexed: false, name: "total", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PoolSeeded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "seeder", type: "address" },
      { indexed: false, name: "amount0", type: "uint256" },
      { indexed: false, name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Swap",
    anonymous: false,
    inputs: [
      { indexed: true, name: "payer", type: "address" },
      { indexed: false, name: "amountIn", type: "uint256" },
      { indexed: false, name: "amountOut", type: "uint256" },
      { indexed: false, name: "feeBps", type: "uint256" },
      { indexed: false, name: "reserve0", type: "uint256" },
      { indexed: false, name: "reserve1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "batchTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      {
        name: "payments",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint256" },
      { name: "reserve1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "lastSwapAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "rescue",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "seedPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    outputs: [
      { name: "r0", type: "uint256" },
      { name: "r1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "seeded",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "swapCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapExactIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
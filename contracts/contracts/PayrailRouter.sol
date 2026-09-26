// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PayrailRouter
 * @notice Non-custodial payout router for Arc stablecoin payouts.
 *
 * Three execution models, all PULL-based (caller signs one tx per step; the
 * router never holds keys):
 *
 *  1. batchTransfer(address token, Recipient[])  — one ordered ERC-20 batch
 *     transfer. Single transferFrom of the exact total then N transfers.
 *  2. swapExactIn(uint amountIn, uint minAmountOut, address recipient) —
 *     exact-in swap against the router's own two-sided constant-product pool
 *     (x*y=k, fee taken on input). Pulls token0 from caller, pays token1.
 *
 * The router is deployed per currency pair (e.g. USDC/EURC). The initial pool
 * reserves are seeded exactly once by the owner. On mainnet the product swaps
 * through Uniswap v4; this self-contained pool exists so TESTNET (which has no
 * v4 pools) can exercise the full batch-payout + swap flow deterministically.
 *
 * Amounts are 6-decimal ERC-20 base units for USDC (native coin satisfies the
 * ERC-20 interface at 0x3600..0000); see docs/RECON.md for the two-decimal-view
 * note. Native gas is a separate 18-decimal asset and must never be mixed in.
 */
contract PayrailRouter {
    struct Recipient {
        address to;
        uint256 amount;
    }

    address public immutable owner;
    address public immutable token0;
    address public immutable token1;
    /// Input fee in basis points (30 = 0.30%).
    uint256 public immutable feeBps;

    uint256 private reserve0;
    uint256 private reserve1;

    bool public seeded;
    uint64 public swapCount;
    uint256 public lastSwapAt;

    event BatchTransferred(address indexed token, address indexed payer, uint256 total);
    event PoolSeeded(address indexed seeder, uint256 amount0, uint256 amount1);
    event Swap(address indexed payer, uint256 amountIn, uint256 amountOut, uint256 feeBps, uint256 reserve0, uint256 reserve1);

    error Unauthorized();
    error AlreadySeeded();
    error ZeroAmount();
    error ZeroReserve();
    error UnsupportedToken(address token);
    error DecimalsUnsupported(uint256 decimals);
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);
    error NativeGasNotAccepted();

    error TransferFailed();
    error PullFailed();

    /// @param _token0 lower-sorted pool token (e.g. USDC 0x3600..0000)
    /// @param _token1 higher-sorted pool token (e.g. EURC)
    /// @param _feeBps input fee basis points
    constructor(address _token0, address _token1, uint256 _feeBps) {
        require(_token0 != address(0) && _token1 != address(0), "zero token");
        require(_token0 < _token1, "tokens must be sorted");
        require(_feeBps < 10_000, "fee must be < 100%");
        owner = msg.sender;
        token0 = _token0;
        token1 = _token1;
        feeBps = _feeBps;
    }

    /// Owner seeds the pool exactly once. Amounts in ERC-20 base units.
    function seedPool(uint256 amount0, uint256 amount1) external returns (uint256 r0, uint256 r1) {
        if (msg.sender != owner) revert Unauthorized();
        if (seeded) revert AlreadySeeded();
        if (amount0 == 0 || amount1 == 0) revert ZeroAmount();
        _pull(token0, msg.sender, amount0);
        _pull(token1, msg.sender, amount1);
        reserve0 = amount0;
        reserve1 = amount1;
        seeded = true;
        emit PoolSeeded(msg.sender, amount0, amount1);
        return (reserve0, reserve1);
    }

    /// One ordered batch transfer. Pulls the exact total from the caller first.
    /// Reverts entirely on any transfer failure (atomic).
    function batchTransfer(address token, Recipient[] calldata recipients) external returns (uint256 total) {
        uint256 n = recipients.length;
        for (uint256 i = 0; i < n; i++) {
            total += recipients[i].amount;
        }
        if (total == 0) revert ZeroAmount();
        _pull(token, msg.sender, total);
        for (uint256 i = 0; i < n; i++) {
            Recipient calldata r = recipients[i];
            if (r.amount == 0) continue;
            _transfer(token, r.to, r.amount);
        }
        emit BatchTransferred(token, msg.sender, total);
    }

    /// Exact-in swap, token0 -> token1. Credits `recipient` (0 -> caller).
    /// Mirrors the pricing in api/src/liquidity/sources/payrailRouter.ts exactly.
    function swapExactIn(uint256 amountIn, uint256 minAmountOut, address recipient) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (reserve0 == 0 || reserve1 == 0) revert ZeroReserve();
        uint256 amountInAfterFee = (amountIn * (10_000 - feeBps)) / 10_000;
        amountOut = (reserve1 * amountInAfterFee) / (reserve0 + amountInAfterFee);
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);
        _pull(token0, msg.sender, amountIn);
        reserve0 += amountIn;
        reserve1 -= amountOut;
        if (recipient == address(0)) recipient = msg.sender;
        _transfer(token1, recipient, amountOut);
        swapCount += 1;
        lastSwapAt = block.timestamp;
        emit Swap(msg.sender, amountIn, amountOut, feeBps, reserve0, reserve1);
    }

    function getPair() external view returns (address, address) {
        return (token0, token1);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    /// Owner-only sweep of accidental direct transfers of the pool tokens.
    function rescue(address token, address to, uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        _transfer(token, to, amount);
    }

    receive() external payable {
        revert NativeGasNotAccepted();
    }

    function _pull(address token, address from, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert PullFailed();
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}
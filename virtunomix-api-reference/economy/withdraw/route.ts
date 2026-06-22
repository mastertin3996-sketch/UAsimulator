import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayoutMethod } from "@/generated/prisma/client";
import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_WITHDRAWAL_PC = 100;            // 100 PC minimum
const PC_TO_USD         = 0.01;          // 1 PC = $0.01  →  100 PC = $1
const MAX_PENDING       = 1;             // max concurrent PENDING requests per user

const PAYOUT_VALIDATORS: Record<PayoutMethod, RegExp> = {
  USDT_TRC20: /^T[A-Za-z1-9]{33}$/,         // Tron address
  USDT_ERC20: /^0x[a-fA-F0-9]{40}$/,         // Ethereum address
  PAYPAL    : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, // email
};

// ─── POST /api/economy/withdraw ───────────────────────────────────────────────
//
// Security measures:
//  1. Session required (proxy enforces, handler double-checks)
//  2. Balance read & deduction inside ONE atomic transaction → no race condition
//  3. Unique idempotency key tied to (userId + amountPC + timestamp) prevents
//     replay if the client retries on network error
//  4. Max 1 PENDING request per user at a time (duplicate protection)
//  5. All amounts validated server-side; payoutAddress validated by regex
//  6. Audit trail: WithdrawalRequest row IS the financial log for PC operations

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { amountPC, payoutMethod, payoutAddress } =
    body as { amountPC?: unknown; payoutMethod?: unknown; payoutAddress?: unknown };

  if (typeof amountPC !== "number" || !Number.isFinite(amountPC) || amountPC <= 0) {
    return NextResponse.json({ error: "amountPC must be a positive number" }, { status: 400 });
  }
  if (amountPC < MIN_WITHDRAWAL_PC) {
    return NextResponse.json(
      { error: `Мінімальна сума виведення: ${MIN_WITHDRAWAL_PC} PC ($${(MIN_WITHDRAWAL_PC * PC_TO_USD).toFixed(2)})` },
      { status: 400 },
    );
  }
  // Round to 8 decimal places to prevent floating-point tricks
  const safeAmountPC = Math.round(amountPC * 1e8) / 1e8;

  const validMethods = Object.values(PayoutMethod) as string[];
  if (!payoutMethod || !validMethods.includes(payoutMethod as string)) {
    return NextResponse.json(
      { error: `Невідомий спосіб виведення. Допустимі: ${validMethods.join(", ")}` },
      { status: 400 },
    );
  }
  const method = payoutMethod as PayoutMethod;

  if (typeof payoutAddress !== "string" || payoutAddress.trim().length === 0) {
    return NextResponse.json({ error: "payoutAddress є обов'язковим" }, { status: 400 });
  }
  const address = payoutAddress.trim();
  if (!PAYOUT_VALIDATORS[method].test(address)) {
    return NextResponse.json(
      { error: `Невірний формат адреси для ${method}` },
      { status: 400 },
    );
  }

  // Idempotency key — prevents duplicate if client retries within the same second
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${userId}:${safeAmountPC}:${method}:${address}:${Math.floor(Date.now() / 5000)}`)
    .digest("hex");

  // ── Atomic transaction: check balance, check duplicates, deduct, create record ──
  try {
    const result = await prisma.$transaction(async (tx) => {

      // 1. Read current wallet INSIDE transaction (prevents TOCTOU race)
      const wallet = await tx.userWallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }
      const currentPC = Number(wallet.premiumCoin);
      if (currentPC < safeAmountPC) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // 2. Block if user already has a pending/processing withdrawal
      const activePending = await tx.withdrawalRequest.count({
        where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      });
      if (activePending >= MAX_PENDING) {
        throw new Error("PENDING_EXISTS");
      }

      // 3. Idempotency: return existing record if key already used
      const existing = await tx.withdrawalRequest.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { duplicate: true, withdrawal: existing };
      }

      // 4. Deduct PC from wallet
      await tx.userWallet.update({
        where: { userId },
        data : { premiumCoin: { decrement: safeAmountPC } },
      });

      // 5. Create withdrawal record
      const amountUSD = Math.round(safeAmountPC * PC_TO_USD * 100) / 100;
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId,
          amountPC     : safeAmountPC,
          amountUSD,
          payoutMethod : method,
          payoutAddress: address,
          idempotencyKey,
          status       : "PENDING",
        },
      });

      return { duplicate: false, withdrawal };
    }, { timeout: 10_000, isolationLevel: "Serializable" });

    const w = result.withdrawal;
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      withdrawal: {
        id           : w.id,
        amountPC     : Number(w.amountPC),
        amountUSD    : Number(w.amountUSD),
        payoutMethod : w.payoutMethod,
        payoutAddress: w.payoutAddress,
        status       : w.status,
        createdAt    : w.createdAt,
      },
    }, { status: result.duplicate ? 200 : 201 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "INSUFFICIENT_BALANCE")
      return NextResponse.json({ error: "Недостатньо PremiumCoin на балансі" }, { status: 400 });
    if (msg === "PENDING_EXISTS")
      return NextResponse.json({ error: "У вас вже є активна заявка на виведення" }, { status: 409 });
    if (msg === "WALLET_NOT_FOUND")
      return NextResponse.json({ error: "Гаманець не знайдено" }, { status: 404 });

    console.error("[withdraw]", err);
    return NextResponse.json({ error: "Внутрішня помилка сервера" }, { status: 500 });
  }
}

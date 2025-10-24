# 💸 CrownStandard Payout Module

The **Payout Module** is a fully event-driven, fault-tolerant payment distribution system that handles provider payouts, tip integration, dispute resolution, and retry logic.

---

## 🏗️ Architecture Overview

The module is powered by **AWS EventBridge + SQS + Workers**, ensuring scalable and reliable payout processing **without cron jobs**.

### Key Components

| Layer | Description |
|-------|--------------|
| **Service Layer** | Core business logic for payout, booking validation, payment, tips, and disputes. |
| **Worker Layer** | Asynchronous background jobs triggered via SQS and EventBridge. |
| **Event Layer** | Publishes and listens to domain events across CrownStandard. |
| **Utils Layer** | Shared helpers for logging, audit, and currency conversion. |

---

## 📂 Folder Structure

payout/
├── service/
│ ├── payoutService.js # Core payout orchestration
│ ├── bookingService.js # Booking eligibility logic
│ ├── paymentService.js # Payment validation + refunds
│ ├── tipService.js # Tip retrieval and status
│ ├── disputeService.js # Dispute checks + adjustments
│
├── workers/
│ ├── payoutWorker.js # SQS consumer (main payout trigger)
│ ├── retryWorker.js # Auto-retry for failed payouts
│
├── events/
│ ├── eventPublisher.js # Publishes PAYOUT_* events → EventBridge
│ ├── eventListener.js # Listens for BookingCompleted / DisputeResolved
│
├── utils/
│ ├── auditLogger.js # Centralized logging to AuditLog collection
│ ├── currencyHelper.js # Currency conversion and rounding
│
└── README_PAYOUT.md # Documentation

---

## 🔁 End-to-End Flow

1. **Booking Completed**
   - Provider verifies OTP → booking marked `completed`.
   - `eligibleForReleaseAt = completedAt + 48h`.

2. **EventBridge Trigger**
   - Every hour, checks bookings eligible for payout.
   - Sends `{ bookingId }` → SQS Queue (`payoutWorker`).

3. **Payout Worker Execution**
   - Validates booking, payment, tip, and dispute status.
   - Computes payout = providerShare − refunds + tip.
   - Creates payout record and executes Stripe transfer.

4. **Event Publishing**
   - Emits `PAYOUT_SCHEDULED` → `PAYOUT_RELEASED` → `PAYOUT_FAILED` events.
   - Logged to `AuditLog`.

5. **Retry Logic**
   - If payout fails, `retryWorker` retries up to 3 times with exponential backoff.

6. **Dispute Integration**
   - Open disputes hold payouts (`on_hold`).
   - Partial refunds reduce payout amount.
   - Resolved disputes trigger re-queueing via `eventListener.js`.

---

### 🧮 Multi-Currency Payout Calculation Formula

The payout system automatically normalizes all secondary amounts (tips, refunds, dispute adjustments)  
to the booking’s **primary payment currency** — not a fixed base like CAD.

providerShare (in booking currency)
= booking.pricingSnapshot.providerShare - payment.refundedAmount

normalizedTip
= convert(tip.amount - tip.refundedAmount, tip.currency → booking.currency)

adjustedPayout
= providerShare + normalizedTip - normalizedRefund


**Example:**
- Booking paid in **INR**, tip given in **USD** → Tip converted → **INR**
- Booking paid in **CAD**, tip given in **USD** → Tip converted → **CAD**

This ensures the final Stripe transfer is executed in the same currency as the booking payment.


---

## ⚖️ Business Rules Summary

| Rule | Description |
|------|--------------|
| 1 | Payouts are released **48h after booking completion**. |
| 2 | Tips are included automatically (100% provider). |
| 3 | Disputes put payouts **on hold** until resolved. |
| 4 | **Partial refunds** reduce payout amount. |
| 5 | **Full refunds** block payout entirely. |
| 6 | Each payout attempt is **audited and retried** (max 3). |
| 7 | All events are **event-driven via EventBridge** (no crons). |
| 8 | All tips and refunds are normalized to the booking’s payment currency before payout. |


---

## 🧰 Environment Variables

| Variable | Description |
|-----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API key for transfers. |
| `AWS_REGION` | AWS region for EventBridge & SQS. |
| `PAYOUT_QUEUE_URL` | SQS queue URL for payout jobs. |
| `EVENT_BUS_NAME` | Custom EventBridge bus (optional). |
| `FX_API_KEY` | (Optional) API key for real-time FX conversions (Fixer.io, Apilayer, etc.). Used to normalize tips/refunds to booking currency. |

---

## 📊 Audit Log Actions

| Action | Description |
|---------|-------------|
| `PAYOUT_SCHEDULED` | Payout record created and queued. |
| `PAYOUT_RELEASED` | Stripe transfer completed successfully. |
| `PAYOUT_FAILED` | Transfer attempt failed. |
| `PAYOUT_RETRIED` | Retry attempt triggered. |
| `PAYOUT_HELD` | Payout held due to dispute. |
| `REFUND_ISSUED` | Refund issued due to resolution. |

---

## 🧱 Dependencies

- **AWS SDK (v3)** – SQS + EventBridge communication  
- **Stripe SDK** – Transfers & payment integration  
- **Mongoose** – ODM for MongoDB  
- **Axios** – Currency conversion API (optional)  

---

## 🧑‍💻 Developer Guidelines

1. **All payout-related logic lives inside `/payout/`.**
2. Do not call `PayoutService` directly from API routes — always use events.
3. Every transaction must be **atomic and auditable**.
4. Keep `AuditLog` consistent — no silent failures.
5. Ensure test cases cover:
   - Completed booking payout
   - Partial refund handling
   - Dispute hold/release scenarios
   - Retry logic

---

## ✅ Module Completion Checklist

| Component | Status |
|------------|--------|
| Models | ✅ Complete |
| Service Layer | ✅ Complete |
| Utils Layer | ✅ Complete |
| Workers | ✅ Complete |
| Events | ✅ Complete |
| Documentation | ✅ Complete |

---

**This payout module is now production-ready** — event-driven, auditable, and fault-tolerant.  
Developers can extend it easily with new event listeners (e.g., *RefundProcessed*, *ProviderKYCVerified*).

---

🧩 *Author:* CrownStandard Engineering Team  
📅 *Version:* 1.0.0  

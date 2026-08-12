# OPC order modules

This directory owns the accountless OPC paper-order lifecycle. Its external
seams follow business capabilities instead of storage operations:

- `model.ts`: stable public statuses, value types, receipts, and domain errors.
- `checkout.ts`: idempotent order creation and payment-session binding.
- `signature.ts`: electronic-signature preparation, callbacks, reconciliation,
  and immutable contract archival.
- `payment.ts`: bank-transfer evidence, receipts, and the
  payment-notification outbox.
- `refund.ts`: full-refund claims and evidence-based cancellation.
- `admin.ts`: administrator dossiers, fulfillment transitions, exports, and
  retention maintenance.
- `internal-store.ts`: the only module allowed to own the `opc-orders` state
  document schema, legacy parsing, encryption helpers, resume credentials, and
  shared mutation primitives.

Production callers import the focused module that owns the operation. The
top-level `../opc-order-store.ts` and this directory's `index.ts` preserve the
previous runtime interface for compatibility; they are not the preferred seam
for new production code.

The directory is one deep module, not a requirement that every operation live
in one source file or pass through a forwarding facade. Capability files own
their state transitions and hide stored order fields from callers. Route
handlers may call these business interfaces or the provider-orchestration
interface in `../opc-order-lifecycle.ts`; they must never import
`internal-store.ts`, mutate the state document, or assign order status fields.

The persisted document remains schema version 8. Refactors must preserve its
namespace, migration parser, encrypted fields, optimistic concurrency checks,
idempotency fingerprint, and order-state transitions unless an authoritative
specification and versioned migration explicitly change them.

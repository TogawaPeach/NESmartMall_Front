# Merchant product statistics implementation plan

**Goal:** Connect only the three merchant overview counts to GET `/api/merchant/products/stats`.

**Spec:** `/Users/lightfull/NESmartMall_Require/商家商品列表分页统计与秒杀展示需求2026-10-23.md`, statistics subset approved in this conversation.

**Architecture:** Use the shared authenticated Axios client, validate a Result-wrapped count object, and own loading/error/session cancellation in a separate Vue composable. Keep the existing local inventory demonstration independent of real statistics.

**Tech stack:** Vue, TypeScript, Pinia, Axios, Element Plus, existing node:test/Vite SSR harness.

**Constraints:** No backend, database, list API or dependencies. Preserve pre-existing flash-sale changes. Work in the user's current checkout for direct local review; no commit or push requested.

## Task 1: Statistics request and lifecycle

Files: new `src/api/merchantStats.ts`, `src/composables/useMerchantStats.ts`, `tests/merchant-stats.test.mjs`; extend `src/types/merchant.ts`.

- [x] Write and run failing tests: one Bearer GET without parameters/body; unwrap `{code:200,data:{allCount,onSaleCount,offShelfCount}}`; preserve valid zeros and independent counts when drafts exist.
- [x] Cover malformed/missing/negative/fractional/unsafe counts, business/HTTP errors and retry without simulated fallback.
- [x] Cover no merchant session, session changes while pending, repeated retry and unmount; obsolete results cannot replace current counts.
- [x] Implement `queryMerchantStats(options?: SessionRequestOptions): Promise<MerchantStats>` and `useMerchantStats()` returning stats/state/errorMessage/retry; rerun targeted tests.

## Task 2: Overview display and documentation

Files: `src/views/MerchantProductsView.vue`, `src/assets/merchant.css`, new `docs/merchant-stats-api.md`. Keep this implementation and its documentation in the frontend project.

- [x] Bind overview cards exclusively to API counts, show placeholders and loading feedback, display error with retry; clarify that the list and edits are still local demonstrations.
- [x] Review template bindings and diff; run targeted tests, full existing suite, production build and changed-file lint/format.
- [x] Record verification and exact backend object contract; do not claim real backend integration was verified unless exercised.

Review focus: legitimate all-zero counts; draft counts need not equal on-sale plus off-shelf; failed refresh must not show old counts as current; identity change before dispatch must not send a stale-session request; demo writes must never alter real statistics.

Verification: expected RED for missing new module; merchant tests 17/17; full suite 350/350 (initial sandbox EPERM for existing mock listeners resolved by allowing local test listeners); build/type-check, changed-file ESLint, formatting and diff checks passed. Real backend and browser integration not exercised. No commit or push.

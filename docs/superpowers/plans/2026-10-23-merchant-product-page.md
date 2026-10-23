# Merchant product page implementation plan

Goal: replace the merchant's local example list with GET `/api/merchant/products/page`, independently of the existing stats GET. Frontend only; preserve unrelated work and do not commit or push.

Spec: `/Users/lightfull/NESmartMall_Require/商家商品列表分页统计与秒杀展示需求2026-10-23.md`, second GET authorized in this conversation.

Architecture: a separate validated API adapter and authenticated Vue composable own server pagination, status filtering and request cancellation. Keep original numeric product status separate from time-derived display text; reuse the existing Beijing time parser and integer-fen formatter. The merchant page displays real rows only, with disabled future write actions.

Decisions: category 0 uses 未分类; completed flash sales use 已结束; off-shelf and draft status take priority; invalid flash-sale windows use 秒杀时间异常. User's subsequent instruction cancels merchant search entirely: remove the input and keyword query/state; preserve status during paging/retry. Fixed page size 8 with Element Plus pagination.

## Task 1: API contract and state

Files: new `src/api/merchantProducts.ts`, `src/composables/useMerchantProductPage.ts`, `src/utils/merchantProduct.ts`, `tests/merchant-products.test.mjs`; extend `src/types/merchant.ts`.

- [x] Write and observe failing tests for Bearer GET, data object/list/total/page fields, product fields, category mapping, missing price/image, zero stock, original status and nullable flash-sale dates.
- [x] Implement strict pagination and core-field parsing, duplicate IDs rejection, auth errors and safe image URLs; reuse existing time parser.
- [x] Test and implement initial page, server-side status filters, retained status on retry/page changes, empty/error/loading, out-of-range correction and cancellation on identity changes/unmount. Verify no keyword is sent, even from obsolete callers.
- [x] Test and implement time-based display text, boundary equality, invalid windows, draft/off-shelf priority and local-only ticking.

## Task 2: Page and handoff

Files: `src/views/MerchantProductsView.vue`, `src/assets/merchant.css`, `docs/merchant-products-api.md`, previous stats doc status note.

- [x] Render API rows/images/categories/prices/statuses, load/error/empty states and Element Plus paging; remove active demo/editor wiring; disable pending write actions.
- [x] Confirm stats stay independent, removed slogans and search remain absent, and no POST/PATCH/PUT/DELETE are introduced.
- [x] Run targeted and full tests, production build/type-check, changed-file lint/format and diff checks; request read-only code review and fix material findings.
- [x] Record exact request/response and verification in frontend documentation; do not claim real backend verification. Browser verification used an isolated mock API and session.

Review focus: unknown category values never mean all; nullable malformed flash-sale dates must not break other rows or imply active sales; totals are server totals not row count; stale requests never mutate a newer query; demo writes cannot alter real data; a page emptied by deletion corrects without looping.

Final evidence: 13/13 list tests, 30/30 merchant tests, full suite 363/363, build/type-check and lint/diff checks pass. Read-only independent review and follow-up after search removal found no reproducible issues. Isolated Chrome verification exercised page/filter/empty/error states and confirmed removed search; real backend not exercised. No commits or pushes.

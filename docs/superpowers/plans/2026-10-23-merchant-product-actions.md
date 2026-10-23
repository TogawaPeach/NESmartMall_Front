# Merchant product actions implementation plan

Goal: implement the user-approved shared create/edit dialog and POST save/status actions in the frontend, then commit/push the merchant work only.

Spec: `/Users/lightfull/NESmartMall_Require/商家商品新增修改与上下架前端需求2026-10-23.md` (updated first, user approved the design in chat).

Architecture: pure draft/serialization helpers, dedicated authenticated mutation API and action composable, shared editor integrated into the existing real product list. Separate write completion from subsequent GET refreshes; never fabricate success or mutate rows locally.

Constraints: preserve pre-existing unrelated flash-sale changes. No backend/database work. No merchant search. URL-only cover entry. JSON boolean isSeckill, integer fen price, numeric categoryId, Beijing wall-clock times, null times for normal products. Save omits status/owner/description/details; numeric id is not allowed. Code=200 with data=null succeeds. Do not auto-retry writes.

## Task 1: Requests, validation and lifecycle

Files: new `src/api/merchantProductActions.ts`, `src/utils/merchantProductForm.ts`, `src/composables/useMerchantProductActions.ts`, `tests/merchant-actions.test.mjs`; extend `src/types/merchant.ts`.

- [x] RED then GREEN: create omits id; edit sends id; cover and numeric category/price/stock, boolean flag; normal times null; Beijing roundtrip, invalid dates/prices rejected before POST.
- [x] RED then GREEN: POST save and status use exact paths/body/Bearer, data=null success, business/HTTP/network failures never produce success or automatic retries.
- [x] RED then GREEN: double submit blocked, failure preserves editor, success refreshes both GET resources; identity changes/unmount invalidate pending results and requests.

## Task 2: Dialog, integration and publication

Files: `src/components/merchant/MerchantProductEditor.vue`, `src/views/MerchantProductsView.vue`, frontend docs and selected Require copies.

- [x] Reuse dialog for blank new/filled edit forms; add cover URL, numeric categories, flash-sale switch and conditional datetime inputs; disable dismissal/submission while pending.
- [x] Enable row status actions, inline errors and success feedback; create returns to all/page1, edit/status retain current query and allow out-of-range correction.
- [x] Run merchant/full tests, build/type-check, targeted lint/format and browser mock validation. Request independent review and fix material findings.
- [x] Document actual validation limits. Stage only merchant files and docs, inspect staged diff and verify the independently exported staged snapshot.

Publication: user explicitly authorized committing and pushing current main; execute after the verified staged snapshot. Record the resulting GitHub commit in local Require and the final response.

Review focus: prices preserve cents, normal products erase old times, edit does not clear unknown fields, stale mutation results cannot refresh another account, refresh failure after write success must not encourage duplicate create, unrelated working files must not enter the commit.

Evidence: action tests 15/15, workspace full suite 378/378, staged snapshot 362/362, both production builds/type-checks and targeted lint passed. Independent review identified a pre-dispatch identity synchronization race; save/status cross-tab cases reproduced RED, sequence guard fixed both GREEN. Browser mock verification and actual request assertions passed. Only merchant paths are staged; unrelated work is preserved.

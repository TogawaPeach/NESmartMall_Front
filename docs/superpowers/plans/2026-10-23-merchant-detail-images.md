# Merchant detail image links and off-shelf confirmation

Scope: extend the shared editor with optional ordered detailImages URL rows, plus explicit cancel/confirm before off-shelf POST. Frontend only; preserve unrelated working changes. Follow the previously authorized documentation, implementation, verification and GitHub publication workflow.

Design: new products begin with one empty detail image input. Existing products copy known detailImages from the list; when absent, load `GET /api/merchant/products/{id}` and require data.detailImages before editing, preventing unknown images being overwritten. Empty submitted rows are omitted, all-empty becomes []; validate nonempty HTTP/HTTPS links. Off-shelf confirmation is owned by the existing action composable and cleared on identity changes, with pending/error state; listing remains direct.

User clarification: listed products (status=1) must not expose detail images. Hide that editor section and never fetch images for listed products; omit detailImages when saving other listed-product fields, preserving existing pictures. Only new/draft/off-shelf products can read/edit image links; their missing list field triggers the merchant GET above. Reproduce this distinction in tests before changing behavior.

- [x] RED/GREEN tests: ordered URL serialization, optional all-empty rows, invalid URL rejection, draft cloning and known/missing images; merchant GET success/failure/session cancellation.
- [x] RED/GREEN tests: opening/cancelling confirmation sends no POST, confirming posts once, pending duplicate blocked, failure stays open, identity changes invalidate confirmation.
- [x] Implement dynamic link rows and confirmation dialog, update Require and frontend contracts.
- [x] Run full tests/build/lint, independent review and isolated browser verification.

Publication scope: only these merchant changes and documentation, retaining unrelated changes. Publish after verifying the staged snapshot under the ongoing user-authorized GitHub workflow; report commit in local Require and final response.

Evidence: 23/23 action tests, 37/37 action+page tests, 387/387 workspace full suite, 371/371 independently exported staged snapshot and both production builds/type-checks passed. Independent review found no reproducible issues, including a focused pass after user clarified listed-product hiding. Isolated Chrome verification plus raw mock request assertions confirmed ordered link changes, absent field for listed saves, no pre-confirmation POST, and merchant image GET only after off-shelf. Only merchant paths are staged; unrelated changes remain unstaged.

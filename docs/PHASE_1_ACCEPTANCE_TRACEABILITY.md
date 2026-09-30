# BASNY ENTERPRISE — acceptance traceability

**Source:** [Client SRS](BASNY-Client-SRS.txt) p. 13, section 12.2, “Minimum Acceptance Tests” (1–16), plus the ten POS-specific cases in the [product and engineering plan](BASNY-Product-and-Engineering-Plan.md). Text below paraphrases the SRS pass conditions without changing their intent. Evidence is planned, not yet collected.

| SRS # | Required result | Build phase | Evidence to retain | Evidence owner |
| --- | --- | --- | --- | --- |
| 1 | Admin creates a categorised, priced product with size/colour; it appears correctly on storefront. | 3 | Admin record and storefront capture for same SKU. | Product/QA |
| 2 | Per-colour/size stock produces correct availability. | 3 | Variant stock ledger and storefront states. | Inventory/QA |
| 3 | Search, filters, and product detail return relevant results. | 3 | Search/filter scenarios and product detail review. | Storefront/QA |
| 4 | Cart retains exact variant, quantity, and price. | 5 | Cart and checkout snapshot after navigation/reload. | Commerce/QA |
| 5 | Unavailable variant cannot be purchased; customer sees clear explanation. | 3, 5 | UI and direct API denial, including stale-cart case. | Commerce/QA |
| 6 | Successful verified payment creates paid order with unique number. | 5 | Paystack sandbox reference, server verification, order and audit record. | Payments/QA |
| 7 | Failed/abandoned payment never makes a falsely paid order; stock releases under approved rule. | 5 | Failure/expiry/retry scenarios and inventory ledger. | Payments/QA |
| 8 | Confirmed order processes and stock reduces exactly once; full order visible in admin. | 5, 6 | Order detail and before/after stock/reservation ledger. | Orders/QA |
| 9 | Admin status change reaches customer view and notification. | 6 | Authorized transition, audit event, customer page, delivered notification. | Operations/QA |
| 10 | Purchased-product review enters moderation and can show Verified Purchase when approved. | 6, 8 | Eligible and ineligible review scenarios, moderation record. | Engagement/QA |
| 11 | Coupon and scheduled sale enforce eligibility, dates, and usage limits. | 6 | Boundary-time and limit scenarios at checkout. | Promotions/QA |
| 12 | Admin edits banner and policy page without developer intervention. | 2, 6 | Admin edit/publish and public page capture. | Content/QA |
| 13 | Unauthorized protected action denied by server and logged where appropriate. | 4 | Direct API requests for each BASNY role and audit evidence. | Security/QA |
| 14 | Mobile, tablet, desktop have usable controls and checkout without clipping. | 2–9 | Device/browser matrix, accessibility and interrupted-network results. | Storefront/QA |
| 15 | Order/payment report exports match filtered dashboard data. | 6 | Filtered view compared with CSV/Excel rows and GHS totals. | Reporting/QA |
| 16 | Backup/recovery process can restore critical store data. | 9 | Recovery runbook and witnessed restore record. | Infrastructure/QA |

**Inventory interpretation for SRS #8:** available quantity decreases when an order reserves the variant, and physical stocked quantity decreases once at fulfillment. The ledger must show both movements without a second availability deduction. BASNY should review this interpretation alongside the chosen reservation policy.

## POS and operational additions from the engineering plan

| POS # | Required result | Build phase | Evidence to retain | Evidence owner |
| --- | --- | --- | --- | --- |
| P1 | Cashier selects exact variant, completes sale, gets correct receipt. | 7 | Sale and printed receipt on chosen device. | POS/QA |
| P2 | POS sale changes online availability for the same variant. | 7 | Before/after online stock and POS order. | Inventory/QA |
| P3 | Simultaneous attempts for final unit cannot oversell. | 5, 7 | Concurrent online/POS attempts and stock ledger. | Commerce/QA |
| P4 | Reprinted receipt matches immutable order data. | 7 | Initial and reprinted receipts compared to order snapshot. | POS/QA |
| P5 | Cashier cannot call restricted refund/price/stock endpoints. | 4, 7 | Direct denied requests and audit records. | Security/QA |
| P6 | Manual payment stays unverified until authorized staff action. | 5 | Payment state and verification audit trail. | Payments/QA |
| P7 | Staff edit delivery fees/areas/pickup/free-delivery rules without redeploy. | 5 | Admin edit and fresh checkout GHS totals. | Operations/QA |
| P8 | Promotion limits/dates enforced server-side. | 6 | Invalid/expired/over-limit direct checkout attempts. | Promotions/QA |
| P9 | Pending/failed/duplicate/retried payment events cannot create false paid orders or duplicate stock operations. | 5 | Event replay and reconciliation evidence. | Payments/QA |
| P10 | Backup and restore demonstrated. | 9 | Runbook and witnessed restore record. | Infrastructure/QA |
| P11 | Admin changes Accra/Ghana delivery fees and pickup address; new checkouts use the new settings while prior orders keep charged fees and address snapshots. | 5, 6 | Settings audit, before/after GHS totals, and order snapshots. | Operations/QA |
| P12 | Pay on pickup is unavailable by default; enabling permits pickup only, never delivery. Disabling it stops new selections without changing existing orders. | 5, 6 | Admin switch, checkout method matrix, and existing-order state. | Payments/QA |
| P13 | Unpaid pickup no-show expires 48 hours after Ready for Pickup, sends a reminder, cancels, and makes the exact variant available to online and POS buyers once. A late arrival cannot collect the old order. | 5, 7 | Clock-controlled timeline, notification, stock ledger, and late-arrival attempt. | Orders/QA |
| P14 | Verified pickup payment before handover prevents expiry; payment/expiry races, retries, and duplicate jobs never release stock twice or hand over an unpaid item. | 5, 7 | Concurrent state transitions, payment and stock audit trail. | Payments/QA |
| P15 | A 14-day eligible return request records direct customer return cost; wrong/defective item follows BASNY-funded path and only inspected sellable stock returns to availability. | 6 | Policy review, return/refund records, inspection and stock ledger. | Returns/QA |

## Sign-off rule

Phase 1 approves **the planned pass conditions and owners**. It does not mark any implementation test as passed. Phase 9 records actual outcomes against all 16 SRS cases and the POS additions. Any client-approved change to scope must update this matrix, the blueprint, and the decision register together.

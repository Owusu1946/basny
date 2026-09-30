# BASNY ENTERPRISE — Phase 1 decision register

**Status:** Open for BASNY and project-owner review. This register preserves disagreements between the supplied 15-page client SRS, the existing plans, and later instructions. It does not silently amend the client contract.

| ID | Decision needed | Current evidence and provisional direction | Owner | Blocks |
| --- | --- | --- | --- | --- |
| D01 | Domain, first-year hosting, and two business email accounts: included or deferred? | **Project-owner direction:** use the owner's Vercel and Resend accounts for review; the client supplies the production domain and hosting when ready; the project owner includes setup of two professional mailboxes. Client SRS pp. 2, 12 says the developer includes first-year domain and hosting, so obtain BASNY's written agreement to that changed responsibility. Mailbox provider/address choices follow once the domain is available. | Project owner + BASNY | Commercial sign-off and launch scope |
| D02 | Commerce architecture | **Decided by project owner:** keep the existing Next.js, Hono, Better Auth, Neon/Drizzle foundation and build BASNY commerce modules on it. No paid commerce-platform licence. One server-owned ledger governs online and POS stock; all four staff roles require server-enforced authorization and audit records. Medusa was considered, but its built-in RBAC is Enterprise licensed and it adds a separate backend/worker. Hosting, payment processing and other operating costs remain. | Project owner | Phase 2 architecture |
| D03 | Stock reservation start and expiry | **Planning decision delegated to engineering by project owner:** reserve at final order submission/order creation, including orders awaiting asynchronous Paystack Mobile Money. No stock hold while forms are being filled. Use an initial 15-minute payment window; reconcile provider status before releasing a hold. Terminal failure/cancellation releases; late success after release requires staff resolution/refund. Prove concurrency, expiration, and webhook behavior during integration. | Engineering; BASNY reviews policy | Checkout and POS design |
| D04 | Nationwide Ghana delivery tariff | **Project-owner direction:** GHS 60 in Accra; GHS 100 outside Accra but within Ghana, both editable in admin. SRS p. 7 fees are illustrative. Confirm the Accra boundary (including Tema treatment), carriers/process, time estimates, remote-location exceptions, and any free-delivery threshold with BASNY before launch. | BASNY operations | Customer totals and go-live |
| D05 | Accra store pickup | **Project-owner direction:** use an editable, clearly labelled demo Accra address in preview; replace it with a verified address before live orders. Pay on pickup is disabled by default and may be enabled in admin. Proposed no-show rule: 48 hours after Ready for Pickup, unpaid/uncollected order cancels and releases stock exactly once; staff may extend before expiry with an audited reason. Existing orders retain their terms if the setting changes. Payment-before-handover, expiry races, and duplicate release are specified in the blueprint. Confirm real address, hours, readiness SLA, and exact collection window with BASNY. | BASNY operations | Checkout and POS |
| D06 | Return/exchange policy | **Engineering proposal requested by project owner:** 14 days from receipt for returns/exchanges. Customer pays direct return delivery for ordinary cancellation; BASNY handles wrong/defective items. Initiate approved refund within seven business days after receipt/inspection, subject to provider settlement. Ghana's Electronic Transactions Act section 49 provides a 14-day cancellation right for eligible online goods and limits customer charges to direct return costs. BASNY/legal review required for published terms and exceptions. | BASNY owner | Policy pages and returns |
| D07 | Paystack payment methods | Paystack selected in existing plan; SRS allows one approved gateway. Confirm BASNY merchant account and enabled GHS Mobile Money/card methods; whether manual transfers and pay-on-pickup launch. Test/live key delivery only when integration work starts. | BASNY owner | Payment design |
| D08 | Initial catalogue and content | **Project-owner direction:** use clearly labelled sample products for preview. They cannot be represented as BASNY's real, purchasable inventory. Confirm count included in setup, structured real product data, stock counts, photos, image rights, descriptions, and who supplies each before live catalogue import. | BASNY owner | Phase 3 and launch |
| D09 | Staff roles and monetary authority | Confirm staff users, cashiers, manual-payment verifiers, discount limits, refund approvers, report exports, and whether Super Admin MFA is required. | BASNY owner | Authorization and POS |
| D10 | Receipt hardware and POS handling | Confirm printer and device/browser, print-dialog acceptability, cash/manual method handling, shift close and cash reconciliation needs. | BASNY operations | POS acceptance |
| D11 | Brand approval | Current palette is a proposed direction. Obtain BASNY logo, approved colours, typography/photography direction, WhatsApp number, and social handles. Hugeicons is the agreed icon library. | BASNY owner | Phase 2 design |
| D12 | Reporting and analytics | Define whether revenue includes shipping, discounts, tax and refunds; choose analytics provider; approve Meta Pixel and consent behavior; confirm CSV/Excel export expectation. | BASNY owner | Reports and analytics |
| D13 | Order and payment policy | Approve status transitions, manual payment verification procedure, cancellation windows, refund handling, guest order lookup, and notifications. | BASNY operations | Checkout and operations |
| D14 | Timeline and handover | Confirm review milestones, training participants, operator-guide format, post-launch support period, and which party owns each third-party account. | Project owner + BASNY | Sign-off |

## Immediate review order

Resolve **D01** with BASNY in writing before commercial sign-off. **D02 is decided.** D03 has a chosen planning rule but still needs sandbox and concurrency proof. D04–D05 have starting rates and a pickup policy, while the exact boundary and operating details remain for BASNY. The remaining items can be filled through a BASNY decision session without generating credentials or creating third-party accounts yet.

### D02 architecture comparison retained for the decision record

| Option | Existing advantage | Work and risk |
| --- | --- | --- |
| Medusa v2 for commerce, Next.js for storefront | Documented variant inventory, reservations, orders, sales channels, and extension points align with the SRS. | Integrate Paystack, build BASNY POS/receipt/delivery/content flows, and resolve staff RBAC through a licensed offering or independently built server authorization. The current Hono/Better Auth scaffold needs an explicit migration or coexistence plan. |
| Extend the current Hono/Better Auth/Drizzle scaffold | Retains the repo's existing authentication and API foundation. | The complete commerce order, payment, stock, reservation, refund, promotion, reporting, and POS rules must be built and maintained here. This creates more custom correctness work before launch. |

| BASNY concern | Medusa v2 | Current Hono/Drizzle |
| --- | --- | --- |
| Shoe sizes, colours and stock | Existing product, variant, inventory and reservation concepts; still configure one Accra location and customize BASNY rules. | Complete variant, ledger, reservation and return logic must be designed and built in this repo. |
| Paystack GHS and Mobile Money | Custom payment provider, webhook handling and reconciliation required; no assumption of an official Paystack provider. | Custom integration, webhook handling and reconciliation required. |
| Walk-in POS | Official POS recipe provides a starting pattern; BASNY's cashier UI, receipt and shared-stock edge cases remain custom. | POS and shared-stock behavior entirely custom. |
| Four staff roles | Admin authentication exists; fine-grained permissions and direct API enforcement need a verified extension/licensing approach. | Better Auth exists, but every commerce permission and audit check must be built and verified. |
| Hosting and maintenance | Next.js storefront plus Medusa API and background worker; more services and operational cost. | Existing Next.js plus Hono setup can stay, but more BASNY-owned commerce code needs ongoing maintenance. |
| Time to reliable commerce | Lower custom surface for catalog/order/inventory; migration and extension work first. | Less framework migration; higher custom correctness and testing burden for payments, stock and returns. |

**Decision basis:** the project owner prioritized no paid commerce-platform licence and four restricted staff roles in one existing backend. Hono/Drizzle was selected with the explicit cost of building and maintaining commerce rules ourselves. Real integration testing in later phases must still prove the checkout flow.

**Recorded decision:** the project owner chose the current Hono/Drizzle foundation after reviewing licence and role costs. Medusa remains a historical comparison, not the target engine. Phase 0 app proof was intentionally skipped, so payment and stock behavior remain later integration gates.

**Implementation boundary:** Next.js owns customer-facing presentation; Hono exposes protected commerce APIs; Better Auth identifies customers and staff; Drizzle/Postgres stores products, exact variants, stock movements/reservations, orders, payment attempts, returns, promotions and audit records. A single transactional stock service handles online and POS claims against the last item. Paystack verification and webhooks update orders idempotently. Staff roles are enforced in every protected server action, including direct API calls. Phase 2 should define module boundaries and transaction contracts before building commerce features.

**Cost and licence finding (23 September 2026):** Medusa's core is MIT licensed, but its built-in RBAC backend and dashboard code is Enterprise licensed, and Medusa Cloud plans are paid. These findings drove the Hono/Drizzle choice. “Free” here means no commerce-platform licence; hosting, database, storage, email, Paystack fees and maintenance still have costs.

## Phase 1 closeout checklist

| Topic | Current state | Needed for sign-off |
| --- | --- | --- |
| Client SRS and acceptance | All 16 numbered tests mapped; additional POS, pickup and return cases added. | BASNY accepts the matrix. |
| Delivery and pickup | GHS 60 Accra and GHS 100 rest of Ghana; editable. Pickup demo address, default-disabled pay on pickup, and no-show release documented. | BASNY confirms exact Accra boundary, real pickup address/hours and proposed 48-hour collection period before live use. |
| Returns | 14-day policy and return-delivery responsibility proposed. | BASNY approves published wording and lawful exceptions. |
| Architecture | Hono/Drizzle selected with custom commerce modules and server-enforced staff roles. | Define transactions, module boundaries and direct API permission checks during Phase 2. |
| Commercial scope | Owner's review-account and mailbox plan recorded. | BASNY acknowledges domain/hosting responsibility change from its SRS in writing. |
| Catalogue and brand | Product families, variants, palette, Hugeicons and sample hero images available. Sample products are approved for preview. | Confirm real product-data owner/count, logo and product photography before launch. |
| Operations | Permission, order, reporting and notification proposals documented. | BASNY confirms staff authority, receipt device, report definitions and payment methods. |

The unresolved items are decisions and source material, not a reason to build a Phase 0 proof. Phase 2's visual design can proceed after project-owner authorization, but commerce foundation implementation should use the chosen D02 architecture.

## Decisions already given in this conversation

- Store location: Accra, Ghana.
- Delivery reach: nationwide Ghana.
- Starting delivery rates: GHS 60 within Accra; GHS 100 elsewhere in Ghana, editable by Super Admin.
- Pay on pickup: disabled by default, available through an admin switch. Preview pickup address is a labelled demo value until BASNY supplies a real one.
- Returns: propose a 14-day window and customer-paid direct return delivery for ordinary cancellation; BASNY handles wrong or defective items.
- Store currency: GHS throughout; do not use USD examples or checkout totals.
- Icons: Hugeicons.
- Working visual direction: warm ivory, stone, near black, and restrained bronze.
- Catalogue preview: use sample products until BASNY supplies verified inventory and media.
- Current work: Phase 1 planning and research only; no application build.
- Review infrastructure: project owner offers their Vercel and Resend accounts temporarily; the client provides its production domain and hosting later; the project owner includes two professional mailboxes. Do not create accounts, deploy, or generate keys until specifically requested at the relevant step.

The project owner asked to be consulted when an account, credential, purchase, or business decision is needed. Provide setup steps at that time; do not create those independently.

## Technical references behind D01–D03

Medusa references below explain the rejected architecture comparison; they are not implementation instructions for the selected Hono/Drizzle stack.

- [Medusa deployment overview](https://docs.medusajs.com/learn/deployment): the backend/admin and Next.js storefront deploy separately; Vercel is a storefront host, while the backend needs a Node.js server environment.
- [Medusa reservation lifecycle](https://docs.medusajs.com/resources/commerce-modules/inventory/reservations-lifecycle): completing a cart creates a reservation for managed inventory; cancellation releases it and fulfillment consumes it.
- [Medusa deferred payment authorization](https://docs.medusajs.com/resources/commerce-modules/payment/payment-flow): asynchronous payment can leave an order awaiting authorization.
- [Paystack payment channels](https://paystack.com/docs/payments/payment-channels/): Ghana Mobile Money authorization can happen on the customer's phone and requires later webhook/verification handling.
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby): Hobby is restricted to personal, non-commercial use, so the review deployment's plan must be suitable for a commercial client project.
- [Ghana Electronic Transactions Act, 2008, sections 47–49](https://orc.gov.gh/legislation/Electronic_Transactions_Act_no_772_2008.pdf): online seller information, delivery performance, and the 14-day goods cancellation grace period.
- [Medusa return handling](https://docs.medusajs.com/user-guide/orders/returns): return delivery cost can be accounted for and received goods are distinguished from damaged goods for restocking.
- [Medusa POS recipe](https://docs.medusajs.com/resources/recipes/pos): extension path for an in-store sales flow.
- [Medusa payment providers](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider): third-party gateways use custom providers; the system provider leaves verification to the merchant.
- [Medusa production worker mode](https://docs.medusajs.com/learn/production/worker-mode): production separates API server and background worker.
- [Medusa core licence](https://github.com/medusajs/medusa/blob/develop/LICENSE): MIT core with Enterprise exception.
- [Medusa Enterprise licence](https://github.com/medusajs/medusa/blob/develop/ENTERPRISE-LICENSE.md): built-in RBAC and its admin UI are proprietary materials.
- [Medusa Cloud pricing](https://medusajs.com/pricing): paid hosting and Enterprise RBAC/audit features.

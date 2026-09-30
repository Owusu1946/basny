# BASNY ENTERPRISE — Phases to Launch

**Planning principle:** prove the risky foundations early, then ship usable increments. A phase is complete only when its exit criteria are demonstrated. Configuration such as delivery fees is set by BASNY staff in the admin; changing a fee should not require a code change or redeployment.

## Phase 0 — Business decisions and fit proof (research-only path chosen)

**Goal:** confirm the platform and operational assumptions before investing in the full build.

**Work**
- Collect logo/brand assets, desired tone and product photography examples.
- Confirm BASNY owns/controls the Paystack merchant account and analytics account. For review, use the project owner's Vercel and Resend accounts. BASNY provides production domain and hosting later; the project owner includes two professional mailboxes. Obtain BASNY's written acknowledgment of the domain/hosting change from the SRS.
- Paystack is the selected online gateway. Confirm merchant onboarding and Ghana payment methods BASNY wants enabled; test GHS payment and webhook verification.
- Document one representative shoe with colour/size combinations, SKU and separate stock; leave code demonstration for later implementation.
- Specify storefront stock selection, checkout-safe inventory checks and order creation as acceptance cases.
- Specify cashier POS against the same physical stock and receipt preview/printing as acceptance cases.
- Record the selected Hono/Drizzle architecture and four server-enforced staff roles.
- Pick launch stock reservation rule and confirm whether reservation begins at checkout or order creation.
- Confirm receipt printer/device, basic payment methods for walk-in transactions, and any required cashier shift/cash-tender handling.

**Exit:** research and Phase 1 documents record the platform decision and implementation approach. No application proof was built; payment, stock concurrency and receipt-device behavior remain later verification gates.

## Phase 1 — Product definition, decisions and experience blueprint

**Goal:** turn the brief into signed-off store rules and screen behavior.

**Work**
- Confirm launch categories and product/variant data sheet for shoes, bags and accessories.
- Agree business order statuses and who may transition them.
- Configure model: admin-managed delivery zones/fees, pickup, return/exchange, manual payments and customer guest flow. Admins must be able to add/edit/activate/deactivate delivery locations and prices without code changes or redeployment.
- Create screen-by-screen flows for home, catalog, product, cart, checkout, confirmation, account, admin and POS.
- Define mobile performance budgets, accessibility baseline and analytics events.
- Define role/permission matrix and audit events.
- Confirm initial content/product quantity and responsibilities.

**Exit:** approved backlog and acceptance criteria traceable to the brief; no unresolved business rule blocks engineering.

## Phase 2 — Foundation, landing and design system

**Goal:** establish the fast branded experience and reusable technical foundation.

**Work**
- Create codebase, environments, deployment pipeline, database, secrets handling, logging and error monitoring.
- Build design tokens/components: typography, colors, spacing, buttons, forms, cards, navigation, dialogs, tables and alerts.
- Build storefront shell, luxury-modern responsive landing page and footer.
- Create editable hero/campaign slots and category entry points.
- Implement image sizing/compression conventions and SEO metadata patterns.
- Build initial CMS/content editing approach for homepage banners, links and pages.

**Exit:** deployed landing experience works on phone/tablet/desktop; business staff can edit campaign content in admin; baseline accessibility/performance review complete.

## Phase 3 — Catalog, variants and inventory

**Goal:** create correct product records and exact per-variant availability.

**Work**
- Implement categories, subcategories, collections and safe archive/hide behavior.
- Implement product editing, image gallery/order, descriptions, material/brand, SEO, merchandising flags.
- Configure generic option values and variant SKUs for colour, size and future options.
- Track quantity and low-stock thresholds per variant/location; stock adjustments require reason and actor.
- Build product listing, category/collection pages, search, filtering, sorting, pagination and product detail.
- Verify colour-specific image behavior and unavailable size states.
- Prepare agreed CSV import workflow and initial data template.

**Exit:** administrator creates/edits a shoe, bag and accessory; exact variants show correct stock; storefront search/filter/detail pages reflect changes; no unavailable variant can be added.

## Phase 4 — Identity and authorization

**Goal:** secure customer and staff access without blocking guest purchases.

**Work**
- Implement customer registration, login, logout, password reset, profile and saved addresses.
- Preserve guest checkout and allow a customer to create an account after or during purchase without losing the order.
- Implement BASNY staff roles/permissions on the server, with least privilege and protected role management.
- Add route/API authorization checks and audit denials for sensitive actions as agreed.
- Require MFA for privileged administrators if selected and supported by the chosen approach.
- Test direct API access, not only visible/hidden UI controls.

**Exit:** all roles operate only permitted actions; guest purchase works; unauthorized server requests are rejected; password recovery and staff onboarding are usable.

## Phase 5 — Commerce, delivery configuration and payments

**Goal:** complete reliable online sales end-to-end.

**Work**
- Implement cart with selected variants, quantity validation, persistence and coupon entry.
- Build short guest checkout for contact, delivery/pickup, address, landmark/instructions and terms consent.
- Build delivery-area/fee admin records, timing, pickup and free-delivery thresholds so BASNY can change them after launch.
- Integrate Paystack; implement transaction references, server verification, signed webhooks, idempotency, pending/failure/retry and refunds as supported by the merchant account and provider API.
- Add manual bank transfer/MoMo/pay-on-pickup settings and authorized verification queue.
- Implement order numbering, immutable item/price snapshots, business status mapping and customer order confirmation.
- Implement agreed reservation lifecycle; release stock safely for cancellation/expiry and reconcile payment/order race conditions.

**Exit:** acceptance purchase path passes for successful, failed, pending, abandoned and duplicate webhook cases; delivery fee/pickup changes from admin without deploy; no false paid order and no oversell.

## Phase 6 — Operations dashboard, promotions and notifications

**Goal:** give staff daily operational control.

**Work**
- Order search/filter/detail, internal notes, status timeline and role-gated actions.
- Customer list/history and review moderation with verified purchase logic.
- Return/exchange request and resolution workflow with correct refund/stock linkage.
- Coupons, date-bound campaigns, product/category targeting and usage caps, validated server-side.
- Email notifications for registration/reset, order received, payment confirmed, status changes, dispatch, pickup, delivery, cancellation/refund and return updates.
- Admin audit history for price, stock, payment, order, product, role and content changes.
- Dashboard summaries and reporting/export for sales, orders, products, customers and payments.

**Exit:** nontechnical staff can complete routine operations, content changes and exports; all protected actions are role-checked and auditable.

## Phase 7 — POS and receipts

**Goal:** serve walk-in customers quickly while keeping online inventory and reporting accurate.

**Work**
- Create focused cashier screen with fast search, product/category shortcuts, SKU/barcode lookup if practical, explicit colour/size choice and stock visibility.
- Add sale cart, customer optional, permitted discount, payment method, confirmation and clear success/error states.
- Record POS order against POS channel with cashier identity and a shared inventory location.
- Support cash and configured/manual payment methods; online gateway in-store only if BASNY requests and device flow is proven.
- Build branded receipt with order number, date/time, line items and variants, prices, discount, total, payment status/method, contact and return summary.
- Add print and reprint actions; validate using actual hardware and supported browser.
- Add sales channel filter to order search and reports.

**Exit:** cashier completes a walk-in sale quickly; stock changes for the exact variant and is reflected online; receipt can be printed/reprinted; cashier permissions and audit trail work.

## Phase 8 — Customer retention, SEO and analytics

**Goal:** support repeat purchasing and discoverability after core sales are dependable.

**Work**
- Wishlist across devices for signed-in customers, local persistence for guests if selected.
- Recently viewed products and related products.
- Product reviews with moderation, verified-purchase badge and business responses.
- Sitemap, robots rules, canonical URLs, redirects, product structured data and editable metadata.
- Add consent-aware analytics and events for product view, add-to-cart, checkout and verified purchase, with no payment secrets or unnecessary personal data.
- Optional Instagram feed only if current Meta access and maintenance are acceptable; otherwise use editable curated campaign tiles.
- Abandoned cart insights only with privacy-appropriate retention/consent; no automatic marketing enrollment.

**Exit:** SEO pages are indexable and valid; events match real server-confirmed purchases; wishlist/reviews honor access and privacy rules.

## Phase 9 — Quality, launch and handover

**Goal:** demonstrate all mandatory acceptance criteria and transfer confident operation to BASNY.

**Work**
- Verify all 16 brief acceptance cases plus the POS additions in a production-like environment.
- Test common Android/iPhone sizes, tablet/desktop, supported browsers, slow/interrupted connections and payment retry.
- Review performance with real-device measurements and correct image/layout/JS bottlenecks.
- Review security: roles, server authorization, rate limiting, inputs/uploads, webhook authenticity, secret handling and customer data exposure.
- Configure the production deployment, HTTPS, transactional email delivery, backups, monitoring and recovery runbook. BASNY supplies its domain and hosting; the project owner sets up the two included professional mailboxes when that domain is available.
- Load agreed launch products, policies, categories, delivery areas, contact/social data and campaigns.
- Train Super Admin, sales/order staff, inventory staff and content staff using their actual workflows.
- Hand over BASNY-owned credentials securely, operator guide, recovery steps, vendor/account boundaries and support window.

**Exit:** all mandatory acceptance cases passed and recorded; production settings/ownership are with BASNY; staff can run daily tasks; backup restoration path is documented/demonstrated.

## Scope boundary — production accounts

BASNY supplies production domain and hosting at handover. The project owner uses their Vercel and Resend accounts for review and includes setup of two professional business mailboxes after BASNY provides the domain. BASNY's SRS originally included first-year domain and hosting from the developer; obtain written acknowledgment of the changed responsibility. These items must be completed before public production launch on BASNY's domain.

## Fastest safe delivery order

Build in vertical slices that can be reviewed early: (1) landing + editable content, (2) catalog + exact variant stock, (3) guest checkout + verified payment + order handling, (4) admin roles/audit + delivery controls, (5) POS + shared stock + receipt, then (6) engagement/reporting/SEO refinements and launch hardening. The skipped Phase 0 proof moves stock, payment and receipt verification into the relevant build phases. Do not defer authorization or payment correctness just to make an early demo look finished.

## Cross-phase change control

When a new requirement appears, record its user value, affected screens/data/security, phase impact and acceptance test before adding it. Business values such as delivery prices and active delivery areas are configuration; capabilities such as a new carrier API are development scope and may need separate time/cost.

# BASNY ENTERPRISE — Phase 1 product and experience blueprint

**Status:** Working draft for business review. No application implementation is authorized by this document.

**Sources:** The [client SRS](BASNY-Client-SRS.txt), *BASNY ENTERPRISE — Full E Commerce Website, Developer Specification and Acceptance Requirements* (15 pages, supplied 23 September 2026); [BASNY Product and Engineering Plan](BASNY-Product-and-Engineering-Plan.md); and [Implementation Phases](BASNY-Implementation-Phases.md). The [acceptance traceability](PHASE_1_ACCEPTANCE_TRACEABILITY.md) preserves the client's 16 numbered cases. The [decision register](PHASE_1_DECISION_REGISTER.md) records conflicts and information still needed.

## 1. Agreed direction and scope

- BASNY operates from **Accra, Ghana** and will deliver **nationwide within Ghana**. International delivery is outside the current scope.
- All storefront prices, discounts, delivery fees, receipts, reports, and payment totals use **Ghana cedis (GHS)**. No USD amounts or currency conversion appear in the Ghana checkout. Store monetary amounts in integer pesewas and format them as GHS for display. Paystack expects amounts in a currency's subunit.
- Customer-facing dates, scheduled promotions, store hours, and daily reports use the **Africa/Accra** business timezone. Technical event timestamps retain an unambiguous instant for audit and reconciliation.
- Guests can browse and complete a purchase without registering. Accounts add saved addresses, order history, wishlist, and eligible reviews.
- The initial product families are Shoes, Bags, and Accessories. Staff can add categories and product options without rebuilding the store.
- Online and walk-in POS sales use one initial Accra stock location and the same sellable variant availability. They remain distinguishable as sales channels in orders and reports.
- Paystack is the selected online gateway, subject to BASNY account onboarding and verification of enabled Ghana methods. A browser redirect is never evidence that an order is paid.
- The visual direction is warm ivory (`#F8F6F1`), white (`#FFFFFF`), soft stone (`#E9E4DC`), near black (`#211D19`), warm grey (`#5F5952`), and a restrained deep bronze (`#755137`). Final brand assets and approval are pending.
- Use **Hugeicons** consistently for interface icons. Icons need visible labels or accessible names where their meaning is not obvious.
- Use short, purposeful feedback for selections and state changes. Motion must not delay checkout or obscure stock/payment state and must honor reduced-motion preferences.
- For review, the project owner intends to use their Vercel and Resend accounts. The client will supply the production domain and hosting later; the project owner will include two professional mailboxes once the domain is available. The SRS's first-year domain/hosting inclusion still needs BASNY's written agreement to this changed responsibility.

The selected architecture keeps the existing Next.js storefront and Hono/Better Auth/Neon/Drizzle foundation. BASNY's commerce rules will be built as modules on that foundation, with one shared stock ledger for online and POS sales. The earlier Medusa proposal is superseded by the project's no-paid-licence requirement and four restricted staff roles.

## 2. Launch catalogue and data sheet

| Family | Initial subcategories | Variation baseline | Notes |
| --- | --- | --- | --- |
| Shoes | Heels, Flats, Sandals, Sneakers, Slippers, Wedges, Office Shoes, Casual Shoes | Colour + size, including 35–42 initially | Size values remain extensible. Every sellable combination has its own SKU and stock. |
| Bags | Handbags, Shoulder Bags, Crossbody Bags, Tote Bags, Clutches, Mini Bags | Colour and other applicable options | Do not require a shoe size on bags. |
| Accessories | Staff-defined | Only options that affect the sellable item | Can expand without new code for every category. |

Each product needs a name, product code/SKU, category/subcategory, publication state, short and full descriptions, material/brand when applicable, GHS selling price, optional original/promotional price, ordered images, image alt text, merchandising flags, and SEO title/description. Each variant needs an option combination, unique SKU, price override if applicable, image association if applicable, stock quantity, low-stock threshold, and availability state. Orders retain a snapshot of purchased variant, name, SKU, price, discount, and quantity so later catalogue edits cannot rewrite historical orders or receipts.

The product import sheet should include these fields plus initial quantity and image filenames/URLs. BASNY must confirm the number of products included in initial setup and who supplies clean photos, descriptions, and stock counts.

## 3. Business rules

### Inventory and checkout

1. A colour/size combination with no available stock cannot be added to a new cart or purchased. Stock is checked again when the order is submitted; a cart is not a guarantee of availability.
2. Every stock adjustment records actor, reason, affected variant, prior quantity, new quantity, and time. Admin stock corrections are distinct from order reservations, fulfillment, cancellation, and return movements.
3. **Selected planning rule:** do not hold stock while a customer merely browses or fills the checkout form. At final order submission, validate exact variant stock, create an order in Awaiting Payment if payment is asynchronous, and reserve its stock atomically. For online Paystack payment, the initial payment window is 15 minutes; at that point reconcile with Paystack before releasing a hold. Enabled pay-on-pickup orders follow the separate collection deadline below, not the 15-minute payment window. Release on confirmed failure, abandonment, or cancellation. If an online payment succeeds after a hold has been released, flag it for staff resolution/refund rather than silently overselling. Payment retries reuse the order and cannot reserve or deduct twice. The 15-minute threshold and provider behavior must be validated in sandbox before launch.
4. Online and POS channels share the Accra physical stock location. A POS order records the cashier and exact variant. Reprint uses the immutable sale snapshot.
5. A refund does not automatically imply that an item is resellable. Return inspection or an authorized stock decision controls any restock.

### Nationwide Ghana delivery and pickup

1. Checkout supports delivery within Ghana. The project owner's starting rates are **GHS 60 for Accra** and **GHS 100 for locations outside Accra but within Ghana**. Super Admin can change each rate, zone boundary, active state, estimate, and applicable free-delivery rule in admin with an audit trail; checkout uses the active rate at order submission and preserves the charged fee on the order. BASNY must approve the precise Accra boundary and nationwide coverage before live orders.
2. Delivery address fields are region, city/town, area, street/address or descriptive location, landmark, phone, and optional instructions. A GhanaPost GPS address can be optional; it is not required for checkout.
3. The customer sees the selected area's exact GHS delivery fee and final total before submitting an order. If a location cannot be matched to an active fee, checkout must offer a clear staff-assisted quote path or block payment rather than charge an unknown amount. The final behavior requires approval.
4. The client SRS's Tema GHS 30, Accra GHS 40, and outside Greater Accra GHS 60 figures are **illustrations only**. The project owner's GHS 60/GHS 100 rates above supersede those examples for planning; BASNY signs off final rates and delivery estimates before launch. The GHS 100 zone includes Tema unless BASNY changes the zone boundary in admin.
5. Store pickup is requested by the client SRS. The preview may show **`DEMO ONLY — 1 Example Street, Osu, Accra`** as an editable sample address; it is not a real collection site and must be replaced with a verified BASNY address before live pickup orders. Hours, instructions, readiness timing, and any pickup fee are editable in admin. Pickup checkout cannot accept live orders while only the sample address is configured.
6. **Pay on pickup is disabled by default.** A Super Admin can enable it in admin for pickup orders only. Enabling it must display the collection deadline and unpaid-order policy to customers before submission. Other manual payment methods have separate switches.
7. If pay on pickup is enabled, order submission reserves the exact variant. Preparing the item and marking it Ready for Pickup are allowed while payment is still Awaiting Payment Verification. The proposed collection deadline is **48 hours after Ready for Pickup**, editable by authorized staff; send a reminder after 24 hours. At the deadline, if the order is still unpaid and uncollected, cancel it and release the reservation exactly once so online and POS customers can buy it. An authorized staff member may extend the deadline before expiry with an audited reason. A late customer must place a fresh order or POS sale against current stock; the expired order cannot silently reclaim the item.
8. Pickup settings are versioned on each order. Turning pay on pickup off stops new selections but does not alter existing unpaid pickup commitments. The no-show timer begins only when staff mark the order Ready for Pickup and the customer is notified; a failed reminder does not extend it. At handover, staff record and verify payment before marking Collected/Completed. Payment verification and expiry compete in one authoritative transaction: whichever commits first wins. Expiry cancels only an unpaid, uncollected order and releases its stock once; verified paid or collected orders cannot expire. Earlier staff cancellation also releases the hold. Cancellation, scheduled retries, and duplicate events cannot double-release stock. A customer arriving after expiry cannot collect the cancelled order. If readiness notification fails, staff must see an actionable alert and contact the customer; the deadline must not silently begin without a notification attempt and recorded outcome.

### Payments, orders, and returns

1. Card and Mobile Money options are displayed only when enabled for BASNY's Paystack account. Online transactions have unique references and server-verified amount, GHS currency, order link, method, and provider status. Signed webhooks and duplicate processing are handled safely.
2. Payment attempts are separate from the business order timeline. Payment states are Pending, Successful, Failed, Refunded, and Partially Refunded where supported. An abandoned/failed attempt never creates a falsely paid order.
3. Manual bank transfer, manual Mobile Money transfer, and pay-on-pickup are optional admin-enabled methods. They stay **Awaiting Payment Verification** until authorized staff verify or reject them. Any proof upload requires validation and access control.
4. Each order has a unique human-readable number, immutable item and total snapshots, contact/delivery snapshots, and an audit timeline. The proposed number pattern is `BAS-YYYY-NNNNNN`; exact display format is for BASNY approval.
5. The customer-facing timeline uses Pending, Awaiting Payment, Payment Confirmed, Processing, Ready for Dispatch, Dispatched, Ready for Pickup, Delivered, Completed, Cancelled, Returned, and Refunded. Payment status remains separate from fulfillment status, so an enabled pay-on-pickup order can be Ready for Pickup while still unpaid. Exact permitted transitions and who may make them are in section 6.
6. **Proposed returns policy:** allow a return or exchange request within **14 days after the customer receives the goods**. For eligible online sales, a customer may cancel without giving a reason during that period; the customer pays the direct cost of return delivery. A wrong, damaged, or defective item follows a separate claim path, with BASNY arranging or paying return delivery. BASNY records receipt and item condition before restocking; damaged items are not returned to sellable stock. Initiate an approved refund within seven business days of receiving the returned item, with final settlement depending on the payment provider. Do not use a blanket “unworn only” term to remove statutory cancellation rights. The final published policy and any lawful exceptions require BASNY/legal approval.
7. Return/exchange requests record the order item, exact variant, reason if volunteered or relevant to a defect claim, request date, requested remedy, review decision, resolution, refund amount or replacement, return-delivery charge, and stock decision.

## 4. Customer screen flows and states

| Screen | Main path | Required recovery and accessibility behavior |
| --- | --- | --- |
| Home | Find Shoes/Bags/Accessories, search, browse curated collections, contact BASNY on WhatsApp; optionally subscribe to a newsletter with explicit consent. | Editable campaign content, clear navigation and search, image alternatives, no autoplay motion that impedes browsing. Instagram content requires an approved integration; curated tiles are the fallback. |
| Category/collection | Filter by category, GHS price, size, colour, availability, new/best seller/sale; sort and open a product. | Show product count, active filters, reset action, loading/no-match states; preserve filters during navigation. |
| Search | Search name, category, SKU/product code, keywords. | Useful no-result guidance; search controls have labels and keyboard support. |
| Product detail | Inspect images, choose colour then an available size/variant, see GHS price and stock, add to cart or buy now. | Announce updated price/availability; unavailable variants disabled with explanation; do not infer stock from image alone. |
| Cart | Review exact variants, edit quantity/variant, remove items, apply coupon, see subtotal, estimated delivery, discount, and total. | Revalidate stale quantities and coupon rules; explain changed stock/price before proceeding. |
| Guest checkout | Enter contact, choose nationwide delivery area or approved Accra pickup, provide address/instructions, choose payment, review exact GHS total and consent. | Preserve entered data after interruption; inline errors; no hidden fees; show payment pending without claiming success. |
| Payment status | See Pending, Confirmed, or Failed after server verification. | Safe retry against the same order; refreshing or duplicate callbacks cannot duplicate order/stock movements. |
| Order confirmation/tracking | See order number, items, GHS totals, payment state, delivery/pickup summary, and status timeline. | Accessible even for guests through a safe order lookup/link design to be decided. |
| Customer account | Manage profile/addresses, orders, wishlist, eligible reviews. | Purchase remains possible without account creation; private data stays behind authentication. |
| Information pages | Read About, Contact, FAQs, Delivery, Returns/Exchange, Privacy, Terms. | Staff edits publish without deployment; legal/business content needs BASNY approval. |

### Micro-interaction specifications for the first design pass

| Interaction | Trigger and rule | Feedback | Motion and access |
| --- | --- | --- | --- |
| Variant selection | Customer selects colour/size; recompute the exact SKU, GHS price, image, and availability. | Selected border/check and adjacent text; add-to-cart state updates immediately. | Short colour/opacity change, no moving layout; keyboard and screen-reader state are explicit. |
| Add to cart | A stock-valid variant is submitted and the server accepts it. | Button acknowledges action; cart count and a short confirmation update. Error states name the cause. | Brief transition only after confirmation; no false success from an optimistic animation. |
| Filter changes | Customer changes or clears a filter. | Active filter chips and result count update; loading state if the request takes time. | Panel transitions stay short; reduced motion disables spatial movement. |
| Checkout submission | Customer submits a valid order/payment step. | Button enters processing state and prevents duplicate submission; pending/success/failure text follows server state. | No celebratory animation until verified payment; focus moves to the outcome message. |
| POS completion | Cashier completes an authorized, stock-valid sale. | Final GHS total, payment state, order number, and print/reprint action. | Instant, legible confirmation; receipt printing remains a deliberate action. |

## 5. Administration and POS screen flows

| Workspace | Primary staff tasks | Guardrail |
| --- | --- | --- |
| Overview | Review GHS revenue, orders needing action, low stock, best sellers, recent activity. | Reports define whether revenue means verified paid sales and how refunds are treated. |
| POS | Search SKU/name/barcode where practical, choose exact variant, check stock, collect payment, complete sale, print receipt. | Cashier identity, server authorization, shared stock, and duplicate-sale protection. |
| Orders | Search number/contact/reference; inspect snapshots, payment, delivery, timeline; update allowed statuses and notes. | Each transition is checked server-side and audited. |
| Products and inventory | Create/edit/archive products; upload/reorder images; manage options, prices, stock and thresholds. | No destructive edit to historical order data; adjustment reason required. |
| Delivery and pickup | Add/edit/activate Ghana delivery areas, GHS fees, estimates, free-delivery settings, and pickup details. | Invalid/missing rate cannot silently become zero; every change audited. |
| Promotions | Set percentage/fixed GHS discounts, eligibility, dates, limits, and caps. | Checkout enforces current rules on the server. |
| Customers, reviews, returns | See purchase context, moderate original review text, resolve return/exchange requests. | Customer private data and refunds restricted by role. |
| Content | Edit banners, feature order, pages, links, contact/social details, policies. | Preview and safe publishing; approved policy content required. |
| Reports and team | Filter/export sales, products, orders, customers, payment status; manage staff roles. | Export access restricted; role assignment only by Super Administrator. |

## 6. Proposed staff permissions and order transitions

The SRS names four staff roles. The matrix below is a **proposal** to review with BASNY, not a grant of access already implemented.

| Action | Super Admin | Sales/Order | Inventory | Content |
| --- | --- | --- | --- | --- |
| Create/deactivate staff, assign roles, change protected configuration | Yes | No | No | No |
| View and process orders, delivery, customer support | Yes | Yes | No | No |
| Verify manual payments | Yes | Yes, if explicitly assigned | No | No |
| Approve refunds and irreversible order adjustments | Yes | Request/recommend only | No | No |
| Run POS sale and reprint own/allowed receipts | Yes | Yes, if assigned cashier duty | No | No |
| Create/edit products, categories, prices, stock | Yes | No | Yes | No |
| Edit banners, pages, links, campaigns | Yes | No | No | Yes |
| Publish approved policies | Yes | No | No | Draft only |
| Moderate reviews and resolve returns | Yes | Yes, if assigned | No | No |
| View/export customer and payment reports | Yes | Limited to assigned work | No | No |
| View audit log | Yes | No | No | No |

Proposed prepaid delivery path: **Pending → Awaiting Payment → Payment Confirmed → Processing → Ready for Dispatch → Dispatched → Delivered → Completed**. Prepaid pickup follows **Processing → Ready for Pickup → Completed** after payment confirmation. If pay on pickup is enabled, the pickup path may be **Awaiting Payment → Processing → Ready for Pickup → Payment Confirmed → Completed**; staff must verify or record payment before handing over the item. The server/payment provider confirms online payment; authorized staff confirm manual payment. Sales/Order staff can advance operational statuses. Unpaid, uncollected pickup orders expire under section 3 and release stock exactly once; they cannot be completed or reactivated after expiry. Cancellation, return, and refund paths require a reason and follow payment/fulfillment rules. Refund approval is reserved for Super Admin pending BASNY approval. A cancelled order cannot later be dispatched; a refunded order remains in history. Payment status and order status are stored separately.

## 7. Quality, analytics, and content rules

- **Accessibility:** target WCAG 2.2 AA; readable contrast, visible keyboard focus, semantic controls, labelled Hugeicons, meaningful error text, large mobile tap targets, and reduced-motion support. Do not rely on colour alone for price, stock, payment, or selected state.
- **Mobile performance target:** at the 75th percentile of real mobile visits, LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1. These are proposed Core Web Vitals targets, not measurements of the current app. Establish image and JavaScript budgets during implementation against representative Ghana mobile connections.
- **Resilience:** loading, empty, offline/interrupted network, retry, pending payment, and failed payment states are part of the screen designs. Order and payment actions must survive refreshes and duplicate provider events. Expired payment windows trigger server reconciliation before stock is released.
- **Analytics event plan:** `page_view`, `view_item_list`, `view_item`, `search`, `select_variant`, `add_to_cart`, `remove_from_cart`, `begin_checkout`, `select_delivery`, `payment_started`, and `purchase_verified`. Purchase fires from confirmed server state once per order. Use GHS values; exclude card data, secrets, full addresses, and unnecessary personal information. Analytics provider and Meta Pixel activation require approval and privacy review.
- **Promotions:** support percentage and fixed-GHS discounts, product/category/store eligibility, minimum spend, maximum discount, total and per-customer limits, and start/end times in Africa/Accra. The server decides eligibility at checkout. An expired coupon cannot be kept valid by a stale cart.
- **Notifications:** plan email for registration, password reset, order received, payment confirmed, processing, dispatch, ready for pickup, delivered, cancellation, refund, and return decision. Every message must use the authoritative order/payment state, contain the correct GHS amount where relevant, and avoid exposing internal notes. Customer marketing email requires separate consent from transactional mail. SMS or WhatsApp automation remains a later provider decision.
- **Content ownership:** BASNY supplies approved logo, brand photography, product data, delivery terms, returns rules, policy text, contact/social channels, staff list, and initial product count. Staff edit routine banners, pages, fees, catalog, and promotions after launch.
- **Security:** admin permissions are enforced on every protected API action; important price, stock, payment, status, refund, product archive, content publish, and staff changes produce append-only audit events.

## 8. Phase 1 backlog and exit

| ID | Deliverable | Later build phase | Phase 1 pass condition |
| --- | --- | --- | --- |
| P1-01 | Approved category tree and product import template | 3 | BASNY confirms launch categories, variant fields, and initial product count/owner. |
| P1-02 | Approved Ghana delivery and Accra pickup rules | 5 | Nationwide coverage model, fees, timing, pickup details, and missing-rate behavior agreed. |
| P1-03 | Payment and stock lifecycle contract | 3, 5, 7 | Gateway methods, reservation start/expiry, cancellation/retry, and POS stock flow agreed. |
| P1-04 | Customer and admin screen states | 2–8 | Happy paths and the recovery states in sections 4–5 accepted. |
| P1-05 | Staff permission and audit matrix | 4, 6, 7 | BASNY approves each sensitive action and owner. |
| P1-06 | Visual, motion, and accessibility direction | 2 onward | Palette, approved assets, Hugeicons, micro-interactions, and accessibility criteria accepted. |
| P1-07 | Reporting and analytics definitions | 6, 8 | Revenue/refund definitions, exports, consent, and approved providers agreed. |
| P1-08 | Client acceptance traceability | 2–9 | All 16 SRS cases and POS additions have an owner, phase, and evidence plan. |
| P1-09 | Architecture and scope reconciliation | 2 onward | Hono/Drizzle selected; server-enforced roles, commerce-module boundaries, and infrastructure responsibilities recorded. |

Phase 1 is complete when the decision register's **blocking** items are resolved, BASNY approves the business rules and screens, and the acceptance matrix is accepted. Public documentation can inform architecture; actual Paystack account methods, receipt hardware, and stock race behavior still require integration and device verification in later phases.

## References for technical planning

- [Paystack API currency subunits](https://paystack.com/docs/api/)
- [Paystack Ghana payment channels](https://paystack.com/docs/payments/payment-channels/)
- [Core Web Vitals thresholds](https://web.dev/articles/vitals)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

# BASNY ENTERPRISE — Product, UX and Engineering Plan

**Status:** Planning baseline updated after the Phase 1 architecture decision. Later implementation phases must verify payment and stock behavior.

## Product ambition

Build a fast, polished, mobile-first fashion commerce platform for BASNY ENTERPRISE that customers can use confidently on typical Ghanaian mobile connections and that BASNY staff can operate without routine developer help. The platform sells women’s shoes, heels, bags and accessories online and to walk-in customers through a simple point-of-sale (POS) screen.

Speed and quality are product requirements: quick discovery, responsive pages, clear prices and delivery costs, reliable payment confirmation, accurate stock, low-friction cashier sales, and clear recovery when a network or payment attempt fails.

## Business scope

Product families include heels, flats, sandals, slippers, sneakers, wedges, office and casual shoes; handbags, shoulder bags, crossbody bags, totes, clutches and mini bags; accessories and future categories. Categories, attributes and collections must be extendable without a rebuild.

## Recommended technical direction

- **Commerce engine:** BASNY-specific modules in the existing Hono/Drizzle/PostgreSQL foundation; no paid commerce-platform licence.
- **Storefront:** Next.js App Router, React and TypeScript, with server-rendered/indexable product and category pages.
- **Admin and commerce API:** Hono routes with server-enforced staff roles and BASNY-specific admin screens and workflows. Better Auth provides identity, while authorization is checked on every protected action.
- **Data:** PostgreSQL; one initial physical stock location, with room to add locations later.
- **Media:** object storage and image delivery/CDN with responsive formats and sizes.
- **Payments:** Paystack is the selected online gateway, subject to BASNY merchant onboarding and sandbox/live-account verification. Keep the provider adapter replaceable for future changes.
- **Hosting (later phase):** application hosting and managed PostgreSQL are the recommended direction, with staging, backups, HTTPS, error monitoring and uptime checks. Procurement is deferred and excluded from the current scope.
- **Email:** transactional email service for receipts, account messages and order updates.
- **POS receipt:** print-optimized receipt via the browser print dialog for the initial release. Confirm the shop’s printer/device before promising silent or one-click thermal printing.
- **Architecture:** modular monolith initially. Keep modules cleanly separated in code; avoid distributed services until operational scale calls for them.

### Architecture decision and implementation gates

The project owner chose the existing Hono/Drizzle foundation after comparing it with Medusa. Medusa's built-in RBAC is Enterprise licensed, while BASNY requires four restricted staff roles. Building commerce in the current codebase keeps those permissions and the shared stock ledger under one server-owned design, at the cost of more custom development. Build and verify:

1. Server-enforced Super Admin, Sales/Order, Inventory and Content permissions for every relevant Hono route, with an audit trail. Hiding menu items is insufficient.
2. Transaction-safe variant stock and reservations shared by checkout and POS, including simultaneous last-item purchases, expiration and no-show release.
3. Ghana gateway support end-to-end, including GHS, Paystack methods enabled for BASNY, signed webhook verification, idempotent processing, retries and refunds.
4. Cashier POS, channel-aware reporting and receipt layout/printing on the intended device.
5. Delivery-zone and pickup settings, editable content, reviews, wishlist, returns, business reports, SEO and mobile performance.

These are later implementation gates. No Phase 0 application proof was authorized; Phase 1 defines the contracts and acceptance cases before implementation.

## Configuration versus custom development

The business values should be editable by authorized staff in admin, not embedded in source code. This includes:

- Delivery areas, fees, delivery timing/instructions, pickup availability and pickup instructions.
- Free-delivery campaigns and minimum eligible order amount.
- Product/category/collection setup, visibility, prices, promotional prices and stock thresholds.
- Homepage banners, links, featured products, campaign ordering and social/contact details.
- Coupons, usage limits, eligible products/categories, start and expiry dates.
- Store policies, FAQs, contact information and business hours.
- Payment methods enabled for the store (secret gateway credentials remain protected configuration, not editable plaintext fields).
- Admin accounts and roles (role assignment restricted to Super Admin).
- Agreed order and stock rules as controlled settings where safe.

Delivery locations, fee rules, delivery instructions, pickup availability and free-delivery thresholds are editable admin records with validation and audit history. Paystack merchant onboarding and protected gateway credentials, legal policy approval, deferred domain/hosting/business-mailbox setup and third-party account charges require business-owner participation.

### Deferred infrastructure and account scope

The project owner will use their Vercel and Resend accounts for review. BASNY will provide the production domain and hosting later; the project owner will include two professional business mailboxes once the domain is available. This differs from the client SRS's first-year domain/hosting inclusion and needs BASNY's written acknowledgment. Application deployment configuration and transactional email integration remain part of the technical plan. Record ownership, renewal responsibility and ongoing fees when services are procured.

## Product and inventory model

A sellable variant is one exact combination of selectable options. For shoes, colour + size is the baseline. Each combination has its own SKU and stock quantity; unavailable combinations cannot be purchased. Example: Black / size 38 and Nude / size 38 are distinct variants with independent stock. Support size sets from 35–42 initially and allow future sizes; avoid hard-coding the size range into the application.

Products include name, SKU/product code, category/subcategory, short/full description, material/brand where applicable, price, sale/original price, multiple ordered images, optional colour-specific media, publication state, merchandising flags, SEO title/description and alt text. Keep historical order-line snapshots so later catalog edits do not change old receipts or orders.

Start with one physical stock location and separate online and POS sales channels that share availability. Store every stock change as an adjustment event with reason and actor. Prevent overselling through server-side checks and database-safe workflows. The reservation point and timeout must be explicit. Recommended launch rule for simplicity: validate stock during checkout, reserve on successful order creation, release reservation on cancellation, decrement physical stock at fulfillment. If the business requires temporary holds from checkout start, add expiring reservations and a cleanup/reconciliation job and verify abandoned/failed-payment recovery.

## Payments and order lifecycle

Never treat the browser success redirect as proof of payment. Generate unique references; record provider, amount, currency, method, status, timestamps and gateway reference. Verify via server-side provider verification and/or signature-verified webhook. Handle duplicate/retried webhooks idempotently. Do not store card numbers or CVV.

Support online card/MoMo methods as enabled by BASNY’s provider account; manual transfer and pay-on-pickup remain awaiting verification until an authorized staff member confirms them. Failed or abandoned payments must not become paid orders. Provide a safe retry route without duplicate orders or stock deductions.

Preserve the required business lifecycle in a readable timeline: Pending, Awaiting Payment, Payment Confirmed, Processing, Ready for Dispatch, Dispatched, Ready for Pickup, Delivered, Completed, Cancelled, Returned and Refunded. Map underlying platform statuses to these business labels instead of forcing staff to understand internal engine terms. Record who changed each state, when, and internal notes.

Order number format should be human-readable (e.g. BAS + year + sequence), unique and concurrency-safe. Orders include immutable purchased variant, price, quantity, discount, delivery/pickup, payment, customer/contact and address snapshots.

## Customer experience and screen map

### Global storefront shell

- Compact announcement/campaign strip (editable).
- BASNY logo, primary category navigation, prominent search, account/wishlist/cart.
- Mobile navigation optimized for thumb reach; persistent access to search and cart.
- WhatsApp assistance link; product-specific enquiry includes product name/link and selected size/colour when applicable.
- Accessible footer with business contacts, policies and social links.

### Store screens

1. **Home:** editorial hero, category entry points, new arrivals, best sellers, featured products, active campaigns, optional social content, newsletter and WhatsApp support.
2. **Category/collection:** breadcrumb, title, product count, filter/sort controls and responsive product grid. Filters: category, price, size, colour, availability, new, best seller and sale. Sort: newest, price ascending/descending, popular and rating.
3. **Search:** query, useful suggestions if practical, filters, sorting, empty and no-match states; search product title, category, SKU and keywords.
4. **Product detail:** high-quality gallery/zoom, product title, price and sale indication, description/material/brand, colour and size selectors, variant image/availability, quantity, add-to-cart/buy-now, delivery/returns summary, WhatsApp enquiry, rating/reviews and related/recent items.
5. **Cart:** variant-specific lines, edit/remove, quantity validation, coupon, delivery estimate, subtotal, discounts and clear final total.
6. **Checkout:** guest-first flow for contact, delivery or pickup, address/landmark/instructions, payment method, consent and full order review. Keep steps short and preserve state across interruptions.
7. **Payment status:** distinct pending, successful and failed states with actionable next steps and safe retry.
8. **Confirmation/tracking:** order number, products, amount, payment state and progress timeline.
9. **Customer area:** profile, addresses, orders/tracking, wishlist and verified-purchase review submission. Registration must remain optional for purchase.
10. **Content pages:** About, Contact, FAQs, Delivery, Returns/Exchange, Privacy, Terms.

### Admin screens

1. **Overview:** today/month revenue and orders, average order value, orders requiring attention, low stock, best sellers and recent activity.
2. **POS:** fast cashier product search/grid, SKU/barcode lookup if practical, size/colour selection, stock visibility, cart, customer optional, allowed discount, payment method, complete sale and receipt.
3. **Orders:** search by order number/name/phone/email/payment reference; filters; detail workspace with timeline, status actions, payment, fulfillment/delivery, customer info, internal notes and printable order summary.
4. **Products:** list/search, create/edit/archive, media ordering, categories, options, variants, SKU, per-variant pricing/stock, merchandising flags and SEO.
5. **Inventory:** quantity per variant/location, low/out-of-stock views, adjustment reason, reservation visibility and CSV import/export where verified.
6. **Categories and collections:** create/edit/reorder/hide/archive with safe deletion controls.
7. **Delivery and pickup:** editable areas, fees, timing, free delivery rules, pickup details and activation.
8. **Promotions:** coupons and scheduled sales with eligibility, thresholds, limits, dates and usage.
9. **Customers and reviews:** purchase history, support context, review moderation, business response and verified-purchase badge.
10. **Returns/exchanges:** request, review, decision, resolution and stock/refund linkage.
11. **Content:** banners, destination links, featured products, pages, contact/social data and policy pages.
12. **Reports:** daily/weekly/monthly/custom range sales, products, orders, customers and payment status; export to CSV/Excel as accepted.
13. **Team/settings:** staff users/roles, permission matrix, payment/delivery configuration and immutable audit log.

## Luxury-modern UI direction

- Warm ivory/soft stone surfaces, near-black typography and one restrained bronze/brass accent; avoid visual clutter and excessive gold gradients.
- Premium editorial photography with consistent crops and generous breathing room.
- Elegant display type for campaign headlines, highly legible sans serif for product names, prices, filters and checkout.
- Strong typographic hierarchy and visible price/discount/stock information.
- Product cards show useful colour cues and price without turning into dense labels.
- Clear size availability and selected state; explain why unavailable sizes are disabled.
- Checkout is calm, short, transparent about fees and usable one-handed on a phone.
- Accessible contrast, keyboard focus, screen-reader labels, reduced-motion support and large tap targets.
- Motion is subtle and never blocks product browsing or checkout.

## Performance and quality targets

- Mobile-first and designed for typical Ghanaian mobile data; compress and resize all product imagery, lazy-load below the fold and reserve image dimensions to prevent layout shifts.
- Server-render/SEO-render key product, category and campaign content; cache safely and invalidate content/prices/stock changes appropriately.
- Keep storefront JS lean; avoid shipping admin code or unnecessary UI libraries to storefront pages.
- Paginate or progressively load catalog and admin tables; avoid loading all products at once.
- Show explicit loading, empty, offline/network error, payment pending/failure and retry states.
- Measure real-device Core Web Vitals and checkout completion; target strong mobile LCP/CLS/INP and establish numeric budgets during the implementation spike.
- Use HTTPS, secure password/session management, rate limiting, input validation, output encoding, secure upload checks, least-privilege server permissions, webhook signature verification, secrets management and tested backups/restoration.

## Core modules and boundaries

- Catalog/content module: products, collections, categories, media, pages, campaigns, SEO.
- Variant/inventory module: option values, SKU, stock by location, adjustments, reservations and low-stock thresholds.
- Cart/checkout module: guest/customer carts, coupon eligibility, delivery/pickup, totals and consent.
- Payment module: provider adapter, manual payment verification, transaction attempts, refunds and webhook idempotency.
- Order/fulfillment module: lifecycle mapping, sequence number, status history, delivery and return/exchange requests.
- POS module: cashier UI, POS channel, shared inventory, payment capture/recording and receipt.
- Identity/access module: customer accounts and staff authentication, BASNY roles and server authorization.
- Reviews/engagement module: verified reviews, moderation, wishlist and optional abandoned-cart records with privacy controls.
- Reporting/audit module: operational summaries, exports and append-only sensitive-action history.
- Notifications module: order/account emails; SMS/WhatsApp API can be added later subject to provider setup/fees.

Keep modules in one deployable product initially, with clear contracts and workflows. Avoid separate services unless needed for scale or vendor isolation.

## Acceptance baseline

The 16 acceptance cases in the client brief remain the release gate. Before implementation sign-off, copy each case into a traceability checklist with its planned phase, pass criteria and evidence owner; Phase 9 records the result. Add POS-specific cases:

1. Cashier searches for a product, chooses the exact colour/size, completes a walk-in sale and receives the correct receipt.
2. POS sale reduces availability for the same variant in the online store.
3. Two near-simultaneous attempts to buy the final unit cannot oversell it.
4. Receipt can be reprinted from the order detail and matches immutable order data.
5. A cashier cannot perform restricted refunds/price edits/stock changes unless granted those permissions; server denies unauthorized direct requests.
6. Manual payment remains unverified until an authorized staff action; audit history records it.
7. Delivery fees, delivery area activation, pickup and free-delivery thresholds change through admin without a developer deployment.
8. Promotion dates/limits are enforced server-side at checkout.
9. Failed, pending, duplicated and retried payment events do not create false paid orders or duplicate stock operations.
10. Backups and restoration are documented and demonstrated.

## Explicit assumptions and decisions still needed

These are business/configuration decisions, not implementation tasks the owner needs to code:

- BASNY supplies production domain and hosting later; the project owner includes two professional mailboxes. Providers, ownership and costs must be settled before public production launch, with BASNY's written acknowledgment of the SRS change.
- Paystack is selected. BASNY must complete merchant onboarding and confirm which Ghana payment channels are enabled for launch; the integration must be verified in sandbox and against the live merchant account before accepting real payments.
- Final business brand assets.
- Approved logo/brand colors and final photography direction.
- Paystack merchant onboarding, approved methods and provider agreement.
- Delivery regions/areas, actual fees, time estimates, pickup location and service hours. Admins configure and maintain locations and prices after implementation.
- Return/exchange eligibility, time window and refund process.
- Initial product count, structured SKU/variant/stock data and who provides product photos/copy.
- Staff list and role assignments.
- Stock reservation rule and timeout.
- Receipt printer, operating device and whether browser print-dialog operation is acceptable.
- Analytics provider, privacy choices and launch support window.

## Delivery/handover

Provide BASNY-owned admin access and Paystack integration handover, initial configured products/pages/delivery areas, staff training, basic operator guide, deployment and backup/recovery notes, and credentials handover through a secure process. BASNY provides its production domain and hosting; the project owner includes two professional mailboxes once the domain is available. Document setup and ownership before go-live. Paystack transaction fees and any future service renewals must be stated separately. Legal policy content requires BASNY approval.

## Research references

The Medusa links below document the earlier comparison; Medusa is not the selected engine.

- Medusa POS recipe: https://docs.medusajs.com/resources/recipes/pos
- Medusa product variant inventory: https://docs.medusajs.com/resources/commerce-modules/product/variant-inventory
- Medusa inventory reservation lifecycle: https://docs.medusajs.com/resources/commerce-modules/inventory/reservations-lifecycle
- Medusa order module: https://docs.medusajs.com/resources/commerce-modules/order
- Medusa custom payment provider: https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider
- Medusa RBAC Enterprise license notice: https://github.com/medusajs/medusa/blob/develop/ENTERPRISE-LICENSE.md
- Paystack Ghana payment channels: https://paystack.com/docs/payments/payment-channels/
- Paystack verify transactions: https://paystack.com/docs/payments/verify-payments/
- Paystack webhooks: https://paystack.com/docs/payments/webhooks/
- Community Medusa Paystack provider (must be version- and behavior-verified): https://github.com/a11rew/medusa-payment-paystack
- Browser print styling: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing

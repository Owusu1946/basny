type CheckoutLoadingVariant = "delivery" | "review" | "payment" | "verification" | "confirmation";

const copy: Record<CheckoutLoadingVariant, { eyebrow: string; title: string; description: string }> = {
  delivery: { eyebrow: "CHECKOUT · DELIVERY", title: "Preparing your checkout", description: "Checking your bag and loading the delivery options for your order." },
  review: { eyebrow: "CHECKOUT · REVIEW", title: "Loading your order", description: "Gathering your selected items and delivery details." },
  payment: { eyebrow: "CHECKOUT · PAYMENT", title: "Preparing secure payment", description: "Retrieving your saved order before connecting to Paystack." },
  verification: { eyebrow: "PAYSTACK · SECURE CHECK", title: "Confirming your payment", description: "Paystack is verifying the transaction. Keep this page open while we confirm the result." },
  confirmation: { eyebrow: "BASNY · ORDER DETAILS", title: "Loading your order", description: "Retrieving the latest details and status for your order." },
};

function SummarySkeleton() {
  return <aside className="checkout-loading__summary" aria-hidden="true"><i className="checkout-loading__short" /><b /><span /><span /><span /><hr /><span /><strong /></aside>;
}

function ContentSkeleton({ variant }: { variant: CheckoutLoadingVariant }) {
  if (variant === "verification") return <section className="checkout-loading__verification" aria-hidden="true"><span className="checkout-loading__spinner" /><div className="checkout-loading__stages"><i className="is-done">Payment submitted</i><i className="is-active">Checking with Paystack</i><i>Finalizing your order</i></div><div className="checkout-loading__verification-card"><b /><span /><span /></div></section>;
  if (variant === "confirmation") return <section className="checkout-loading__confirmation" aria-hidden="true"><div className="checkout-loading__confirmation-mark" /><div className="checkout-loading__reference"><span /><b /></div><div className="checkout-loading__item"><i /><span><b /><small /></span><strong /></div><div className="checkout-loading__item"><i /><span><b /><small /></span><strong /></div><div className="checkout-loading__detail"><b /><span /><span /></div><div className="checkout-loading__total"><span /><strong /></div></section>;
  return <div className="checkout-loading__layout" aria-hidden="true"><section className="checkout-loading__main"><div className="checkout-loading__panel-heading"><i /><span><b /><small /></span></div>{variant === "delivery" ? <><div className="checkout-loading__choice" /><div className="checkout-loading__choice" /></> : <><div className="checkout-loading__item"><i /><span><b /><small /></span><strong /></div><div className="checkout-loading__item"><i /><span><b /><small /></span><strong /></div></>}<div className="checkout-loading__fields"><span /><span /><span /><span /></div></section><SummarySkeleton /></div>;
}

export function CheckoutLoadingState({ variant }: { variant: CheckoutLoadingVariant }) {
  const text = copy[variant];
  const confirmation = variant === "confirmation";
  return <main className={`${confirmation ? "confirmation-page" : "checkout-page"} page-shell checkout-loading`} aria-busy="true" aria-label={text.title}>
    <div className="checkout-loading__heading"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.description}</p></div>
    {variant !== "verification" && variant !== "confirmation" && <div className="checkout-loading__steps" aria-hidden="true"><i className="is-done">Bag</i><i className={variant === "delivery" ? "is-active" : "is-done"}>Delivery</i><i className={variant === "review" ? "is-active" : variant === "payment" ? "is-done" : ""}>Review</i><i className={variant === "payment" ? "is-active" : ""}>Payment</i></div>}
    <ContentSkeleton variant={variant} />
    <p className="checkout-loading__status" role="status">{text.description}</p>
  </main>;
}

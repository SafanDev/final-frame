import LinkButton from "@/components/ui/LinkButton";

export default function HomeCTA() {
  return (
    <section className="ff-container ff-home-cta-wrap" aria-labelledby="home-cta-title">
      <div className="ff-home-cta">
        <div className="ff-home-cta-status" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="ff-eyebrow">Ready when the work is</p>
          <h2 id="home-cta-title">Start the next review cleanly.</h2>
        </div>
        <LinkButton href="/register" variant="primary" size="md">
          Create account
        </LinkButton>
      </div>
    </section>
  );
}

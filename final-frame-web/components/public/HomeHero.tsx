import LinkButton from "@/components/ui/LinkButton";
import ReviewPreview from "@/components/public/ReviewPreview";

export default function HomeHero() {
  return (
    <section className="ff-container ff-home-hero" aria-labelledby="home-title">
      <div className="ff-home-intro">
        <div className="ff-home-index" aria-hidden="true">
          <span>01</span>
          <span>Review</span>
        </div>

        <div className="ff-home-copy">
          <p className="ff-home-signal">
            <span className="ff-live-dot" aria-hidden="true" />
            Feedback, right on the work
          </p>
          <h1 id="home-title">
            <span>Review the work.</span>
            <span>Make the call.</span>
          </h1>
          <p className="ff-home-lede">
            Pin feedback, compare versions, and approve the final.
          </p>

          <div className="ff-home-actions">
            <LinkButton href="/register" variant="primary" size="md">
              Create account
            </LinkButton>
            <LinkButton href="/login" variant="secondary" size="md">
              Sign in
            </LinkButton>
          </div>
        </div>

        <div className="ff-home-loop" aria-label="FinalFrame review flow">
          <span><b>01</b> Work</span>
          <span><b>02</b> Feedback</span>
          <span><b>03</b> Decision</span>
        </div>
      </div>

      <div className="ff-home-demo-wrap">
        <div className="ff-home-demo-note" aria-hidden="true">
          <span>Live review</span>
          <span>Try the controls</span>
        </div>
        <ReviewPreview />
      </div>
    </section>
  );
}

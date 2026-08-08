import ReviewPreview from "@/components/public/ReviewPreview";
import { getButtonClassName } from "@/components/ui/buttonStyles";

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
            <a href="/register" className={getButtonClassName("primary", "md")}>
              Create account
            </a>
            <a href="/login" className={getButtonClassName("secondary", "md")}>
              Sign in
            </a>
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
          <span>Review preview</span>
        </div>
        <div className="ff-home-demo-mobile" aria-label="FinalFrame review preview">
          <div>
            <span className="ff-live-dot" aria-hidden="true" />
            <strong>Campaign launch</strong>
          </div>
          <span className="ff-status-chip">In review</span>
          <p>Versioned work, pinned feedback, and a clear client decision.</p>
        </div>
        <div className="ff-home-demo-full">
          <ReviewPreview />
        </div>
      </div>
    </section>
  );
}

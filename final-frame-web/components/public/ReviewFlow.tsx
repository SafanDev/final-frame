const steps = [
  { number: "01", title: "Share", description: "Bring in the latest work." },
  { number: "02", title: "Review", description: "Keep feedback on the frame." },
  { number: "03", title: "Refine", description: "Move forward without losing history." },
  { number: "04", title: "Decide", description: "Close the loop clearly." },
] as const;

export default function ReviewFlow() {
  return (
    <section className="ff-container ff-home-flow" aria-labelledby="review-flow-title">
      <div className="ff-home-section-intro">
        <p className="ff-eyebrow">One continuous review</p>
        <h2 id="review-flow-title">Nothing gets lost between versions.</h2>
        <div className="ff-flow-readout">
          <span>01</span>
          <p>One place for the file and its versions.</p>
        </div>
      </div>

      <ol className="ff-home-flow-list">
        {steps.map((step, index) => (
          <li key={step.number} className={index === 0 ? "is-active" : undefined}>
            <div className="ff-flow-step">
              <span className="ff-flow-number">{step.number}</span>
              <span className="ff-flow-copy">
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
              <span className="ff-flow-arrow" aria-hidden="true">↗</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

const steps = [
  { number: "01", title: "Share", description: "Bring in the latest work.", detail: "One place for the file and its versions." },
  { number: "02", title: "Review", description: "Keep feedback on the frame.", detail: "Pins keep every note attached to the right context." },
  { number: "03", title: "Refine", description: "Move forward without losing history.", detail: "Previous versions stay close when the direction changes." },
  { number: "04", title: "Decide", description: "Close the loop clearly.", detail: "The final answer is recorded with the final work." },
] as const;

export default function ReviewFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const active = steps[activeStep];

  return (
    <section className="ff-container ff-home-flow" aria-labelledby="review-flow-title">
      <div className="ff-home-section-intro">
        <p className="ff-eyebrow">One continuous review</p>
        <h2 id="review-flow-title">Nothing gets lost between versions.</h2>
        <div className="ff-flow-readout">
          <span>{active.number}</span>
          <p>{active.detail}</p>
        </div>
      </div>

      <ol className="ff-home-flow-list">
        {steps.map((step, index) => (
          <li key={step.number} className={cn(index === activeStep && "is-active")}>
            <button
              type="button"
              onClick={() => setActiveStep(index)}
              onMouseEnter={() => setActiveStep(index)}
              aria-pressed={index === activeStep}
            >
              <span className="ff-flow-number">{step.number}</span>
              <span className="ff-flow-copy">
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
              <span className="ff-flow-arrow" aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

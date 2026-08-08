const files = [
  { name: "Hero direction", version: "v4", variant: "hero" },
  { name: "Mobile frame", version: "v3", variant: "mobile" },
  { name: "Story crop", version: "v2", variant: "story" },
] as const;

const comments = [
  { marker: 1, author: "Trisha", copy: "Give the headline a little more air." },
  { marker: 2, author: "Nithya", copy: "This direction is ready to approve." },
] as const;

export default function ReviewPreview() {
  return (
    <div className="ff-review-preview" aria-label="FinalFrame review preview">
      <div className="ff-review-preview-topbar">
        <div className="ff-preview-project">
          <span className="ff-live-dot" aria-hidden="true" />
          <div>
            <strong>Campaign launch</strong>
            <span>Review round 4</span>
          </div>
        </div>
        <span className="ff-status-chip">In review</span>
      </div>

      <div className="ff-review-preview-grid">
        <aside className="ff-review-files" aria-label="Preview files">
          <p className="ff-preview-section-label">Files</p>
          <div className="ff-preview-file-list">
            {files.map((item, index) => (
              <div
                key={item.name}
                className={`ff-preview-file${index === 0 ? " is-active" : ""}`}
              >
                <span className={`ff-preview-file-thumb is-${item.variant}`} aria-hidden="true" />
                <span className="ff-preview-file-copy">
                  <strong>{item.name}</strong>
                  <small>{item.version}</small>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <div className="ff-review-stage">
          <div className="ff-review-artboard is-hero">
            <span className="ff-artboard-kicker">NORTH / 24</span>
            <h2>Make the next frame matter.</h2>
            <div className="ff-artboard-shapes" aria-hidden="true">
              <span />
              <span />
            </div>
            <span className="ff-preview-pin pin-one" aria-hidden="true">1</span>
            <span className="ff-preview-pin pin-two" aria-hidden="true">2</span>
            <span className="ff-artboard-hint" aria-hidden="true">Pinned feedback</span>
          </div>

          <div className="ff-review-stage-tools" aria-hidden="true">
            <span className="is-active">Fit</span>
            <span>100%</span>
            <span>Compare</span>
          </div>
        </div>

        <aside className="ff-review-feedback" aria-label="Preview feedback">
          <div className="ff-preview-feedback-head">
            <p className="ff-preview-section-label">Feedback</p>
            <span>{comments.length} open</span>
          </div>
          <div className="ff-preview-comment-list">
            {comments.map((comment) => (
              <div className="ff-preview-comment" key={`${comment.marker}-${comment.author}`}>
                <span>{String(comment.marker).padStart(2, "0")}</span>
                <div>
                  <strong>{comment.author}</strong>
                  <p>{comment.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="ff-preview-approval">
            <span>Final decision</span>
            <strong>Waiting for client</strong>
            <span className="ff-preview-approval-action" aria-hidden="true">Approve frame</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

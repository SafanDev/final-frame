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

      <div className="ff-review-preview-body">
        <div className="ff-review-artboard" aria-hidden="true">
          <span className="ff-artboard-kicker">NORTH / 24</span>
          <strong>Make the next frame matter.</strong>
          <span className="ff-preview-pin pin-one">1</span>
          <span className="ff-preview-pin pin-two">2</span>
        </div>

        <div className="ff-review-preview-summary" aria-label="Review status summary">
          <div>
            <span>Files</span>
            <strong>3 versions</strong>
          </div>
          <div>
            <span>Feedback</span>
            <strong>2 open</strong>
          </div>
          <div>
            <span>Decision</span>
            <strong>Waiting</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

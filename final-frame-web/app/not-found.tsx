import LinkButton from "@/components/ui/LinkButton";

export default function NotFound() {
  return (
    <main className="ff-container ff-system-state" aria-labelledby="not-found-title">
      <div className="ff-system-state-copy">
        <p className="ff-system-state-code">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The address may be incorrect, expired, private, or no longer available.</p>
        <div className="ff-system-actions">
          <LinkButton href="/" variant="secondary">Home</LinkButton>
          <LinkButton href="/login" variant="primary">Sign in</LinkButton>
        </div>
      </div>
    </main>
  );
}

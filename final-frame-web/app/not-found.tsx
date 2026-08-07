import EmptyState from "@/components/ui/EmptyState";
import LinkButton from "@/components/ui/LinkButton";

export default function NotFound() {
  return (
    <section className="ff-container flex min-h-[65vh] items-center justify-center py-12">
      <div className="w-full max-w-2xl">
        <EmptyState
          icon={<span className="font-black" aria-hidden="true">404</span>}
          title="Page not found"
          description="The address may be incorrect, expired, private, or no longer available. Return to the public FinalFrame overview or sign in to reach protected workspaces."
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/" variant="secondary">
                View FinalFrame
              </LinkButton>
              <LinkButton href="/login" variant="primary">
                Sign in
              </LinkButton>
            </div>
          }
        />
      </div>
    </section>
  );
}

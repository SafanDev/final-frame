import type { MouseEvent } from "react";
import Button from "@/components/ui/Button";

interface DashboardHeaderProps {
  firstName: string;
  onCreate: (event: MouseEvent<HTMLButtonElement>) => void;
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function DashboardHeader({ firstName, onCreate }: DashboardHeaderProps) {
  return (
    <header className="ff-dashboard-header" aria-labelledby="dashboard-title">
      <div className="ff-dashboard-heading-copy">
        <p className="ff-dashboard-kicker">Welcome back, {firstName}</p>
        <h1 id="dashboard-title">Projects</h1>
        <p className="ff-dashboard-welcome">Open a review or start something new.</p>
      </div>

      <Button variant="primary" size="md" onClick={onCreate} className="ff-dashboard-create">
        <PlusIcon />
        New project
      </Button>
    </header>
  );
}

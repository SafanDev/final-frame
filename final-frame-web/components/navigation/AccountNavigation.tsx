import Button from "@/components/ui/Button";
import NavItem from "@/components/navigation/NavItem";

interface AccountNavigationProps {
  pathname: string;
  displayName: string;
  isSigningOut: boolean;
  onSignOut: () => void;
}

export default function AccountNavigation({
  pathname,
  displayName,
  isSigningOut,
  onSignOut,
}: AccountNavigationProps) {
  return (
    <>
      <NavItem href="/app" active={pathname === "/app"}>
        Projects
      </NavItem>
      <NavItem href="/notifications" active={pathname === "/notifications"}>
        Inbox
      </NavItem>
      <NavItem href="/account" active={pathname === "/account"}>
        Account
      </NavItem>
      <div className="ff-nav-divider" aria-hidden="true" />
      <div className="ff-nav-identity" title={displayName}>
        <span className="ff-nav-presence" aria-hidden="true" />
        <span className="truncate">{displayName}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignOut}
        loading={isSigningOut}
        loadingLabel="Signing out…"
        className="ff-nav-signout"
      >
        Sign out
      </Button>
    </>
  );
}

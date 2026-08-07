import LinkButton from "@/components/ui/LinkButton";
import NavItem from "@/components/navigation/NavItem";

export default function GuestNavigation({ pathname }: { pathname: string }) {
  return (
    <>
      <NavItem href="/login" active={pathname === "/login"}>
        Sign in
      </NavItem>
      <LinkButton href="/register" variant="primary" size="sm" className="ff-nav-primary">
        Create account
      </LinkButton>
    </>
  );
}

import ProductProviders from "@/components/ProductProviders";
import "../../../styles/workspace.css";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductProviders>{children}</ProductProviders>;
}
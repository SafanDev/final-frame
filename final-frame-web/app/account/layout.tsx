import ProductProviders from "@/components/ProductProviders";
import "../../styles/product.css";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductProviders>{children}</ProductProviders>;
}
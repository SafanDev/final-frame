import ProductProviders from "@/components/ProductProviders";
import "../../styles/product.css";

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductProviders>{children}</ProductProviders>;
}
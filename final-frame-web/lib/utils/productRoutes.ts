const productRoots = ["/app", "/account", "/notifications"] as const;

export function isProductRoute(pathname: string) {
  return productRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

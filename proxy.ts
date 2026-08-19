// Next.js 16 middleware entry point — delegates to src/proxy.ts
export { proxy } from "./src/proxy";

export const config = {
  matcher: ["/:path*"],
};

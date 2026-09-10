import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casa Sonia — Compras",
    short_name: "CS Compras",
    description: "Sistema de órdenes de compra Casa Sonia",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1b1e",
    theme_color: "#1a1b1e",
    orientation: "portrait",
    screenshots: [
      {
        src: "/screenshots/desktop.png",
        sizes: "2538x1212",
        type: "image/png",
        form_factor: "wide",
        label: "Órdenes de compra",
      },
      {
        src: "/screenshots/mobile.png",
        sizes: "684x951",
        type: "image/png",
        form_factor: "narrow",
        label: "Órdenes de compra",
      },
    ],
    icons: [
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icons/icon-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/icons/icon-167.png", sizes: "167x167", type: "image/png", purpose: "any" },
      { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

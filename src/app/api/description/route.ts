import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";

type Sucursal = "Ruta" | "Centro" | "El Estribo" | "Quiver";

interface DescriptionRequest {
  name: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  season?: string;
  gender?: string;
  design?: string;
  cut?: string;
  material?: string;
  composition?: string;
  colorProveedor?: string;
  warehouseIds: number[];
  userHint?: string;
}

// Odoo warehouse IDs (confirmed from stock.warehouse)
const WAREHOUSE_ID: Record<Sucursal, number> = {
  Ruta: 1,
  Centro: 2,
  Quiver: 3,
  "El Estribo": 5,
};

// Priority order for tone resolution when multiple sucursales selected
const SUCURSAL_PRIORITY: Sucursal[] = ["Ruta", "Centro", "El Estribo", "Quiver"];

const TONE_MAP: Record<Sucursal, string> = {
  Ruta: "Cálido y familiar — dirigite al cliente con calidez, como si fuera un conocido de confianza.",
  Centro: "Cálido y familiar — dirigite al cliente con calidez, como si fuera un conocido de confianza.",
  "El Estribo": "Elegante y formal — usá un registro sofisticado, evitá coloquialismos, transmití exclusividad.",
  Quiver: "Dinámico y moderno — usá un tono fresco, energético y actual, apuntá a un público joven.",
};

function resolveTone(ids: number[]): string {
  for (const s of SUCURSAL_PRIORITY) {
    if (ids.includes(WAREHOUSE_ID[s])) return TONE_MAP[s];
  }
  return TONE_MAP["Ruta"]; // fallback
}

function buildSystemPrompt(tone: string): string {
  return `Sos un copywriter experto en e-commerce de indumentaria y especialista en SEO.
Tu objetivo es redactar una descripción de producto persuasiva que ayude a los clientes a encontrar el artículo en Google y los motive a comprarlo online.

Tono: ${tone}

Idioma: Español rioplatense (Argentina), usando "vos" en lugar de "tú".

Estructura obligatoria (usar HTML):
1. Título atractivo: <h1>...</h1>
2. Párrafo descriptivo emocional (máx. 4 líneas) en <p>...</p> que conecte los datos del producto para impulsar la venta. NO incluyas el SKU en este párrafo.
3. Ficha técnica en lista: <ul><li>Corte: ...</li><li>Material: ...</li>...</ul> usando los datos provistos.
4. Call to Action en <p><strong>...</strong></p> que invite a añadir el producto al carrito.

Reglas SEO: Integrá palabras clave naturales relacionadas con la compra de ropa online.

Búsqueda web (condicional): Si conocés con 100% de certeza información adicional sobre exactamente este artículo en la web, podés incorporarla. Si hay alguna duda, limitarte estrictamente a los datos provistos.

Formato de salida: Solo el HTML de la descripción. Sin markdown, sin bloques de código, sin comillas externas, sin explicaciones.`;
}

function buildUserMessage(data: DescriptionRequest): string {
  const lines: string[] = ["Datos del Producto:"];

  lines.push(`Nombre: ${data.name}`);
  if (data.sku) lines.push(`Código referencia/SKU: ${data.sku}`);
  if (data.barcode) lines.push(`Código de barra: ${data.barcode}`);
  if (data.brand) lines.push(`Marca: ${data.brand}`);
  if (data.season) lines.push(`Temporada: ${data.season}`);
  if (data.gender) lines.push(`Género: ${data.gender}`);
  if (data.design) lines.push(`Diseño: ${data.design}`);
  if (data.cut) lines.push(`Corte: ${data.cut}`);
  if (data.material) lines.push(`Material: ${data.material}`);
  if (data.composition) lines.push(`Composición: ${data.composition}`);
  if (data.colorProveedor) lines.push(`Color proveedor: ${data.colorProveedor}`);
  if (data.userHint?.trim()) lines.push(`Contexto adicional del vendedor: ${data.userHint.trim()}`);

  lines.push("\nGenerá la descripción siguiendo la estructura indicada.");

  return lines.join("\n");
}

export const POST = withAuth(async (req: NextRequest) => {
  let body: DescriptionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body inválido" }, { status: 400 });
  }

  const tone = resolveTone(body.warehouseIds ?? []);
  const systemPrompt = buildSystemPrompt(tone);
  const userMessage = buildUserMessage(body);

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-nano";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://casasonia.com",
        "X-Title": "Casa Sonia Compras",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 700,
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { error?: { message?: string } })?.error?.message ||
          `OpenRouter error: ${response.status}`,
      );
    }

    const data = await response.json();
    const description = (data as { choices?: { message?: { content?: string } }[] })
      .choices?.[0]?.message?.content?.trim();

    if (!description) {
      throw new Error("No se recibió descripción del modelo");
    }

    return NextResponse.json({ description });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generando descripción" },
      { status: 500 },
    );
  }
}, { roles: ["ADMIN", "MANAGER"] });

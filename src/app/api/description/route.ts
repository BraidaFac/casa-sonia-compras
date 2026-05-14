import { NextRequest, NextResponse } from "next/server";

interface DescriptionRequest {
  productName: string;
  brand: string;
  colors: string[];
  userHint: string;
}

const SYSTEM_PROMPT = `Sos un experto en marketing digital y redacción de contenido para e-commerce argentino.
Tu trabajo es escribir descripciones de productos atractivas, persuasivas y con buen tono de venta online.

Reglas:
- Escribí en español rioplatense (Argentina), usando "vos" en lugar de "tú"
- Usá emojis relevantes para hacer el texto más visual y atractivo
- El tono debe ser amigable, entusiasta y enfocado en los beneficios del producto
- La descripción debe tener entre 3 y 5 párrafos cortos
- Incluí una llamada a la acción al final (ej: "¡No te lo pierdas!", "Sumalo a tu carrito")
- Si hay colores disponibles, mencionalos de forma natural en el texto
- Si el usuario da una sugerencia o contexto, incorporala naturalmente en la descripción
- No uses frases genéricas vacías como "producto de alta calidad"
- No menciones precios ni talles en la descripción
- Devolvé SOLO la descripción, sin títulos, sin comillas, sin explicaciones extra
- No abras con saludos, exclamaciones tipo "¡Che!" ni frases dirigidas al lector
- La primera oración debe ser una declaración del producto o una imagen evocadora`;

export async function POST(request: NextRequest) {
  const body: DescriptionRequest = await request.json();
  const { productName, brand, colors, userHint } = body;

  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";

  const userMessage = buildUserMessage({ productName, brand, colors, userHint });

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 600,
        temperature: 0.8,
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
      {
        error:
          error instanceof Error ? error.message : "Error generando descripción",
      },
      { status: 500 },
    );
  }
}

function buildUserMessage(data: DescriptionRequest): string {
  const { productName, brand, colors, userHint } = data;
  const lines: string[] = [];

  lines.push(`Producto: ${productName}`);

  if (brand) {
    lines.push(`Marca: ${brand}`);
  }

  if (colors.length > 0) {
    lines.push(`Colores disponibles: ${colors.join(", ")}`);
  }

  if (userHint.trim()) {
    lines.push(`Contexto adicional del vendedor: ${userHint.trim()}`);
  }

  lines.push("\nGenerá una descripción atractiva para este producto.");

  return lines.join("\n");
}

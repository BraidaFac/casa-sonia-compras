import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { colorName } = await request.json();

  if (!colorName?.trim()) {
    return NextResponse.json({ error: "colorName requerido" }, { status: 400 });
  }

  const model = process.env.OPENROUTER_MODEL || "google/gemini-flash-1.5";

  const prompt = `Dado el nombre de color "${colorName}", devolvé exactamente 5 colores HEX que representen ese color o variaciones cercanas a él.

Reglas estrictas:
- Respondé ÚNICAMENTE con un JSON array de 5 strings HEX
- Formato exacto: ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"]
- El primer HEX debe ser el más representativo del color
- Los demás deben ser variaciones cercanas (más claro, más oscuro, tonos similares)
- NO incluyas ningún texto adicional, solo el JSON array
- Los HEX deben ser válidos (6 caracteres después del #)

Ejemplo para "Rojo": ["#CC0000", "#FF0000", "#990000", "#FF3333", "#AA0000"]`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://casasonia.com",
          "X-Title": "Casa Sonia Compras",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    const hexList = JSON.parse(content);

    const validHex = hexList.filter(
      (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h),
    );

    if (validHex.length === 0) {
      throw new Error("No se obtuvieron HEX válidos");
    }

    return NextResponse.json({ hexColors: validHex.slice(0, 5) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error sugiriendo colores HEX",
      },
      { status: 500 },
    );
  }
}

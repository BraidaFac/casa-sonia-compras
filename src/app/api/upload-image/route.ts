import { NextRequest, NextResponse } from "next/server";
import { uploadImageToDrive, deleteFileFromDrive } from "@/lib/google-drive";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const categoryCompleteName =
      (formData.get("categoryCompleteName") as string) || "Sin Categoría";

    if (!file) {
      return NextResponse.json(
        { error: "No se recibió archivo" },
        { status: 400 },
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Usar JPG, PNG, WEBP o GIF." },
        { status: 400 },
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 10MB." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // fileName viene construido desde el cliente: {referencia}_{color}[_N].ext
    const fileName = (formData.get("fileName") as string) || file.name;

    const result = await uploadImageToDrive({
      fileBuffer: buffer,
      fileName,
      mimeType: file.type,
      categoryCompleteName,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error subiendo imagen",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: "fileId requerido" }, { status: 400 });
    }

    await deleteFileFromDrive(fileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error borrando imagen",
      },
      { status: 500 },
    );
  }
}

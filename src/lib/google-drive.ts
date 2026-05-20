import { google } from "googleapis";

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    "http://localhost:3000",
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  return oauth2Client;
}

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id!;
}

/**
 * Construye el path de carpetas a partir del completeName de la categoría.
 * Ejemplos:
 *   "Calzado Hombre / Calzado Invierno Hombre" → ["Hombre", "Calzado Hombre", "Calzado Invierno Hombre"]
 *   "Calzado Mujer / Calzado Invierno Mujer"   → ["Mujer", "Calzado Mujer", "Calzado Invierno Mujer"]
 *   "Linea Blanco / Acolchado"                 → ["Linea Blanco", "Acolchado"]
 */
function buildFolderPath(categoryCompleteName: string): string[] {
  const parts = categoryCompleteName
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const hasHombre = parts.some((p) => p.toLowerCase().includes("hombre"));
  const hasMujer = parts.some((p) => p.toLowerCase().includes("mujer"));

  if (hasHombre) return ["Hombre", ...parts];
  if (hasMujer) return ["Mujer", ...parts];
  return parts;
}

async function getOrCreateNestedFolders(
  drive: ReturnType<typeof google.drive>,
  folderPath: string[],
  rootId: string,
): Promise<string> {
  let currentParentId = rootId;
  for (const folderName of folderPath) {
    currentParentId = await getOrCreateFolder(drive, folderName, currentParentId);
  }
  return currentParentId;
}

export async function uploadImageToDrive({
  fileBuffer,
  fileName,
  mimeType,
  categoryCompleteName,
}: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  categoryCompleteName: string;
}): Promise<{ fileId: string; thumbnailUrl: string; downloadUrl: string }> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

  const folderPath = buildFolderPath(categoryCompleteName);
  const targetFolderId = await getOrCreateNestedFolders(drive, folderPath, rootFolderId);

  const { Readable } = await import("stream");
  const stream = Readable.from(fileBuffer);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [targetFolderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id",
  });

  const fileId = file.data.id!;

  // Hacer el archivo público para que el thumbnail sea accesible sin auth
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    fileId,
    thumbnailUrl: `https://lh3.googleusercontent.com/d/${fileId}=w300`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  await drive.files.delete({ fileId });
}

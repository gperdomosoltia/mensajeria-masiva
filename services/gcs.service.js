// services/gcs.service.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

// --- Configuración de Google Cloud Storage ---
// Asegúrate de tener tu archivo de credenciales (por ejemplo, 'gcs_credentials.json') en la raíz del proyecto
// y el nombre de tu bucket en el archivo .env como GCS_BUCKET_NAME
function getStorageClient() {
  let storage;

  if (process.env.GCP_CREDENTIALS_JSON) {
    console.log("GCS producción");
    const creds = JSON.parse(process.env.GCP_CREDENTIALS_JSON);
    storage = new Storage({ credentials: creds, projectId: creds.project_id });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
  } else {
    const fallback = path.join(__dirname, '../credentials/credenciales.json');
    if (!fs.existsSync(fallback)) {
      console.warn('⚠️  Advertencia: No se encontró el archivo de credenciales de GCS. La subida de imágenes a la nube no funcionará.');
    }
    storage = new Storage({ keyFilename: fallback });
  }
  return storage;
}

const storage = getStorageClient();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;

/**
 * Sube una imagen (en formato buffer) a Google Cloud Storage y la hace pública.
 * @param {Buffer} buffer El buffer de la imagen.
 * @param {string} originalName El nombre original del archivo para generar un nombre único.
 * @param {string} mimetype El tipo MIME de la imagen.
 * @returns {Promise<string|null>} La URL pública de la imagen o null si falla.
 */
async function uploadImage(buffer, originalName, mimetype) {
  if (!storage || !BUCKET_NAME) {
    console.error('❌ Error: GCS no está configurado. Revisa tus credenciales y el nombre del bucket.');
    return null;
  }
  
  const bucket = storage.bucket(BUCKET_NAME);
  const ext = path.extname(originalName) || `.${mimetype.split('/')[1]}`;
  const fileName = `chat_marcuss/${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
  const file = bucket.file(fileName);

  try {
    await file.save(buffer, {
      resumable: false,
      metadata: { contentType: mimetype },
    });

    console.log(`Archivo subido (privado) a GCS: gs://${BUCKET_NAME}/${fileName}`);
    return fileName;

  } catch (err) {
    console.error('❌ Error al subir la imagen a Google Cloud Storage:', err);
    return null;
  }
}

module.exports = { uploadImage };
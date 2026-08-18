// Cloudflare R2 upload for the apply-bot audit-trail screenshots. Mirrors
// backend/src/services/storageService.js's convention (same bucket, own R2_* env
// vars — own copy for the reason given in logger.js). Uses the same signed-URL-only
// download convention as resumes; apply-bot only ever uploads, never signs a
// download URL itself (the backend's applyTasks.js route does that for the frontend).
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../logger');

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

let client = null;

function isConfigured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

// Key format: apply-bot/{userId}/{taskId}/{step}.jpg
async function uploadScreenshot(userId, taskId, step, buffer) {
  if (!isConfigured()) return null;
  const key = `apply-bot/${userId}/${taskId}/${step}-${Date.now()}.jpg`;
  await getClient().send(
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: 'image/jpeg' })
  );
  logger.info(`R2 upload: ${key}`);
  return key;
}

module.exports = { isConfigured, uploadScreenshot };

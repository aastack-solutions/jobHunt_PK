// Cloudflare R2 storage (S3-compatible). Files arrive as in-memory buffers
// from multer.memoryStorage() and are streamed straight to R2.
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../logger');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

const SIGNED_URL_TTL_SECONDS = 3600; // exactly 1 hour

let client = null;

function isConfigured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('R2 storage is not configured (missing R2_* env vars).');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

// R2 key format: resumes/{userId}/{timestamp}-{uuid}.{ext}
function buildResumeKey(userId, ext) {
  const safeExt = (ext || 'pdf').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `resumes/${userId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
}

async function uploadBuffer(key, buffer, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  logger.info(`R2 upload: ${key}`);
  return key;
}

async function getDownloadUrl(key) {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  logger.info(`R2 delete: ${key}`);
}

module.exports = { isConfigured, buildResumeKey, uploadBuffer, getDownloadUrl, deleteObject };

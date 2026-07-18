import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

/**
 * PRODUCTION STANDARD: Direct-to-S3 Presigned POST Generator
 * PHASE 3: Uses createPresignedPost to strictly enforce maxSizeMB in the cloud.
 */
export async function generatePresignedUpload(fileName: string, mimeType: string, maxSizeMB: number = 100) {
  const allowedPrefixes = ['image/', 'video/', 'application/pdf', 'text/'];
  const isAllowed = allowedPrefixes.some(prefix => mimeType.startsWith(prefix)) || 
                    ['application/json', 'application/javascript', 'application/x-python-code'].includes(mimeType);
  
  if (!isAllowed) throw new Error("Invalid file type.");

  // PHASE 3: Enforce strict file size limits in the AWS Conditions array
  const { url, fields } = await createPresignedPost(r2, {
    Bucket: process.env.R2_BUCKET_NAME as string,
    Key: fileName,
    Conditions: [
      ['content-length-range', 0, maxSizeMB * 1024 * 1024], // Restrict min and max bytes
      ['eq', '$Content-Type', mimeType] 
    ],
    Fields: {
      'Content-Type': mimeType
    },
    Expires: 600,
  });

  return { url, fields }; 
}

export async function getSecureUrl(fileReference: string) {
  if (!fileReference) return fileReference;
  let key = fileReference;
  
  if (fileReference.startsWith('http')) {
    try { 
      const urlObj = new URL(fileReference); 
      key = urlObj.pathname.substring(1); 
    } catch(e) {}
  }
  
  try {
    const command = new GetObjectCommand({ 
      Bucket: process.env.R2_BUCKET_NAME as string, 
      Key: key 
    });
    return await getSignedUrl(r2, command, { expiresIn: 3600 }); 
  } catch(err) {
    return fileReference;
  }
}
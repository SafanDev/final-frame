import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { connect } from 'node:net';
import { once } from 'node:events';
import { env } from '../config/env.js';
import { UnsafeFileError } from '../errors/unsafe-file-error.js';

const startsWith = (buffer: Buffer, bytes: readonly number[]): boolean =>
  bytes.every((value, index) => buffer[index] === value);

const asciiAt = (buffer: Buffer, offset: number, value: string): boolean =>
  buffer.subarray(offset, offset + value.length).toString('ascii') === value;

export async function assertFileSignature(filePath: string, mimeType: string): Promise<void> {
  const file = await open(filePath, 'r');
  try {
    const sample = Buffer.alloc(4_096);
    const { bytesRead } = await file.read(sample, 0, sample.length, 0);
    const bytes = sample.subarray(0, bytesRead);
    let valid = false;

    switch (mimeType) {
      case 'image/jpeg': valid = startsWith(bytes, [0xff, 0xd8, 0xff]); break;
      case 'image/png': valid = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
      case 'image/gif': valid = asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a'); break;
      case 'image/webp': valid = asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP'); break;
      case 'application/pdf': valid = asciiAt(bytes, 0, '%PDF-'); break;
      case 'video/webm': valid = startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]); break;
      case 'video/mp4':
      case 'video/quicktime':
        valid = bytes.length >= 12 && asciiAt(bytes, 4, 'ftyp');
        break;
      case 'audio/ogg': valid = asciiAt(bytes, 0, 'OggS'); break;
      case 'audio/wav': valid = asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WAVE'); break;
      case 'audio/mpeg':
        valid = asciiAt(bytes, 0, 'ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
        break;
      case 'audio/webm': valid = startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]); break;
      case 'application/javascript':
      case 'application/json':
      case 'application/typescript':
      case 'application/xml':
      case 'text/css':
      case 'text/csv':
      case 'text/javascript':
      case 'text/markdown':
      case 'text/plain':
      case 'text/typescript':
      case 'text/x-c':
      case 'text/x-c++src':
      case 'text/x-csharp':
      case 'text/x-go':
      case 'text/x-java-source':
      case 'text/x-php':
      case 'text/x-python':
      case 'text/x-ruby':
      case 'text/x-rust':
      case 'text/x-shellscript':
      case 'text/x-sql':
      case 'text/yaml':
        valid = !bytes.includes(0);
        break;
      default:
        valid = false;
    }

    if (!valid) throw new UnsafeFileError('The file contents do not match the declared file type.');
  } finally {
    await file.close();
  }
}

async function writeWithBackpressure(socket: ReturnType<typeof connect>, data: Buffer): Promise<void> {
  if (!socket.write(data)) await once(socket, 'drain');
}

/** Streams a local file through ClamAV INSTREAM without loading it into memory. */
export async function assertFileIsMalwareFree(filePath: string): Promise<void> {
  if (!env.CLAMAV_HOST) {
    if (env.NODE_ENV === 'production') throw new Error('Malware scanning is not configured.');
    return;
  }

  const socket = connect({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
  socket.setTimeout(env.CLAMAV_TIMEOUT_MS);
  let response = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => { response += chunk; });

  try {
    await Promise.race([
      once(socket, 'connect'),
      once(socket, 'timeout').then(() => { throw new Error('Malware scan timed out.'); }),
      once(socket, 'error').then(([error]) => { throw error; }),
    ]);
    await writeWithBackpressure(socket, Buffer.from('zINSTREAM\0'));
    for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
      const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(payload.length, 0);
      await writeWithBackpressure(socket, length);
      await writeWithBackpressure(socket, payload);
    }
    await writeWithBackpressure(socket, Buffer.alloc(4));
    socket.end();
    await Promise.race([
      once(socket, 'close'),
      once(socket, 'timeout').then(() => { throw new Error('Malware scan timed out.'); }),
      once(socket, 'error').then(([error]) => { throw error; }),
    ]);
  } finally {
    socket.destroy();
  }

  if (/FOUND\s*\0?$/i.test(response)) throw new UnsafeFileError('Malware was detected in the uploaded file.');
  if (!/OK\s*\0?$/i.test(response)) throw new Error(`Malware scanner returned an unexpected response: ${response.slice(0, 200)}`);
}

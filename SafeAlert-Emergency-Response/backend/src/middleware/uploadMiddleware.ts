import multer from 'multer';
import path from 'node:path';
import sharp from 'sharp';
import { httpError } from '../services/identity.ts';

const allowed: Record<string,string[]> = {
  'image/jpeg':['.jpg','.jpeg'], 'image/png':['.png'], 'image/webp':['.webp'], 'application/pdf':['.pdf'],
};
export const uploadMiddleware = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:10*1024*1024,files:1,fields:2,fieldSize:256,parts:4},
  fileFilter:(_req,file,callback) => {
    if (!allowed[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) return callback(httpError(400,'INVALID_FILE_TYPE','Use a JPEG, PNG, WebP, or PDF with the matching file extension.'));
    callback(null,true);
  },
});
export async function validateAndSanitizeFile(file: Express.Multer.File): Promise<{data:Buffer;mimeType:string}> {
  const bytes = file.buffer;
  const mime = file.mimetype;
  const matches =
    (mime==='image/jpeg' && bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) ||
    (mime==='image/png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (mime==='image/webp' && bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') ||
    (mime==='application/pdf' && bytes.subarray(0,5).toString()==='%PDF-');
  if (!matches) throw httpError(400,'INVALID_FILE_SIGNATURE','File contents do not match the declared type.');
  if (mime==='application/pdf') {
    const content = bytes.toString('latin1');
    if (!content.slice(-2048).includes('%%EOF')) throw httpError(400,'INVALID_PDF','PDF is incomplete.');
    // Registration PDFs are downloads only; prohibit common active/embedded document content.
    const normalized = content.replace(/#([a-fA-F0-9]{2})/g, (_match,hex) => String.fromCharCode(parseInt(hex,16)));
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA|Encrypt)\b/.test(normalized)) throw httpError(400,'UNSAFE_PDF','Provide a PDF without scripts, attachments, forms, encryption, or automatic actions.');
    return {data:bytes,mimeType:mime};
  }
  try {
    const image = sharp(bytes,{limitInputPixels:25_000_000,failOn:'warning'}).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || (metadata.pages ?? 1)>1) throw new Error('Invalid image dimensions');
    // Fresh PNG output removes EXIF, GPS, comments, and appended/polyglot bytes.
    const data = await image.png().toBuffer();
    if (data.length > 10*1024*1024) throw new Error('Decoded image exceeds size limit');
    return {data,mimeType:'image/png'};
  } catch { throw httpError(400,'INVALID_IMAGE','Image could not be safely decoded. Use a non-animated image under 25 megapixels and 10 MB.'); }
}

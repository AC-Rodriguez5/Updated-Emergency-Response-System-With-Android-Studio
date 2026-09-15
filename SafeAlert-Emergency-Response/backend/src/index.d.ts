import { AuthPayload } from './middleware/authMiddleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      id?: string;
      file?: any; // Resolves req.file errors if @types/multer is missing
    }
  }
}
export {};
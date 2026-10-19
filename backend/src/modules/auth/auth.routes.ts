import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
  type NextFunction,
} from 'express';
import multer from 'multer';
import {
  validateRequest,
  authGuard,
  loginLimiter,
  registrationLimiter,
  requireCaptcha,
  requireCaptchaHeader,
  refreshTokenLimiter,
} from '../../shared/middleware/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerResponderSchema,
  registerUserSchema,
  type ChangePasswordInput,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RegisterResponderInput,
} from './auth.schemas.js';
import * as authService from './auth.service.js';

const router = Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      cb(new AppError('Only image uploads are allowed', 400, 'INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

const registrationUpload = upload.fields([
  { name: 'faceCapture', maxCount: 1 },
  { name: 'proofOfResidency', maxCount: 1 },
]);

const responderRegistrationUpload = upload.fields([
  { name: 'faceCapture', maxCount: 1 },
  { name: 'credential', maxCount: 1 },
]);

/*
  The challenge is scoped to the resident app, the one client that can raise
  one today. Responder and admin sign-ins name their role explicitly and are
  left alone; a request that names no role is treated as a resident login,
  because that is the path it would otherwise fall through to.
*/
const residentCaptcha = requireCaptcha();

/*
  Read before anything else touches the request.

  Registration is a multipart upload, so a token sent as a form field can only
  be read after multer has buffered two photos — long past the rate limiter,
  which then counted a mistyped security code as one of ten registration
  attempts an hour. A header can be read before either, so a wrong code costs
  nothing but another try.

  The limiter still guards the upload: anything that gets past this has either
  answered correctly or sent no header at all, and the second case is an older
  client, handled further down out of the body as before.
*/
const residentCaptchaHeader = requireCaptchaHeader();

const residentLoginCaptcha: RequestHandler = (req, res, next) => {
  const role = (req.body as { role?: unknown } | undefined)?.role;
  if (role === 'responder' || role === 'admin') {
    next();
    return;
  }
  residentCaptcha(req, res, next);
};

router.post(
  '/register/user',
  residentCaptchaHeader,
  registrationLimiter,
  registrationUpload,
  residentCaptcha,
  validateRequest({ body: registerUserSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as Awaited<
        ReturnType<typeof registerUserSchema.parseAsync>
      >;
      const filesByField = req.files as
        | Record<string, Express.Multer.File[] | undefined>
        | undefined;
      const faceCapture = filesByField?.faceCapture?.[0];
      const proofOfResidency = filesByField?.proofOfResidency?.[0];
      if (!faceCapture) {
        throw new AppError('Face photo is required', 400, 'MISSING_FACE_CAPTURE');
      }
      if (!proofOfResidency) {
        throw new AppError('Valid ID is required', 400, 'MISSING_VALID_ID');
      }
      const result = await authService.registerUser(input, req, {
        faceCapture,
        proofOfResidency,
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/register/responder',
  registrationLimiter,
  responderRegistrationUpload,
  validateRequest({ body: registerResponderSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as RegisterResponderInput;
      const filesByField = req.files as
        | Record<string, Express.Multer.File[] | undefined>
        | undefined;
      const files = {
        faceCapture: filesByField?.faceCapture?.[0],
        credential: filesByField?.credential?.[0],
      };
      const result = await authService.registerResponder(input, req, files);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/*
  The challenge is marked before the limiter counts the attempt.

  The other way round, a mistyped security code spent one of five login
  attempts, and five of them locked a resident out of an emergency app for
  fifteen minutes — with a deliberately distorted image, that is an ordinary
  afternoon for somebody with poor eyesight, not an attack.

  Nothing is weakened by the swap. The limiter still counts every attempt that
  reaches a password, and an attempt now costs a fresh single-use challenge,
  which `captchaChallengeLimiter` caps at thirty a minute per address.
*/
router.post(
  '/login',
  residentLoginCaptcha,
  loginLimiter,
  validateRequest({ body: loginSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as LoginInput;
      const result = await authService.login(input, req);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/refresh',
  refreshTokenLimiter,
  validateRequest({ body: refreshSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as RefreshInput;
      const result = await authService.refresh(input.refreshToken, req);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/logout',
  validateRequest({ body: logoutSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as LogoutInput;
      await authService.logout(input.refreshToken);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/me',
  authGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = req.auth!;
      const result = await authService.getMe(auth.accountId, auth.role);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/change-password',
  authGuard,
  validateRequest({ body: changePasswordSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = req.auth!;
      const input = req.validated!.body as ChangePasswordInput;
      await authService.changePassword(
        auth.accountId,
        auth.role,
        input.currentPassword,
        input.newPassword,
      );
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

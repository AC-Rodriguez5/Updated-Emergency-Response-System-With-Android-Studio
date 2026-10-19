import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Server as SocketServer } from 'socket.io';
import {
  authGuard,
  emergencyCreateLimiter,
  emergencyMessageLimiter,
  validateRequest,
} from '../../shared/middleware/index.js';
import {
  acknowledgeBodySchema,
  arrivedBodySchema,
  assignBodySchema,
  cancelBodySchema,
  createEmergencySchema,
  idParamSchema,
  listActiveQuerySchema,
  listMineQuerySchema,
  onTheWayBodySchema,
  releaseBodySchema,
  type ReleaseBody,
  reportBodySchema,
  type AssignBody,
  type CancelBody,
  type CreateEmergencyInput,
  type IdParam,
  type ListActiveQuery,
  type ListMineQuery,
  type ReportBody,
  userMessageBodySchema,
  type UserMessageBody,
} from './emergencies.schemas.js';
import * as svc from './emergencies.service.js';

const router = Router();

router.use(authGuard);

function ctxFrom(req: Request) {
  const io = req.app.get('io') as SocketServer | undefined;
  return {
    io,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
  };
}

router.post(
  '/',
  emergencyCreateLimiter,
  validateRequest({ body: createEmergencySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validated!.body as CreateEmergencyInput;
      const data = await svc.createEmergency(input, req.auth!, ctxFrom(req));
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/active',
  validateRequest({ query: listActiveQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated!.query as ListActiveQuery;
      const data = await svc.listActive(q, req.auth!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/history',
  validateRequest({ query: listMineQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated!.query as ListMineQuery;
      const data = await svc.listResolvedForResponder(q, req.auth!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/my',
  validateRequest({ query: listMineQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.validated!.query as ListMineQuery;
      const data = await svc.listMine(q, req.auth!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const data = await svc.getOne(id, req.auth!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/cancel',
  validateRequest({ params: idParamSchema, body: cancelBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const body = req.validated!.body as CancelBody;
      const data = await svc.cancel(id, body, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/assign',
  validateRequest({ params: idParamSchema, body: assignBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const body = req.validated!.body as AssignBody;
      const data = await svc.assign(id, body, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/on-the-way',
  validateRequest({ params: idParamSchema, body: onTheWayBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const data = await svc.setOnTheWay(id, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/arrived',
  validateRequest({ params: idParamSchema, body: arrivedBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const data = await svc.setArrived(id, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/acknowledge',
  validateRequest({ params: idParamSchema, body: acknowledgeBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const data = await svc.acknowledge(id, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/release',
  validateRequest({ params: idParamSchema, body: releaseBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const body = req.validated!.body as ReleaseBody;
      const data = await svc.release(id, body, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/report',
  validateRequest({ params: idParamSchema, body: reportBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const body = req.validated!.body as ReportBody;
      const data = await svc.report(id, body, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/message',
  emergencyMessageLimiter,
  validateRequest({ params: idParamSchema, body: userMessageBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validated!.params as IdParam;
      const body = req.validated!.body as UserMessageBody;
      const data = await svc.sendMessage(id, body, req.auth!, ctxFrom(req));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

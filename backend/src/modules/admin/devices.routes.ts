import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  authGuard,
  roleGuard,
  validateRequest,
  adminActionLimiter,
} from '../../shared/middleware/index.js';
import {
  listDevicesQuerySchema,
  type ListDevicesQuery,
} from './devices.schemas.js';
import * as svc from './devices.service.js';

const router = Router();

router.use(authGuard, roleGuard('admin'), adminActionLimiter);

router.get(
  '/devices',
  validateRequest({ query: listDevicesQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await svc.listDevices(req.validated!.query as ListDevicesQuery);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

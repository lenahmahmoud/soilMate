import { Router } from 'express';
import { requireOwner } from '../middleware/owner.js';
import * as controller from '../controllers/dashboardController.js';

// Mounted at "/" in routes/index.js. requireOwner is per route, so the public explore routes are not affected.
const router = Router();
router.get('/dashboard', requireOwner, controller.getDashboard);
router.get('/reports/summary', requireOwner, controller.getReportSummary);
router.get('/journey', requireOwner, controller.getJourney);

export default router;
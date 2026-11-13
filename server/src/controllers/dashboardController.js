import * as dashboardService from '../services/dashboardService.js';
import * as reportService from '../services/reportService.js';
import * as journeyService from '../services/journeyService.js';

// Personal data: never cached.
const privateJson = (res, body) => res.set('Cache-Control', 'no-store').json(body);

export async function getDashboard(req, res) {
  privateJson(res, await dashboardService.getDashboard(req.user.id));
}

export async function getReportSummary(req, res) {
  privateJson(res, await reportService.getReportSummary(req.user.id));
}

export async function getJourney(req, res) {
  privateJson(res, await journeyService.getJourney(req.user.id));
}
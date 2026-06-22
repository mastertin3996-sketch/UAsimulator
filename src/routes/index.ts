import { Router } from 'express';
import { PrismaClient }            from '@prisma/client';
import { CompanyService }          from '../services/CompanyService';
import { CompanyController }       from '../controllers/CompanyController';
import { HRManagementController }  from '../controllers/HRManagementController';

/**
 * Збирає всі маршрути UAeconomy в один Express Router.
 *
 * Структура:
 *   POST /company/office/register     – реєстрація офісу
 *   POST /company/land/acquire        – купівля/оренда ділянки
 *   POST /company/enterprise/build    – будівництво підприємства
 *   POST /company/workshop/equipment  – встановлення обладнання
 *
 *   POST /hr/hire                     – найм співробітника
 *   PUT  /hr/salary                   – коригування зарплати
 */
export function buildRouter(prisma: PrismaClient): Router {
  const router = Router();

  const companySvc = new CompanyService(prisma);
  const company    = new CompanyController(companySvc);
  const hr         = new HRManagementController(prisma);

  // ── Company ──────────────────────────────────────────────────────────────
  router.post('/company/office/register',    company.registerOffice);
  router.post('/company/land/acquire',       company.acquireLand);
  router.post('/company/enterprise/build',   company.buildEnterprise);
  router.post('/company/workshop/equipment', company.installEquipment);

  // ── HR ───────────────────────────────────────────────────────────────────
  router.post('/hr/hire',   hr.hireEmployee);
  router.put('/hr/salary',  hr.adjustSalary);

  return router;
}

/** Тип, який описує мінімальну форму auth-payload у req.user. */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

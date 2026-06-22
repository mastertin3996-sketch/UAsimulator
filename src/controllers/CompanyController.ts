import type { Request, Response, NextFunction } from 'express';
import { CompanyService } from '../services/CompanyService';
import {
  parseRegisterOfficeDto,
  parseAcquireLandDto,
  parseBuildEnterpriseDto,
  parseInstallEquipmentDto,
} from '../dto/company.dto';

/**
 * Компанійський контролер — HTTP-шлюз до CompanyService.
 * Всю бізнес-логіку делегує сервісу; сам лише:
 *  – парсить і валідує DTO (кидає ValidationError при помилці)
 *  – витягує playerId з req.user (встановлюється auth-мідлварем)
 *  – формує відповідь
 */
export class CompanyController {
  private readonly svc: CompanyService;

  constructor(svc: CompanyService) {
    this.svc = svc;
    // Bind для коректного `this` при передачі методів як route-handlers
    this.registerOffice     = this.registerOffice.bind(this);
    this.acquireLand        = this.acquireLand.bind(this);
    this.buildEnterprise    = this.buildEnterprise.bind(this);
    this.installEquipment   = this.installEquipment.bind(this);
  }

  /**
   * POST /company/office/register
   *
   * Орендує або купує приміщення офісу на вже придбаній земельній ділянці.
   * Перевіряє достатність балансу та унікальність офісу в місті.
   *
   * Body: RegisterOfficeDto
   * Response 201: { enterpriseId, officeId }
   */
  async registerOffice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = req.user!.id;
      const dto      = parseRegisterOfficeDto(req.body);
      const result   = await this.svc.registerOffice(playerId, dto);

      res.status(201).json({
        success: true,
        data: {
          ...result,
          message: 'Office registered successfully. Enterprise is operational immediately.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /company/land/acquire
   *
   * Купує або орендує вільну земельну ділянку.
   * При LEASE списує 2 місяці авансу; при BUY — повну вартість.
   *
   * Body: AcquireLandDto
   * Response 200: { message }
   */
  async acquireLand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = req.user!.id;
      const dto      = parseAcquireLandDto(req.body);
      await this.svc.acquireLand(playerId, dto);

      res.status(200).json({
        success: true,
        data: {
          landPlotId: dto.landPlotId,
          method:     dto.method,
          message:    dto.method === 'BUY'
            ? 'Land plot purchased successfully.'
            : 'Land plot leased successfully. Advance payment for 2 months deducted.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /company/enterprise/build
   *
   * Розпочинає будівництво підприємства.
   *
   * Жорстка перевірка:
   *  – Гравець має операційний офіс у тому ж місті (через LandPlot → City)
   *  – На ділянці вистачає незайнятих м² для footprintM2
   *  – Баланс покриває вартість будівництва
   *
   * Body: BuildEnterpriseDto
   * Response 202: { enterpriseId, constructionProjectId, message }
   */
  async buildEnterprise(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = req.user!.id;
      const dto      = parseBuildEnterpriseDto(req.body);
      const result   = await this.svc.buildEnterprise(playerId, dto);

      res.status(202).json({
        success: true,
        data: {
          ...result,
          message:
            `Construction of '${dto.name}' started. ` +
            `The enterprise will become operational when ConstructionProject completes.`,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /company/workshop/equipment
   *
   * Купує та встановлює обладнання в цех.
   * Перевіряє, чи новий footprintM2 не перевищує вільну площу цеху.
   *
   * Body: InstallEquipmentDto
   * Response 201: { equipmentId }
   */
  async installEquipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId   = req.user!.id;
      const dto        = parseInstallEquipmentDto(req.body);
      const equipmentId = await this.svc.installEquipment(playerId, dto);

      res.status(201).json({
        success: true,
        data: {
          equipmentId,
          message: 'Equipment purchased and installed successfully. Status: NEW.',
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

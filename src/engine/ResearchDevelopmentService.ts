/**
 * ResearchDevelopmentService — tech tree, RP generation, and passive modifiers.
 *
 * Architecture:
 *   • Technologies are global (seeded once). PlayerTechnology tracks per-player progress.
 *   • RP is generated each tick by RESEARCHER / DATA_SCIENTIST employees inside
 *     RD_LABORATORY enterprises, weighted by mood and optionally boosted by LEAN_PRODUCTION.
 *   • Modifiers are read through a tick-scoped in-process cache (Map<playerId, Set<TechCode>>)
 *     populated once per tick by warmTickCache(). Calls outside the tick loop fall back to
 *     a single DB query, so there is no "cold path" correctness risk.
 *
 * Tech tree (Tier 1 techs have no prerequisites):
 *   Tier 1 — LEAN_PRODUCTION  (1 000 RP): +20% RP generation in RD_LABORATORY
 *   Tier 1 — GREEN_ENERGY     (  800 RP): energy consumption ×0.85
 *   Tier 2 — ADVANCED_LOGISTICS(1 500 RP, requires LEAN_PRODUCTION): freight ×0.90
 *   Tier 2 — HIGH_TECH_AGRO   (1 200 RP, requires LEAN_PRODUCTION): agro quality +1.5
 *
 * Integration points (other services call these sync/async getters):
 *   ProductionService   → getProductionQualityModifier(playerId, enterpriseType)
 *   EnergyBillingService→ getEnergyConsumptionModifier(playerId)
 *   LogisticsService    → getLogisticsFuelModifier(playerId)
 */

import { PrismaClient, TechCode } from '@prisma/client';
import { AppError }               from '../errors/AppError';

// ── Tech tree constants ───────────────────────────────────────────────────────

export interface TechDefinition {
  code:                  TechCode;
  name:                  string;
  description:           string;
  requiredResearchPoints: number;
  tier:                  number;
  prerequisites:         TechCode[];
}

export const TECH_TREE: TechDefinition[] = [
  {
    code:                  'LEAN_PRODUCTION',
    name:                  'Ощадне виробництво',
    description:           'Зменшує відходи матеріалів та підвищує ефективність R&D-відділу на 20%.',
    requiredResearchPoints: 1_000,
    tier:                  1,
    prerequisites:         [],
  },
  {
    code:                  'GREEN_ENERGY',
    name:                  'Зелена енергетика',
    description:           'Встановлення рекуператорів та сонячних панелей: –15% споживання ел/е по всіх підприємствах.',
    requiredResearchPoints: 800,
    tier:                  1,
    prerequisites:         [],
  },
  {
    code:                  'ADVANCED_LOGISTICS',
    name:                  'Просунута логістика',
    description:           'Оптимізація маршрутів та еко-двигуни: –10% витрат на пальне для всіх перевезень.',
    requiredResearchPoints: 1_500,
    tier:                  2,
    prerequisites:         ['LEAN_PRODUCTION'],
  },
  {
    code:                  'HIGH_TECH_AGRO',
    name:                  'Точне землеробство',
    description:           'Дрони, IoT-датчики ґрунту та агрохімія: +1.5 до базової якості аграрного виробництва.',
    requiredResearchPoints: 1_200,
    tier:                  2,
    prerequisites:         ['LEAN_PRODUCTION'],
  },
];

const TECH_BY_CODE = new Map<TechCode, TechDefinition>(
  TECH_TREE.map(t => [t.code, t]),
);

// ── RP base rates per profession ──────────────────────────────────────────────

const BASE_RP_PER_TICK: Partial<Record<string, number>> = {
  RESEARCHER:     5,
  DATA_SCIENTIST: 10,
};

// ── Return types ──────────────────────────────────────────────────────────────

export interface ResearchTickResult {
  playerId:          string;
  rpGenerated:       number;
  activeResearchCode: TechCode | null;
  newProgressPoints: number;
  justUnlocked:      boolean;
}

export interface TechTreeNode {
  code:                  TechCode;
  name:                  string;
  description:           string;
  tier:                  number;
  requiredResearchPoints: number;
  prerequisites:         TechCode[];
  currentProgressPoints:  number;
  isUnlocked:            boolean;
  unlockedAtTick:        bigint | null;
  status:                'UNLOCKED' | 'IN_PROGRESS' | 'AVAILABLE' | 'LOCKED';
}

// ═════════════════════════════════════════════════════════════════════════════

export class ResearchDevelopmentService {

  // Tick-scoped cache: playerId → Set of unlocked TechCodes.
  // Populated by warmTickCache() at the start of each tick.
  // Undefined entry = player not yet cached (fall back to DB).
  private readonly tickCache = new Map<string, Set<TechCode>>();

  constructor(private readonly db: PrismaClient) {}

  // ── 0. Cache management (called by TickEngine) ────────────────────────────

  /**
   * Pre-load all unlocked technologies for a batch of players in one query.
   * Call this once at the start of each tick before processing any player.
   */
  async warmTickCache(playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return;
    this.tickCache.clear();

    // Initialise every player with an empty set (distinguishes "cached & empty" from "not cached")
    for (const id of playerIds) this.tickCache.set(id, new Set());

    const rows = await this.db.playerTechnology.findMany({
      where:   { playerId: { in: playerIds }, isUnlocked: true },
      include: { technology: { select: { code: true } } },
    });

    for (const row of rows) {
      this.tickCache.get(row.playerId)?.add(row.technology.code);
    }
  }

  clearCache(): void {
    this.tickCache.clear();
  }

  // ── 1. RP generation ──────────────────────────────────────────────────────

  /**
   * Calculates how many Research Points the player generates this tick.
   *
   * Formula (per RD_LABORATORY enterprise):
   *   RP_enterprise = Σ_employees ( BASE_RP[profession] × mood × (1 + officeTechModifier) )
   *
   * officeTechModifier = 0.20 if LEAN_PRODUCTION is unlocked, else 0.
   */
  async calculateResearchGenerationTick(playerId: string): Promise<number> {
    const leanUnlocked = await this.isTechUnlocked(playerId, 'LEAN_PRODUCTION');
    const officeTechMod = leanUnlocked ? 0.20 : 0.0;

    const labs = await this.db.enterprise.findMany({
      where:   { playerId, type: 'RD_LABORATORY', isOperational: true },
      include: { employees: { select: { profession: true, mood: true } } },
    });

    let totalRP = 0;
    for (const lab of labs) {
      for (const emp of lab.employees) {
        const base = BASE_RP_PER_TICK[emp.profession as string] ?? 0;
        if (base === 0) continue;
        totalRP += base * emp.mood * (1 + officeTechMod);
      }
    }

    return totalRP;
  }

  /**
   * Generates RP and allocates them to the player's active research project.
   * Auto-unlocks the technology when the threshold is reached.
   */
  async processResearchTick(
    playerId:    string,
    currentTick: bigint,
  ): Promise<ResearchTickResult> {

    const rp = await this.calculateResearchGenerationTick(playerId);

    if (rp <= 0) {
      return {
        playerId,
        rpGenerated:        0,
        activeResearchCode: null,
        newProgressPoints:  0,
        justUnlocked:       false,
      };
    }

    const player = await this.db.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { activeResearchTechId: true },
    });

    if (!player.activeResearchTechId) {
      return {
        playerId,
        rpGenerated:        rp,
        activeResearchCode: null,
        newProgressPoints:  0,
        justUnlocked:       false,
      };
    }

    // Find or create the PlayerTechnology row for the active research
    const existing = await this.db.playerTechnology.findUnique({
      where:   { playerId_technologyId: { playerId, technologyId: player.activeResearchTechId } },
      include: { technology: true },
    });

    if (!existing) {
      // Create it and add RP
      const tech = await this.db.technology.findUniqueOrThrow({
        where: { id: player.activeResearchTechId },
      });
      await this.db.playerTechnology.create({
        data: { playerId, technologyId: tech.id, currentProgressPoints: rp },
      });
      return {
        playerId,
        rpGenerated:        rp,
        activeResearchCode: tech.code,
        newProgressPoints:  rp,
        justUnlocked:       false,
      };
    }

    if (existing.isUnlocked) {
      // Already unlocked — carry nothing, player should change activeResearchTechId
      return {
        playerId,
        rpGenerated:        rp,
        activeResearchCode: existing.technology.code,
        newProgressPoints:  existing.currentProgressPoints,
        justUnlocked:       false,
      };
    }

    const newPoints = existing.currentProgressPoints + rp;
    const threshold = existing.technology.requiredResearchPoints;

    let justUnlocked = false;

    if (newPoints >= threshold) {
      // Unlock
      await this.db.playerTechnology.update({
        where: { id: existing.id },
        data:  {
          currentProgressPoints: threshold,
          isUnlocked:            true,
          unlockedAtTick:        currentTick,
        },
      });
      // Invalidate cache for this player
      const cached = this.tickCache.get(playerId);
      cached?.add(existing.technology.code);

      justUnlocked = true;
    } else {
      await this.db.playerTechnology.update({
        where: { id: existing.id },
        data:  { currentProgressPoints: newPoints },
      });
    }

    return {
      playerId,
      rpGenerated:        rp,
      activeResearchCode: existing.technology.code,
      newProgressPoints:  justUnlocked ? threshold : newPoints,
      justUnlocked,
    };
  }

  // ── 2. Manual unlock (API endpoint / player action) ───────────────────────

  /**
   * Validates prerequisites and RP threshold, then unlocks a technology.
   * Can be called directly (e.g. from an API route) when the player clicks
   * "Unlock" — separate from auto-unlock in processResearchTick.
   */
  async unlockTechnology(playerId: string, techCode: TechCode): Promise<void> {
    const def = TECH_BY_CODE.get(techCode);
    if (!def) throw new AppError(`Unknown tech code: ${techCode}`, 400, 'INVALID_TECH_CODE');

    await this.db.$transaction(async (tx) => {
      const tech = await tx.technology.findUnique({ where: { code: techCode } });
      if (!tech) {
        throw new AppError(
          `Technology ${techCode} is not seeded in the database.`,
          500, 'TECH_NOT_SEEDED',
        );
      }

      // Check prerequisites (all must be unlocked)
      if (def.prerequisites.length > 0) {
        const unlockedPrereqs = await tx.playerTechnology.findMany({
          where: {
            playerId,
            isUnlocked:  true,
            technology:  { code: { in: def.prerequisites } },
          },
          include: { technology: { select: { code: true } } },
        });
        const unlockedCodes = new Set(unlockedPrereqs.map(r => r.technology.code));
        const missing = def.prerequisites.filter(p => !unlockedCodes.has(p));
        if (missing.length > 0) {
          throw new AppError(
            `Спочатку розблокуйте: ${missing.join(', ')}`,
            422, 'PREREQUISITES_NOT_MET', { missing },
          );
        }
      }

      // Check progress row
      const pt = await tx.playerTechnology.findUnique({
        where: { playerId_technologyId: { playerId, technologyId: tech.id } },
      });

      if (pt?.isUnlocked) {
        throw new AppError('Технологія вже розблокована.', 409, 'ALREADY_UNLOCKED');
      }

      const progress = pt?.currentProgressPoints ?? 0;
      if (progress < def.requiredResearchPoints) {
        throw new AppError(
          `Недостатньо очок досліджень: ${progress.toFixed(0)} / ${def.requiredResearchPoints}`,
          402, 'INSUFFICIENT_RESEARCH_POINTS',
          { current: progress, required: def.requiredResearchPoints },
        );
      }

      const lastTick = await tx.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
      const now      = lastTick?.tickNumber ?? 0n;

      if (pt) {
        await tx.playerTechnology.update({
          where: { id: pt.id },
          data:  { isUnlocked: true, unlockedAtTick: now },
        });
      } else {
        await tx.playerTechnology.create({
          data: {
            playerId,
            technologyId:         tech.id,
            currentProgressPoints: def.requiredResearchPoints,
            isUnlocked:            true,
            unlockedAtTick:        now,
          },
        });
      }
    });

    // Invalidate in-process cache
    const cached = this.tickCache.get(playerId);
    cached?.add(techCode);
  }

  // ── 3. Modifier getters ───────────────────────────────────────────────────
  //
  // These are async to support both:
  //   • Warm path (tick loop): O(1) Map lookup, no DB call
  //   • Cold path (API routes): 1 DB query per call
  //

  /**
   * Returns a quality bonus added to base crop/food quality in ProductionService.
   * Returns +1.5 for AGRO_FARM and FOOD_PROCESSING enterprises when HIGH_TECH_AGRO
   * is unlocked; 0 otherwise.
   */
  async getProductionQualityModifier(
    playerId:       string,
    enterpriseType: string,
  ): Promise<number> {
    if (enterpriseType !== 'AGRO_FARM' && enterpriseType !== 'FOOD_PROCESSING') return 0;
    return (await this.isTechUnlocked(playerId, 'HIGH_TECH_AGRO')) ? 1.5 : 0;
  }

  /**
   * Returns an energy multiplier for EnergyBillingService.
   * 0.85 when GREEN_ENERGY is unlocked (−15%); 1.0 otherwise.
   */
  async getEnergyConsumptionModifier(playerId: string): Promise<number> {
    return (await this.isTechUnlocked(playerId, 'GREEN_ENERGY')) ? 0.85 : 1.0;
  }

  /**
   * Returns a freight-cost multiplier for LogisticsService.
   * 0.90 when ADVANCED_LOGISTICS is unlocked (−10%); 1.0 otherwise.
   */
  async getLogisticsFuelModifier(playerId: string): Promise<number> {
    return (await this.isTechUnlocked(playerId, 'ADVANCED_LOGISTICS')) ? 0.90 : 1.0;
  }

  // ── 4. Tech tree view ─────────────────────────────────────────────────────

  /**
   * Returns the full tech tree annotated with per-player progress and status.
   *
   * Status values:
   *   UNLOCKED    — isUnlocked = true
   *   IN_PROGRESS — player.activeResearchTechId points here and not yet unlocked
   *   AVAILABLE   — prerequisites met, not yet started or partially started
   *   LOCKED      — prerequisites not met
   */
  async getAvailableTechTree(playerId: string): Promise<TechTreeNode[]> {
    const [techs, playerRows, player] = await Promise.all([
      this.db.technology.findMany({ orderBy: [{ tier: 'asc' }, { code: 'asc' }] }),
      this.db.playerTechnology.findMany({ where: { playerId } }),
      this.db.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { activeResearchTechId: true },
      }),
    ]);

    const progressByTechId = new Map(
      playerRows.map(r => [r.technologyId, r]),
    );

    // Which codes are unlocked?
    const unlockedCodes = new Set(
      playerRows.filter(r => r.isUnlocked).map(r => {
        const t = techs.find(t => t.id === r.technologyId);
        return t?.code ?? null;
      }).filter(Boolean) as TechCode[],
    );

    return techs.map(tech => {
      const def      = TECH_BY_CODE.get(tech.code)!;
      const progress = progressByTechId.get(tech.id);
      const isUnlocked = progress?.isUnlocked ?? false;
      const prereqsMet = def.prerequisites.every(p => unlockedCodes.has(p));

      let status: TechTreeNode['status'];
      if (isUnlocked) {
        status = 'UNLOCKED';
      } else if (player.activeResearchTechId === tech.id) {
        status = 'IN_PROGRESS';
      } else if (prereqsMet) {
        status = 'AVAILABLE';
      } else {
        status = 'LOCKED';
      }

      return {
        code:                   tech.code,
        name:                   tech.name,
        description:            tech.description,
        tier:                   tech.tier,
        requiredResearchPoints: tech.requiredResearchPoints,
        prerequisites:          def.prerequisites,
        currentProgressPoints:  progress?.currentProgressPoints ?? 0,
        isUnlocked,
        unlockedAtTick:         progress?.unlockedAtTick ?? null,
        status,
      };
    });
  }

  // ── 5. Tech tree seed ─────────────────────────────────────────────────────

  /**
   * Idempotent. Creates Technology rows that are missing from the DB.
   * Call once at app startup (from index.ts / api/index.ts).
   */
  async seedTechTree(): Promise<void> {
    for (const def of TECH_TREE) {
      await this.db.technology.upsert({
        where:  { code: def.code },
        update: {
          name:                   def.name,
          description:            def.description,
          requiredResearchPoints: def.requiredResearchPoints,
          tier:                   def.tier,
          prerequisites:          JSON.stringify(def.prerequisites),
        },
        create: {
          code:                   def.code,
          name:                   def.name,
          description:            def.description,
          requiredResearchPoints: def.requiredResearchPoints,
          tier:                   def.tier,
          prerequisites:          JSON.stringify(def.prerequisites),
        },
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Checks whether a player has a specific technology unlocked.
   * Uses the tick cache when available; falls back to DB otherwise.
   */
  private async isTechUnlocked(playerId: string, code: TechCode): Promise<boolean> {
    const cached = this.tickCache.get(playerId);
    if (cached !== undefined) {
      // Cache hit (even if the set is empty, that's authoritative for this tick)
      return cached.has(code);
    }

    // Cold path: single DB query
    const tech = await this.db.technology.findUnique({
      where:  { code },
      select: { id: true },
    });
    if (!tech) return false;

    const pt = await this.db.playerTechnology.findUnique({
      where: { playerId_technologyId: { playerId, technologyId: tech.id } },
      select: { isUnlocked: true },
    });
    return pt?.isUnlocked ?? false;
  }
}

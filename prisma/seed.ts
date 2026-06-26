/**
 * Seed file — populates static game data.
 * Run with: npx ts-node prisma/seed.ts
 *
 * Data sources / calibration baseline (2026 estimates):
 *  Salaries: ukrstat.gov.ua wage surveys + annual indexation
 *  Land:     Commercial real estate indices (Kyiv, Lviv, Dnipro markets)
 *  Energy:   NEURC commercial tariff schedule + wartime surcharges
 *  Demand:   Population-proportional consumer spending baskets
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding UAeconomy database...');

  // ──────────────────────────────────────────────────────────────────────────
  // CITIES
  // Wage coefficients vs national baseline (national baseline = 1.0)
  // Energy tariffs: commercial rate UAH/kWh estimated for 2026
  // ──────────────────────────────────────────────────────────────────────────
  // wageBaselineUah: мінімальна брутто-зарплата (UAH/місяць) у комерційному секторі
  // Розраховано як: 14_000 UAH (нац. мінімум 2026) × wageCoefficient
  // Довідка: нац. мінімалка у 2026 ≈ 8_000 UAH (офіц.), але в комерції де-факто ~14_000
  const cities = await Promise.all([
    prisma.city.upsert({
      where:  { name: 'Kyiv' },
      update: {},
      create: {
        name: 'Kyiv', nameUa: 'Київ', region: 'Kyiv Oblast',
        population: 2_900_000,
        wageCoefficient: 1.45,  landPriceCoeff: 1.80,  demandCoefficient: 1.50,
        energyTariffUah: 8.20,  latitude: 50.4501, longitude: 30.5234,
        wageBaselineUah: 20_300, // 14_000 × 1.45
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Kharkiv' },
      update: {},
      create: {
        name: 'Kharkiv', nameUa: 'Харків', region: 'Kharkiv Oblast',
        population: 1_350_000,
        wageCoefficient: 1.10,  landPriceCoeff: 1.00,  demandCoefficient: 1.10,
        energyTariffUah: 7.60,  latitude: 49.9935, longitude: 36.2304,
        wageBaselineUah: 15_400, // 14_000 × 1.10
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Dnipro' },
      update: {},
      create: {
        name: 'Dnipro', nameUa: 'Дніпро', region: 'Dnipropetrovsk Oblast',
        population: 960_000,
        wageCoefficient: 1.15,  landPriceCoeff: 1.10,  demandCoefficient: 1.05,
        energyTariffUah: 7.80,  latitude: 48.4647, longitude: 35.0462,
        wageBaselineUah: 16_100, // 14_000 × 1.15
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Odesa' },
      update: {},
      create: {
        name: 'Odesa', nameUa: 'Одеса', region: 'Odesa Oblast',
        population: 1_000_000,
        wageCoefficient: 1.20,  landPriceCoeff: 1.30,  demandCoefficient: 1.15,
        energyTariffUah: 7.90,  latitude: 46.4825, longitude: 30.7233,
        wageBaselineUah: 16_800, // 14_000 × 1.20
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Lviv' },
      update: {},
      create: {
        name: 'Lviv', nameUa: 'Львів', region: 'Lviv Oblast',
        population: 720_000,
        wageCoefficient: 1.20,  landPriceCoeff: 1.35,  demandCoefficient: 1.10,
        energyTariffUah: 7.70,  latitude: 49.8397, longitude: 24.0297,
        wageBaselineUah: 16_800, // 14_000 × 1.20
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Zaporizhzhia' },
      update: {},
      create: {
        name: 'Zaporizhzhia', nameUa: 'Запоріжжя', region: 'Zaporizhzhia Oblast',
        population: 710_000,
        wageCoefficient: 1.05,  landPriceCoeff: 0.90,  demandCoefficient: 0.95,
        energyTariffUah: 7.50,  latitude: 47.8388, longitude: 35.1396,
        wageBaselineUah: 14_700, // 14_000 × 1.05
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Vinnytsia' },
      update: {},
      create: {
        name: 'Vinnytsia', nameUa: 'Вінниця', region: 'Vinnytsia Oblast',
        population: 370_000,
        wageCoefficient: 0.90,  landPriceCoeff: 0.70,  demandCoefficient: 0.80,
        energyTariffUah: 7.40,  latitude: 49.2331, longitude: 28.4682,
        wageBaselineUah: 12_600, // 14_000 × 0.90
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Poltava' },
      update: {},
      create: {
        name: 'Poltava', nameUa: 'Полтава', region: 'Poltava Oblast',
        population: 280_000,
        wageCoefficient: 0.88,  landPriceCoeff: 0.65,  demandCoefficient: 0.75,
        energyTariffUah: 7.30,  latitude: 49.5883, longitude: 34.5514,
        wageBaselineUah: 12_320, // 14_000 × 0.88
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Chernivtsi' },
      update: {},
      create: {
        name: 'Chernivtsi', nameUa: 'Чернівці', region: 'Chernivtsi Oblast',
        population: 265_000,
        wageCoefficient: 0.85,  landPriceCoeff: 0.75,  demandCoefficient: 0.78,
        energyTariffUah: 7.30,  latitude: 48.2921, longitude: 25.9358,
        wageBaselineUah: 11_900, // 14_000 × 0.85
      },
    }),
    prisma.city.upsert({
      where:  { name: 'Sumy' },
      update: {},
      create: {
        name: 'Sumy', nameUa: 'Суми', region: 'Sumy Oblast',
        population: 250_000,
        wageCoefficient: 0.87,  landPriceCoeff: 0.62,  demandCoefficient: 0.72,
        energyTariffUah: 7.20,  latitude: 50.9077, longitude: 34.7981,
        wageBaselineUah: 12_180, // 14_000 × 0.87
      },
    }),
  ]);

  console.log(`Seeded ${cities.length} cities.`);

  // ──────────────────────────────────────────────────────────────────────────
  // PRODUCTS
  // ──────────────────────────────────────────────────────────────────────────
  const productData = [
    // Raw materials
    { sku: 'RM-WHEAT',   name: 'Wheat',             nameUa: 'Пшениця',         category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-SUNFL',   name: 'Sunflower Seeds',   nameUa: 'Насіння соняшника',category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-SUGBEET', name: 'Sugar Beet',         nameUa: 'Цукровий буряк',   category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-MILK',    name: 'Raw Milk',           nameUa: 'Сире молоко',      category: 'RAW_MATERIAL',  unit: 'litre', baseWeightKg: 1.03 },
    { sku: 'RM-CORN',    name: 'Corn',               nameUa: 'Кукурудза',        category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-IRONORE', name: 'Iron Ore',           nameUa: 'Залізна руда',     category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-COAL',    name: 'Coal',               nameUa: 'Вугілля',          category: 'RAW_MATERIAL',  unit: 'kg',    baseWeightKg: 1 },
    { sku: 'RM-LUMBER',  name: 'Raw Lumber',         nameUa: 'Необроблена деревина', category: 'RAW_MATERIAL', unit: 'kg', baseWeightKg: 1 },
    // Semi-finished
    { sku: 'SF-FLOUR',   name: 'Wheat Flour',        nameUa: 'Пшеничне борошно', category: 'SEMI_FINISHED', unit: 'kg',    baseWeightKg: 1 },
    { sku: 'SF-SUGAR',   name: 'Refined Sugar',      nameUa: 'Цукор-пісок',      category: 'SEMI_FINISHED', unit: 'kg',    baseWeightKg: 1 },
    { sku: 'SF-STEEL',   name: 'Steel Sheets',       nameUa: 'Сталевий лист',    category: 'SEMI_FINISHED', unit: 'kg',    baseWeightKg: 1 },
    { sku: 'SF-PLANKS',  name: 'Wooden Planks',      nameUa: 'Дошки',            category: 'SEMI_FINISHED', unit: 'kg',    baseWeightKg: 1 },
    // Finished goods
    { sku: 'FG-BREAD',   name: 'Bread (loaf)',        nameUa: 'Хліб',             category: 'FINISHED_GOOD', unit: 'unit',  baseWeightKg: 0.7 },
    { sku: 'FG-SUNOIL',  name: 'Sunflower Oil',      nameUa: 'Соняшникова олія', category: 'FINISHED_GOOD', unit: 'litre', baseWeightKg: 0.92 },
    { sku: 'FG-MILK',    name: 'Pasteurised Milk',   nameUa: 'Пастеризоване молоко', category: 'FINISHED_GOOD', unit: 'litre', baseWeightKg: 1.03 },
    { sku: 'FG-PASTA',   name: 'Pasta',              nameUa: 'Макарони',         category: 'FINISHED_GOOD', unit: 'kg',    baseWeightKg: 1 },
    { sku: 'FG-STEEL-P', name: 'Steel Products',     nameUa: 'Сталеві вироби',   category: 'FINISHED_GOOD', unit: 'kg',    baseWeightKg: 1 },
    { sku: 'FG-FURN',    name: 'Furniture',          nameUa: 'Меблі',            category: 'FINISHED_GOOD', unit: 'unit',  baseWeightKg: 45 },
    // ── Будівельні матеріали (RAW_MATERIAL / SEMI_FINISHED) ─────────────────
    // Ціни-орієнтири 2026 (UAH/тонна або UAH/шт):
    //   Цемент М500:    3 800 UAH/т  (2.8 т = 1 м³ бетону М300)
    //   Пісок річковий:   450 UAH/т
    //   Щебінь 5-20 мм:   800 UAH/т
    //   Бетон М300:     4 500 UAH/т  (готовий, ринок 2026)
    //   Сталева арматура: 42 000 UAH/т
    //   Конструкційна деревина: 12 000 UAH/м³
    //   Цегла М150:       9 UAH/шт  (250×120×65 мм, ~4 кг)
    { sku: 'CM-CEMENT',   name: 'Cement M500',        nameUa: 'Цемент М500',          category: 'RAW_MATERIAL',  unit: 'тонна', baseWeightKg: 1000 },
    { sku: 'CM-SAND',     name: 'River Sand',          nameUa: 'Пісок річковий',       category: 'RAW_MATERIAL',  unit: 'тонна', baseWeightKg: 1000 },
    { sku: 'CM-GRAVEL',   name: 'Crushed Stone 5-20',  nameUa: 'Щебінь 5–20 мм',      category: 'RAW_MATERIAL',  unit: 'тонна', baseWeightKg: 1000 },
    { sku: 'CM-BRICK',    name: 'Ceramic Brick M150',  nameUa: 'Цегла керамічна М150', category: 'RAW_MATERIAL',  unit: 'шт',    baseWeightKg: 4    },
    { sku: 'CM-CONCRETE', name: 'Ready-Mix Concrete M300', nameUa: 'Бетон М300 (товарний)', category: 'SEMI_FINISHED', unit: 'тонна', baseWeightKg: 1000 },
    { sku: 'CM-REBAR',    name: 'Steel Rebar A500C',   nameUa: 'Арматура сталева А500С', category: 'SEMI_FINISHED', unit: 'тонна', baseWeightKg: 1000 },
    { sku: 'CM-TIMBER',   name: 'Structural Timber',   nameUa: 'Конструкційна деревина', category: 'SEMI_FINISHED', unit: 'тонна', baseWeightKg: 1000 },
    // Equipment items (also Product so they appear in market)
    { sku: 'EQ-MILLGRIND',name:'Flour Mill Machine', nameUa: 'Млинарська машина',category: 'EQUIPMENT_ITEM',unit: 'unit',  isEquipmentItem: true },
    { sku: 'EQ-OILPRESS', name:'Oil Press',          nameUa: 'Прес для олії',    category: 'EQUIPMENT_ITEM',unit: 'unit',  isEquipmentItem: true },
    { sku: 'EQ-FURNACE',  name:'Industrial Furnace', nameUa: 'Промислова піч',   category: 'EQUIPMENT_ITEM',unit: 'unit',  isEquipmentItem: true },
    { sku: 'EQ-TRACTOR',  name:'Agricultural Tractor',nameUa:'Сільгосптрактор',  category: 'EQUIPMENT_ITEM',unit: 'unit',  isEquipmentItem: true },
    { sku: 'EQ-SAWMILL',  name:'Sawmill',            nameUa: 'Лісопильний верстат',category:'EQUIPMENT_ITEM',unit:'unit',  isEquipmentItem: true },
    { sku: 'EQ-DAIRYLINE',name:'Dairy Processing Line',nameUa:'Молочна лінія',  category: 'EQUIPMENT_ITEM',unit: 'unit',  isEquipmentItem: true },
  ] as const;

  const products: Record<string, { id: string }> = {};
  for (const p of productData) {
    const created = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: {},
      create: {
        sku:            p.sku,
        name:           p.name,
        nameUa:         p.nameUa,
        category:       p.category as any,
        unit:           p.unit,
        baseWeightKg:   ('baseWeightKg' in p ? p.baseWeightKg : 0),
        isEquipmentItem: ('isEquipmentItem' in p ? p.isEquipmentItem : false),
      },
    });
    products[p.sku] = { id: created.id };
  }
  console.log(`Seeded ${productData.length} products.`);

  // ──────────────────────────────────────────────────────────────────────────
  // RECIPES
  // All quantities are per 1 unit of primary output.
  // ──────────────────────────────────────────────────────────────────────────
  const recipeSpecs = [
    // FOOD_PROCESSING — харчова переробка
    {
      name: 'Wheat Milling',         enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 1,            laborHoursPerUnit: 0.05, baseQuality: 7.5, powerKwhPerUnit: 0.08,
      inputs:  [{ sku: 'RM-WHEAT',   qty: 1.35 }],
      outputs: [{ sku: 'SF-FLOUR',   qty: 1.0  }],
    },
    {
      name: 'Bread Baking',          enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 1,            laborHoursPerUnit: 0.10, baseQuality: 7.0, powerKwhPerUnit: 0.18,
      inputs:  [{ sku: 'SF-FLOUR',   qty: 0.55 }],
      outputs: [{ sku: 'FG-BREAD',   qty: 1.0 }],
    },
    {
      name: 'Pasta Production',      enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 1,            laborHoursPerUnit: 0.08, baseQuality: 7.0, powerKwhPerUnit: 0.12,
      inputs:  [{ sku: 'SF-FLOUR',   qty: 1.10 }],
      outputs: [{ sku: 'FG-PASTA',   qty: 1.0 }],
    },
    {
      name: 'Sunflower Oil Pressing', enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 1,             laborHoursPerUnit: 0.06, baseQuality: 7.8, powerKwhPerUnit: 0.14,
      inputs:  [{ sku: 'RM-SUNFL',   qty: 3.20 }],
      outputs: [{ sku: 'FG-SUNOIL',  qty: 1.0 }],
    },
    {
      name: 'Sugar Refining',         enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 2,             laborHoursPerUnit: 0.12, baseQuality: 8.0, powerKwhPerUnit: 0.30,
      inputs:  [{ sku: 'RM-SUGBEET', qty: 7.50 }],
      outputs: [{ sku: 'SF-SUGAR',   qty: 1.0 }],
    },
    {
      name: 'Dairy Pasteurisation',   enterpriseType: 'FOOD_PROCESSING',
      ticksToComplete: 1,             laborHoursPerUnit: 0.07, baseQuality: 8.2, powerKwhPerUnit: 0.10,
      inputs:  [{ sku: 'RM-MILK',    qty: 1.05 }],
      outputs: [{ sku: 'FG-MILK',    qty: 1.0 }],
    },
    // AGRO_FARM — рослинництво і тваринництво
    {
      name: 'Wheat Growing',            enterpriseType: 'AGRO_FARM',
      ticksToComplete: 3,               laborHoursPerUnit: 0.006, baseQuality: 7.5, powerKwhPerUnit: 0.01,
      inputs:  [],
      outputs: [{ sku: 'RM-WHEAT',     qty: 15.0 }],
    },
    {
      name: 'Sunflower Growing',        enterpriseType: 'AGRO_FARM',
      ticksToComplete: 4,               laborHoursPerUnit: 0.007, baseQuality: 7.5, powerKwhPerUnit: 0.01,
      inputs:  [],
      outputs: [{ sku: 'RM-SUNFL',     qty: 8.0 }],
    },
    {
      name: 'Sugar Beet Growing',       enterpriseType: 'AGRO_FARM',
      ticksToComplete: 4,               laborHoursPerUnit: 0.005, baseQuality: 7.2, powerKwhPerUnit: 0.008,
      inputs:  [],
      outputs: [{ sku: 'RM-SUGBEET',   qty: 50.0 }],
    },
    {
      name: 'Dairy Farming',            enterpriseType: 'AGRO_FARM',
      ticksToComplete: 1,               laborHoursPerUnit: 0.04,  baseQuality: 8.5, powerKwhPerUnit: 0.06,
      inputs:  [],
      outputs: [{ sku: 'RM-MILK',      qty: 6.0 }],
    },
    // TEXTILE_FACTORY — важка промисловість і деревообробка (поки найближчий тип)
    {
      name: 'Steel Smelting',         enterpriseType: 'TEXTILE_FACTORY',
      ticksToComplete: 3,             laborHoursPerUnit: 0.25, baseQuality: 6.5, powerKwhPerUnit: 1.80,
      inputs:  [{ sku: 'RM-IRONORE', qty: 1.60 }, { sku: 'RM-COAL', qty: 0.55 }],
      outputs: [{ sku: 'SF-STEEL',   qty: 1.0 }],
    },
    {
      name: 'Steel Product Fabrication', enterpriseType: 'TEXTILE_FACTORY',
      ticksToComplete: 2,             laborHoursPerUnit: 0.20, baseQuality: 6.8, powerKwhPerUnit: 0.90,
      inputs:  [{ sku: 'SF-STEEL',   qty: 1.20 }],
      outputs: [{ sku: 'FG-STEEL-P', qty: 1.0 }],
    },
    {
      name: 'Sawmilling',             enterpriseType: 'TEXTILE_FACTORY',
      ticksToComplete: 1,             laborHoursPerUnit: 0.08, baseQuality: 7.0, powerKwhPerUnit: 0.22,
      inputs:  [{ sku: 'RM-LUMBER',  qty: 1.40 }],
      outputs: [{ sku: 'SF-PLANKS',  qty: 1.0 }],
    },
    {
      name: 'Furniture Manufacturing', enterpriseType: 'TEXTILE_FACTORY',
      ticksToComplete: 2,              laborHoursPerUnit: 0.80, baseQuality: 7.0, powerKwhPerUnit: 0.35,
      inputs:  [{ sku: 'SF-PLANKS',  qty: 50 }, { sku: 'SF-STEEL', qty: 5 }],
      outputs: [{ sku: 'FG-FURN',    qty: 1.0 }],
    },
  ] as const;

  for (const spec of recipeSpecs) {
    const existing = await prisma.recipe.findFirst({ where: { name: spec.name } });
    if (existing) continue;

    const recipe = await prisma.recipe.create({
      data: {
        name:             spec.name,
        enterpriseType:   spec.enterpriseType as any,
        ticksToComplete:  spec.ticksToComplete,
        laborHoursPerUnit: spec.laborHoursPerUnit,
        baseQuality:      spec.baseQuality,
        powerKwhPerUnit:  spec.powerKwhPerUnit,
      },
    });

    for (const inp of spec.inputs) {
      await prisma.recipeInput.create({
        data: {
          recipeId:       recipe.id,
          productId:      products[inp.sku].id,
          quantityPerUnit: inp.qty,
        },
      });
    }

    for (const out of spec.outputs) {
      if (out.qty <= 0) continue;
      await prisma.recipeOutput.create({
        data: {
          recipeId:       recipe.id,
          productId:      products[out.sku].id,
          quantityPerUnit: out.qty,
        },
      });
    }
  }
  console.log(`Seeded ${recipeSpecs.length} recipes.`);

  // ──────────────────────────────────────────────────────────────────────────
  // NPC DEMAND — per city, for finished goods
  // Units/day scaled by city population and demand coefficient.
  // Reference prices reflect 2026 Ukrainian retail market.
  // ──────────────────────────────────────────────────────────────────────────
  // Попит кінцевих споживачів (B2C) — одиниць/день на 1 млн осіб
  // Ціни-референс = орієнтовні роздрібні ціни 2026 (UAH, з ПДВ)
  const finishedGoodsDemand: Record<string, { baseUnits: number; priceUah: number; elasticity?: number; qualityWeight?: number }> = {
    'FG-BREAD':   { baseUnits: 600,  priceUah:    38, elasticity: -0.8, qualityWeight: 0.40 }, // хліб — нееластичний (базовий продукт)
    'FG-SUNOIL':  { baseUnits: 120,  priceUah:    85, elasticity: -1.0, qualityWeight: 0.50 }, // олія
    'FG-MILK':    { baseUnits: 350,  priceUah:    55, elasticity: -0.9, qualityWeight: 0.55 }, // молоко
    'FG-PASTA':   { baseUnits: 200,  priceUah:    48, elasticity: -1.0, qualityWeight: 0.45 }, // макарони
    'FG-STEEL-P': { baseUnits:  80,  priceUah:    65, elasticity: -1.3, qualityWeight: 0.70 }, // сталеві вироби
    'FG-FURN':    { baseUnits:   5,  priceUah:  8500, elasticity: -1.5, qualityWeight: 0.80 }, // меблі — еластичний (люксовий товар)
  };

  // Попит з боку будівельної галузі (B2B-орієнтований, але частина йде через роздріб)
  // baseUnits: тонн/день на 1 млн осіб (від нових будівництв та ремонтів)
  // Ціни-референс: оптові ціни 2026 (UAH/т або UAH/шт)
  const constructionMaterialDemand: Record<string, { baseUnits: number; priceUah: number }> = {
    'CM-CEMENT':   { baseUnits:  8.0, priceUah:  3_800 }, // цемент: 8 т/день на 1 млн
    'CM-SAND':     { baseUnits: 20.0, priceUah:    450 }, // пісок: 20 т/день
    'CM-GRAVEL':   { baseUnits: 15.0, priceUah:    800 }, // щебінь: 15 т/день
    'CM-CONCRETE': { baseUnits: 12.0, priceUah:  4_500 }, // готовий бетон: 12 т/день
    'CM-REBAR':    { baseUnits:  3.0, priceUah: 42_000 }, // арматура: 3 т/день
    'CM-TIMBER':   { baseUnits:  2.0, priceUah: 12_000 }, // деревина: 2 т/день
    'CM-BRICK':    { baseUnits: 500,  priceUah:      9 }, // цегла: 500 шт/день
  };

  const allCities = await prisma.city.findMany();
  let demandCount = 0;

  for (const city of allCities) {
    const pop           = city.population;
    const demandCoeff   = city.demandCoefficient;

    for (const [sku, spec] of Object.entries(finishedGoodsDemand)) {
      const productId = products[sku]?.id;
      if (!productId) continue;

      // baseUnits нормований на 1 млн осіб; масштабуємо до реального населення
      const scaledUnits = spec.baseUnits * (pop / 1_000_000) * demandCoeff;

      await prisma.npcDemand.upsert({
        where:  { cityId_productId: { cityId: city.id, productId } },
        update: {},
        create: {
          cityId: city.id,
          productId,
          baseUnitsPerDay: scaledUnits,
          // Ціна масштабується із зарплатним коефіцієнтом міста
          referencePrice:  spec.priceUah * city.wageCoefficient,
          priceElasticity: spec.elasticity    ?? -1.2,
          qualityWeight:   spec.qualityWeight ?? 0.55,
        },
      });
      demandCount++;
    }

    // ── Будівельні матеріали (B2B попит: підрядники, девелопери, ремонти) ──
    for (const [sku, spec] of Object.entries(constructionMaterialDemand)) {
      const productId = products[sku]?.id;
      if (!productId) continue;

      const scaledUnits = spec.baseUnits * (pop / 1_000_000) * demandCoeff;

      await prisma.npcDemand.upsert({
        where:  { cityId_productId: { cityId: city.id, productId } },
        update: {},
        create: {
          cityId: city.id,
          productId,
          baseUnitsPerDay: scaledUnits,
          referencePrice:  spec.priceUah, // оптова ціна не залежить від міського коефіцієнта
          priceElasticity: -1.4,          // будматеріали відносно еластичні (є замінники)
          qualityWeight:   0.65,          // якість важлива для міцності конструкцій
        },
      });
      demandCount++;
    }
  }
  console.log(`Seeded ${demandCount} NPC demand entries.`);

  // ──────────────────────────────────────────────────────────────────────────
  // AVAILABLE LAND PLOTS — a selection in each city for players to acquire
  // ──────────────────────────────────────────────────────────────────────────
  const landPlotTemplates = [
    // [areaM2, purchasePricePerM2, leasePricePerM2PerMonth]
    { area: 500,   purchase: 1.0,  lease: 0.007  }, // small plot
    { area: 1000,  purchase: 0.95, lease: 0.0065 }, // medium plot
    { area: 3000,  purchase: 0.85, lease: 0.0055 }, // large plot
    { area: 10000, purchase: 0.75, lease: 0.0045 }, // industrial
  ] as const;

  let plotCount = 0;
  for (const city of allCities) {
    const basePurchaseUah = 15_000 * city.landPriceCoeff; // base 15,000 UAH/m² scaled by city
    const baseLeaseUah    = 120   * city.landPriceCoeff;  // base 120 UAH/m²/month

    for (let i = 0; i < landPlotTemplates.length; i++) {
      const tmpl = landPlotTemplates[i];
      const code = `${city.name.substring(0, 3).toUpperCase()}${String(i + 1).padStart(3, '0')}`;

      const existing = await prisma.landPlot.findUnique({ where: { cadastralNumber: code } });
      if (existing) { plotCount++; continue; }

      await prisma.landPlot.create({
        data: {
          cityId:          city.id,
          cadastralNumber: code,
          status:          'AVAILABLE',
          totalAreaM2:     tmpl.area,
          purchasePriceUah:    basePurchaseUah * tmpl.purchase * tmpl.area,
          monthlyLeaseCostUah: baseLeaseUah * tmpl.area,  // 120 UAH/m²/month × area
        },
      });
      plotCount++;
    }
  }
  console.log(`Seeded ${plotCount} land plots.`);

  console.log('✓ Seed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

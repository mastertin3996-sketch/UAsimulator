import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EnterpriseCategory } from "@/generated/prisma/client";

export async function GET(req: NextRequest) { return POST(req); }

export async function POST(_req: NextRequest) {
  const results: string[] = [];

  try {
    // ── НОВІ КАТЕГОРІЇ ─────────────────────────────────────────────────────────
    const newCats = [
      { id: "cat-meat",       name: "М'ясна продукція",        icon: "🥩" },
      { id: "cat-confect",    name: "Кондитерська продукція",  icon: "🍫" },
      { id: "cat-household",  name: "Побутова хімія",          icon: "🧹" },
      { id: "cat-beverage",   name: "Напої",                   icon: "🥤" },
      { id: "cat-veg",        name: "Овочі та фрукти",         icon: "🥕" },
      { id: "cat-industrial", name: "Промислові матеріали",    icon: "🏗️" },
      { id: "cat-fuel",       name: "Паливо та енергетика",    icon: "⛽" },
    ];
    for (const c of newCats) {
      await prisma.productCategory.upsert({ where: { id: c.id }, update: {}, create: c });
    }
    results.push(`categories: ${newCats.length}`);

    // ── НОВА СИРОВИНА (RAW MATERIALS) ─────────────────────────────────────────
    const rawMaterials = [
      { id: "prod-potato",      categoryId: "cat-veg",       name: "Картопля",           unit: "кг",  basePrice: 6,   priceElasticity: 1.1, demandCoefficient: 0.003,  isRawMaterial: true,  icon: "🥔" },
      { id: "prod-sugar-beet",  categoryId: "cat-veg",       name: "Цукровий буряк",     unit: "кг",  basePrice: 4,   priceElasticity: 1.0, demandCoefficient: 0.002,  isRawMaterial: true,  icon: "🌿" },
      { id: "prod-tomato",      categoryId: "cat-veg",       name: "Томат свіжий",       unit: "кг",  basePrice: 18,  priceElasticity: 1.3, demandCoefficient: 0.003,  isRawMaterial: true,  icon: "🍅" },
      { id: "prod-egg-raw",     categoryId: "cat-raw",       name: "Яйце куряче (шт)",  unit: "шт",  basePrice: 4,   priceElasticity: 0.9, demandCoefficient: 0.005,  isRawMaterial: true,  icon: "🥚" },
      { id: "prod-pork",        categoryId: "cat-meat",      name: "Свинина (сировина)", unit: "кг",  basePrice: 80,  priceElasticity: 1.2, demandCoefficient: 0.002,  isRawMaterial: true,  icon: "🐷" },
      { id: "prod-cocoa-bean",  categoryId: "cat-raw",       name: "Какао-боби",         unit: "кг",  basePrice: 50,  priceElasticity: 1.5, demandCoefficient: 0.001,  isRawMaterial: true,  icon: "🫘" },
      { id: "prod-rice-raw",    categoryId: "cat-raw",       name: "Рис-сирець",         unit: "кг",  basePrice: 18,  priceElasticity: 1.0, demandCoefficient: 0.002,  isRawMaterial: true,  icon: "🌾" },
      { id: "prod-cotton",      categoryId: "cat-raw",       name: "Бавовна",            unit: "кг",  basePrice: 35,  priceElasticity: 1.1, demandCoefficient: 0.001,  isRawMaterial: true,  icon: "☁️" },
      { id: "prod-water-raw",   categoryId: "cat-raw",       name: "Артезіанська вода",  unit: "л",   basePrice: 1,   priceElasticity: 0.5, demandCoefficient: 0.005,  isRawMaterial: true,  icon: "💧" },
    ];
    for (const p of rawMaterials) {
      await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    results.push(`raw materials: ${rawMaterials.length}`);

    // ── НОВІ ГОТОВІ ТОВАРИ ─────────────────────────────────────────────────────
    const processedProducts = [
      // ─── Продукти харчування (кат-food) ────────────────────────────────────
      { id: "prod-sugar",        categoryId: "cat-food",      name: "Цукор",              unit: "кг",   basePrice: 28,  priceElasticity: 0.9, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🍬" },
      { id: "prod-egg-pack",     categoryId: "cat-food",      name: "Яйця (10 шт)",       unit: "упак", basePrice: 52,  priceElasticity: 0.9, demandCoefficient: 0.005,  isRawMaterial: false, icon: "🥚" },
      { id: "prod-pasta",        categoryId: "cat-food",      name: "Макарони",           unit: "кг",   basePrice: 40,  priceElasticity: 1.0, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🍝" },
      { id: "prod-rice",         categoryId: "cat-food",      name: "Рис (упак.)",        unit: "кг",   basePrice: 38,  priceElasticity: 1.0, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🍚" },
      { id: "prod-tomato-paste", categoryId: "cat-food",      name: "Томатна паста",      unit: "кг",   basePrice: 50,  priceElasticity: 1.1, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🍅" },
      { id: "prod-chips",        categoryId: "cat-food",      name: "Чіпси",              unit: "пач",  basePrice: 55,  priceElasticity: 1.5, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🥔" },
      { id: "prod-ice-cream",    categoryId: "cat-dairy",     name: "Морозиво",           unit: "шт",   basePrice: 38,  priceElasticity: 1.3, demandCoefficient: 0.005,  isRawMaterial: false, icon: "🍦" },
      // ─── М'ясна продукція (cat-meat) ───────────────────────────────────────
      { id: "prod-sausage",      categoryId: "cat-meat",      name: "Ковбаса",            unit: "кг",   basePrice: 200, priceElasticity: 1.4, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🌭" },
      { id: "prod-chicken",      categoryId: "cat-meat",      name: "Куряче м'ясо",       unit: "кг",   basePrice: 120, priceElasticity: 1.2, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🍗" },
      // ─── Кондитерська (cat-confect) ────────────────────────────────────────
      { id: "prod-chocolate",    categoryId: "cat-confect",   name: "Шоколад",            unit: "шт",   basePrice: 70,  priceElasticity: 1.6, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🍫" },
      { id: "prod-cookies",      categoryId: "cat-confect",   name: "Печиво",             unit: "кг",   basePrice: 90,  priceElasticity: 1.5, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🍪" },
      // ─── Напої (cat-beverage) ───────────────────────────────────────────────
      { id: "prod-mineral-water",categoryId: "cat-beverage",  name: "Вода мінеральна",    unit: "л",    basePrice: 18,  priceElasticity: 0.8, demandCoefficient: 0.006,  isRawMaterial: false, icon: "💧" },
      { id: "prod-juice",        categoryId: "cat-beverage",  name: "Сік томатний",       unit: "л",    basePrice: 60,  priceElasticity: 1.3, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🧃" },
      // ─── Побутова хімія (cat-household) ───────────────────────────────────
      { id: "prod-detergent",    categoryId: "cat-household", name: "Пральний порошок",   unit: "кг",   basePrice: 95,  priceElasticity: 1.2, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🧺" },
      { id: "prod-soap",         categoryId: "cat-household", name: "Туалетне мило",      unit: "шт",   basePrice: 28,  priceElasticity: 1.0, demandCoefficient: 0.005,  isRawMaterial: false, icon: "🧼" },
      { id: "prod-shampoo",      categoryId: "cat-household", name: "Шампунь",            unit: "фл",   basePrice: 95,  priceElasticity: 1.3, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🧴" },
      { id: "prod-light-bulb",   categoryId: "cat-household", name: "Лампочка LED",       unit: "шт",   basePrice: 55,  priceElasticity: 1.4, demandCoefficient: 0.003,  isRawMaterial: false, icon: "💡" },
      { id: "prod-batteries",    categoryId: "cat-household", name: "Батарейки AA 4шт",   unit: "пач",  basePrice: 75,  priceElasticity: 1.3, demandCoefficient: 0.003,  isRawMaterial: false, icon: "🔋" },
      { id: "prod-trash-bags",   categoryId: "cat-household", name: "Пакети для сміття",  unit: "рул",  basePrice: 35,  priceElasticity: 0.9, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🗑️" },
      { id: "prod-sponge",       categoryId: "cat-household", name: "Губка кухонна",      unit: "шт",   basePrice: 18,  priceElasticity: 0.8, demandCoefficient: 0.005,  isRawMaterial: false, icon: "🪣" },
      // ─── Тканина/одяг ───────────────────────────────────────────────────────
      { id: "prod-fabric",       categoryId: "cat-consumer",  name: "Тканина",            unit: "м²",   basePrice: 90,  priceElasticity: 1.2, demandCoefficient: 0.002,  isRawMaterial: false, icon: "🧵" },
      // ─── Промисловість / матеріали ───────────────────────────────────────────
      { id: "prod-aluminum",     categoryId: "cat-industrial",name: "Алюміній (профіль)", unit: "кг",   basePrice: 80,  priceElasticity: 1.2, demandCoefficient: 0.001,  isRawMaterial: false, icon: "🔩" },
      { id: "prod-copper-wire",  categoryId: "cat-industrial",name: "Мідний кабель",      unit: "м",    basePrice: 28,  priceElasticity: 1.2, demandCoefficient: 0.002,  isRawMaterial: false, icon: "🔌" },
      { id: "prod-cement",       categoryId: "cat-industrial",name: "Цемент (мішок 25кг)",unit: "шт",   basePrice: 103, priceElasticity: 1.0, demandCoefficient: 0.001,  isRawMaterial: false, icon: "🏗️" },
      // ─── Паливо ─────────────────────────────────────────────────────────────
      { id: "prod-diesel",       categoryId: "cat-fuel",      name: "Дизельне паливо",    unit: "л",    basePrice: 45,  priceElasticity: 0.8, demandCoefficient: 0.003,  isRawMaterial: false, icon: "⛽" },
      { id: "prod-natural-gas",  categoryId: "cat-fuel",      name: "Природний газ",      unit: "м³",   basePrice: 180, priceElasticity: 0.7, demandCoefficient: 0.002,  isRawMaterial: false, icon: "🔥" },
      // ─── Споживча електроніка ─────────────────────────────────────────────────
      { id: "prod-smartphone",   categoryId: "cat-consumer",  name: "Смартфон",           unit: "шт",   basePrice: 3600,priceElasticity: 2.0, demandCoefficient: 0.001,  isRawMaterial: false, icon: "📱" },
      // ─── Консерви / кава ─────────────────────────────────────────────────────
      { id: "prod-canned-food",  categoryId: "cat-food",      name: "Консерви",           unit: "шт",   basePrice: 35,  priceElasticity: 1.0, demandCoefficient: 0.004,  isRawMaterial: false, icon: "🥫" },
      { id: "prod-coffee",       categoryId: "cat-beverage",  name: "Кава мелена 250г",   unit: "упак", basePrice: 80,  priceElasticity: 1.6, demandCoefficient: 0.003,  isRawMaterial: false, icon: "☕" },
    ];
    for (const p of processedProducts) {
      await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    results.push(`processed products: ${processedProducts.length}`);

    // ── НОВІ ТИПИ ПІДПРИЄМСТВ (EXTRACTION) ───────────────────────────────────
    const extractionTypes = [
      { id: "etype-potato-farm",      name: "Картопляна ферма",        category: EnterpriseCategory.EXTRACTION, icon: "🥔", baseCapacity: 600,  workersPerUnit: 4, baseRentPerTick: 200 },
      { id: "etype-sugar-beet-farm",  name: "Буряківниця",             category: EnterpriseCategory.EXTRACTION, icon: "🌿", baseCapacity: 400,  workersPerUnit: 5, baseRentPerTick: 180 },
      { id: "etype-tomato-farm",      name: "Тепличне господарство",   category: EnterpriseCategory.EXTRACTION, icon: "🍅", baseCapacity: 300,  workersPerUnit: 5, baseRentPerTick: 250 },
      { id: "etype-poultry-farm",     name: "Птахофабрика",            category: EnterpriseCategory.EXTRACTION, icon: "🐔", baseCapacity: 3000, workersPerUnit: 4, baseRentPerTick: 220 },
      { id: "etype-pig-farm",         name: "Свиноферма",              category: EnterpriseCategory.EXTRACTION, icon: "🐷", baseCapacity: 200,  workersPerUnit: 5, baseRentPerTick: 280 },
      { id: "etype-cocoa-farm",       name: "Какао-плантація",         category: EnterpriseCategory.EXTRACTION, icon: "🫘", baseCapacity: 80,   workersPerUnit: 6, baseRentPerTick: 350 },
      { id: "etype-rice-farm",        name: "Рисова плантація",        category: EnterpriseCategory.EXTRACTION, icon: "🌾", baseCapacity: 500,  workersPerUnit: 5, baseRentPerTick: 200 },
      { id: "etype-cotton-farm",      name: "Бавовнова плантація",     category: EnterpriseCategory.EXTRACTION, icon: "☁️", baseCapacity: 300,  workersPerUnit: 5, baseRentPerTick: 220 },
      { id: "etype-water-source",     name: "Артезіанська свердловина",category: EnterpriseCategory.EXTRACTION, icon: "💧", baseCapacity: 5000, workersPerUnit: 2, baseRentPerTick: 120 },
    ];
    const productionTypes = [
      { id: "etype-sugar-factory",    name: "Цукровий завод",          category: EnterpriseCategory.PRODUCTION, icon: "🍬", baseCapacity: 200,  workersPerUnit: 8,  baseRentPerTick: 400 },
      { id: "etype-egg-packaging",    name: "Яйцева фасовка",          category: EnterpriseCategory.PRODUCTION, icon: "🥚", baseCapacity: 500,  workersPerUnit: 4,  baseRentPerTick: 250 },
      { id: "etype-meat-plant",       name: "М'ясокомбінат",           category: EnterpriseCategory.PRODUCTION, icon: "🥩", baseCapacity: 100,  workersPerUnit: 10, baseRentPerTick: 600 },
      { id: "etype-pasta-factory",    name: "Макаронна фабрика",       category: EnterpriseCategory.PRODUCTION, icon: "🍝", baseCapacity: 200,  workersPerUnit: 7,  baseRentPerTick: 400 },
      { id: "etype-chips-factory",    name: "Чіпсовий завод",          category: EnterpriseCategory.PRODUCTION, icon: "🥔", baseCapacity: 200,  workersPerUnit: 8,  baseRentPerTick: 450 },
      { id: "etype-confect-factory",  name: "Кондитерська фабрика",    category: EnterpriseCategory.PRODUCTION, icon: "🍫", baseCapacity: 150,  workersPerUnit: 8,  baseRentPerTick: 500 },
      { id: "etype-cannery",          name: "Консервний завод",         category: EnterpriseCategory.PRODUCTION, icon: "🥫", baseCapacity: 200,  workersPerUnit: 8,  baseRentPerTick: 420 },
      { id: "etype-juice-factory",    name: "Сокозавод",               category: EnterpriseCategory.PRODUCTION, icon: "🧃", baseCapacity: 300,  workersPerUnit: 7,  baseRentPerTick: 380 },
      { id: "etype-water-plant",      name: "Завод мінеральної води",  category: EnterpriseCategory.PRODUCTION, icon: "💧", baseCapacity: 2000, workersPerUnit: 5,  baseRentPerTick: 280 },
      { id: "etype-household-factory",name: "Завод побутової хімії",   category: EnterpriseCategory.PRODUCTION, icon: "🧹", baseCapacity: 200,  workersPerUnit: 10, baseRentPerTick: 550 },
      { id: "etype-textile-factory",  name: "Текстильна фабрика",      category: EnterpriseCategory.PRODUCTION, icon: "🧵", baseCapacity: 100,  workersPerUnit: 12, baseRentPerTick: 600 },
      { id: "etype-ice-cream-factory",name: "Морозивний завод",        category: EnterpriseCategory.PRODUCTION, icon: "🍦", baseCapacity: 400,  workersPerUnit: 6,  baseRentPerTick: 350 },
    ];
    for (const t of [...extractionTypes, ...productionTypes]) {
      await prisma.enterpriseType.upsert({ where: { id: t.id }, update: {}, create: t });
    }
    results.push(`enterprise types: ${extractionTypes.length + productionTypes.length}`);

    // ── НОВІ РЕЦЕПТИ ──────────────────────────────────────────────────────────
    const recipes = [
      // EXTRACTION (без вхідних матеріалів)
      { id: "recipe-potato",       name: "Збір картоплі",           outputProductId: "prod-potato",        outputAmount: 1, enterpriseTypeId: "etype-potato-farm",       category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-sugar-beet",   name: "Збір цукрового буряку",   outputProductId: "prod-sugar-beet",    outputAmount: 1, enterpriseTypeId: "etype-sugar-beet-farm",   category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-tomato",       name: "Вирощування томатів",     outputProductId: "prod-tomato",        outputAmount: 1, enterpriseTypeId: "etype-tomato-farm",       category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-eggs",         name: "Збір яєць",               outputProductId: "prod-egg-raw",       outputAmount: 1, enterpriseTypeId: "etype-poultry-farm",      category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-pork",         name: "Виробництво свинини",     outputProductId: "prod-pork",          outputAmount: 1, enterpriseTypeId: "etype-pig-farm",          category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-cocoa",        name: "Збір какао",              outputProductId: "prod-cocoa-bean",    outputAmount: 1, enterpriseTypeId: "etype-cocoa-farm",        category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-rice-raw",     name: "Збір рису",               outputProductId: "prod-rice-raw",      outputAmount: 1, enterpriseTypeId: "etype-rice-farm",         category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-cotton",       name: "Збір бавовни",            outputProductId: "prod-cotton",        outputAmount: 1, enterpriseTypeId: "etype-cotton-farm",       category: EnterpriseCategory.EXTRACTION, inputs: [] },
      { id: "recipe-water-raw",    name: "Видобуток артезіанської", outputProductId: "prod-water-raw",     outputAmount: 1, enterpriseTypeId: "etype-water-source",      category: EnterpriseCategory.EXTRACTION, inputs: [] },
      // PRODUCTION
      { id: "recipe-sugar",        name: "Виробництво цукру",       outputProductId: "prod-sugar",         outputAmount: 100, enterpriseTypeId: "etype-sugar-factory",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-sugar-beet", amount: 800 }] },
      { id: "recipe-egg-pack",     name: "Фасовка яєць",            outputProductId: "prod-egg-pack",      outputAmount: 100, enterpriseTypeId: "etype-egg-packaging",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-egg-raw",    amount: 1050 }] },
      { id: "recipe-sausage",      name: "Виробництво ковбаси",     outputProductId: "prod-sausage",       outputAmount: 80,  enterpriseTypeId: "etype-meat-plant",       category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-pork",       amount: 100 }] },
      { id: "recipe-chicken-cut",  name: "Оброблення курятини",     outputProductId: "prod-chicken",       outputAmount: 100, enterpriseTypeId: "etype-meat-plant",       category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-egg-raw",    amount: 120 }] },
      { id: "recipe-pasta",        name: "Виробництво макаронів",   outputProductId: "prod-pasta",         outputAmount: 100, enterpriseTypeId: "etype-pasta-factory",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-flour",      amount: 120 }] },
      { id: "recipe-rice-pack",    name: "Фасовка рису",            outputProductId: "prod-rice",          outputAmount: 100, enterpriseTypeId: "etype-pasta-factory",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-rice-raw",   amount: 110 }] },
      { id: "recipe-chips",        name: "Виробництво чіпсів",      outputProductId: "prod-chips",         outputAmount: 100, enterpriseTypeId: "etype-chips-factory",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-potato",     amount: 350 }] },
      { id: "recipe-chocolate",    name: "Виробництво шоколаду",    outputProductId: "prod-chocolate",     outputAmount: 100, enterpriseTypeId: "etype-confect-factory",  category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-cocoa-bean", amount: 200 }, { productId: "prod-sugar", amount: 60 }] },
      { id: "recipe-cookies",      name: "Виробництво печива",      outputProductId: "prod-cookies",       outputAmount: 100, enterpriseTypeId: "etype-confect-factory",  category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-flour",      amount: 80  }, { productId: "prod-sugar", amount: 40 }] },
      { id: "recipe-tomato-paste", name: "Томатна паста",           outputProductId: "prod-tomato-paste",  outputAmount: 100, enterpriseTypeId: "etype-cannery",          category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-tomato",     amount: 500 }] },
      { id: "recipe-juice",        name: "Виробництво соку",        outputProductId: "prod-juice",         outputAmount: 300, enterpriseTypeId: "etype-juice-factory",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-tomato",     amount: 700 }] },
      { id: "recipe-min-water",    name: "Розлив мінеральної води", outputProductId: "prod-mineral-water", outputAmount: 1000, enterpriseTypeId: "etype-water-plant",    category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-water-raw",  amount: 1050 }] },
      { id: "recipe-detergent",    name: "Пральний порошок",        outputProductId: "prod-detergent",     outputAmount: 100, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 250 }] },
      { id: "recipe-soap",         name: "Виробництво мила",        outputProductId: "prod-soap",          outputAmount: 200, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 100 }] },
      { id: "recipe-shampoo",      name: "Виробництво шампуню",     outputProductId: "prod-shampoo",       outputAmount: 100, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 200 }] },
      { id: "recipe-light-bulb",   name: "Виробництво лампочок",    outputProductId: "prod-light-bulb",    outputAmount: 100, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 50  }, { productId: "prod-steel", amount: 0.2 }] },
      { id: "recipe-batteries",    name: "Виробництво батарейок",   outputProductId: "prod-batteries",     outputAmount: 100, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 30  }] },
      { id: "recipe-trash-bags",   name: "Пакети для сміття",       outputProductId: "prod-trash-bags",    outputAmount: 200, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 50  }] },
      { id: "recipe-sponge",       name: "Кухонні губки",           outputProductId: "prod-sponge",        outputAmount: 200, enterpriseTypeId: "etype-household-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-plastic",    amount: 20  }] },
      { id: "recipe-fabric",       name: "Виробництво тканини",     outputProductId: "prod-fabric",        outputAmount: 100, enterpriseTypeId: "etype-textile-factory",  category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-cotton",     amount: 250 }] },
      { id: "recipe-clothing-v2",  name: "Пошиття одягу",           outputProductId: "prod-clothing",      outputAmount: 10,  enterpriseTypeId: "etype-textile-factory",  category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-fabric",     amount: 30  }] },
      { id: "recipe-ice-cream",    name: "Виробництво морозива",    outputProductId: "prod-ice-cream",     outputAmount: 100, enterpriseTypeId: "etype-ice-cream-factory",category: EnterpriseCategory.PRODUCTION, inputs: [{ productId: "prod-milk-raw",   amount: 150 }, { productId: "prod-sugar", amount: 30 }] },
    ];

    let recipesCreated = 0;
    for (const r of recipes) {
      const { inputs, category, ...recipeData } = r;
      const existing = await prisma.productionRecipe.findUnique({ where: { id: r.id } });
      if (!existing) {
        await prisma.productionRecipe.create({
          data: {
            ...recipeData,
            enterpriseCategory: category,
            inputs: { create: inputs },
          },
        });
        recipesCreated++;
      }
    }
    results.push(`recipes created: ${recipesCreated} (${recipes.length - recipesCreated} already existed)`);

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), results }, { status: 500 });
  }
}

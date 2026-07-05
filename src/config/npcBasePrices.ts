// Базові (довоєнні/рівноважні) ціни NPC-ринку, UAH/кг або UAH/од.
// Використовується як (1) fallback при першій генерації SELL-ордерів ДержПром
// і (2) стеля для NpcDemand.referencePrice — довідкова ціна не може піти вище
// ніж NPC_PRICE_CEILING_MULT × ця база, скільки б не тривав дефіцит пропозиції.
export const NPC_BASE_PRICES: Record<string, number> = {
  // Зернові / польові культури
  'RM-WHEAT':        3.8,
  'RM-CORN':         3.2,
  'RM-SUNFL':        6.5,
  'RM-SUGBEET':      1.4,
  'RM-BARLEY':       3.0,
  // Тваринництво-сировина
  'RM-MILK':         8.5,
  // Метали / важка промисловість
  'RM-IRONORE':      4.2,
  'RM-COAL':         3.6,
  // Деревина
  'RM-LUMBER':      12.0,
  // Текстиль
  'RM-COTTON':      28.0,
  'RM-WOOL':        45.0,
  // Напівфабрикати харчові
  'SF-FLOUR':        8.5,
  'SF-SUGAR':       15.0,
  'SF-CORN-STARCH': 11.0,
  'SF-MALT':        18.0,
  // Напівфабрикати промислові
  'SF-STEEL':       42.0,
  'SF-PLANKS':      15.0,
  'SF-FABRIC':      65.0,
  'SF-YARN':        55.0,
  // Тваринництво (жива худоба — ціна за голову)
  'RM-LIVESTOCK':      250,
  'RM-CATTLE':      45_000,
  'RM-PIGS':        12_000,
  'RM-POULTRY':       120,
  // Молочне
  'SF-MILK':           8.5,
  // Органічні культури (ціна за тонну)
  'RM-WHEAT-ORG':  9_500,
  'RM-CORN-ORG':   7_200,
  // Готові товари (FG)
  'FG-BREAD':         32,
  'FG-SUNOIL':        75,
  'FG-MILK':          28,
  'FG-PASTA':         52,
  'FG-STEEL-P':      185,
  'FG-FURN':        8_500,
  'FG-MEAT':         175,
  'FG-CAKE':         145,
  'FG-CORN-SYRUP':    95,
  'FG-CONDENSED-MILK':88,
  'FG-CHEESE':       185,
  'FG-BUTTER':       220,
  'FG-SAUSAGE':      210,
  'FG-HONEY':        380,
  'FG-BEER':          55,
  'FG-SPIRITS':      220,
  'FG-CLOTHING':     850,
  'FG-KNITWEAR':     680,
  'FG-BEEF':         290,
  'FG-PORK':         195,
  'FG-CHICKEN':      125,
  'FG-EGGS':          58,
  // Агро витратники
  'AG-FERTILIZER':  200.0,
  'SF-COMPOST':       1.3,
  'RM-PESTICIDE':    4.5,
  // Будівельні матеріали (ціна за одиницю: тонна або шт)
  'CM-CEMENT':    3_800,
  'CM-SAND':        450,
  'CM-GRAVEL':      800,
  'CM-BRICK':         9,
  'CM-CONCRETE':  4_500,
  'CM-REBAR':    42_000,
  'CM-TIMBER':   12_000,
};

// Довідкова ціна NPC не може перевищувати цю кратність базової ціни.
export const NPC_PRICE_CEILING_MULT = 1.4;

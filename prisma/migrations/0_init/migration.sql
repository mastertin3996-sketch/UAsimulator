-- CreateEnum
CREATE TYPE "ConstructionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomsStatus" AS ENUM ('PENDING', 'CLEARED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CustomsType" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'SPOILING', 'FAILED');

-- CreateEnum
CREATE TYPE "DepositCurrency" AS ENUM ('UAH', 'USD');

-- CreateEnum
CREATE TYPE "EnergySourceType" AS ENUM ('GRID', 'SOLAR_AUTONOMOUS', 'DIESEL_BACKUP');

-- CreateEnum
CREATE TYPE "EnterpriseType" AS ENUM ('OFFICE', 'AGRO_FARM', 'TEXTILE_FACTORY', 'FOOD_PROCESSING', 'RETAIL_STORE', 'WAREHOUSE', 'LOGISTICS_HUB', 'RD_LABORATORY');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('NEW', 'OPERATIONAL', 'WORN', 'BROKEN');

-- CreateEnum
CREATE TYPE "FinancialLogCategory" AS ENUM ('REVENUE_RETAIL', 'REVENUE_B2B', 'EXPENSE_SALARY', 'EXPENSE_ESV', 'EXPENSE_TAX', 'EXPENSE_ENERGY', 'EXPENSE_LOGISTICS', 'EXPENSE_LEASE', 'EXPENSE_INTEREST', 'EXPENSE_MAINTENANCE', 'EXPENSE_DEPRECIATION', 'ADJUSTMENT', 'REVENUE_MA', 'EXPENSE_MA');

-- CreateEnum
CREATE TYPE "ForwardContractStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LandStatus" AS ENUM ('AVAILABLE', 'OWNED', 'LEASED');

-- CreateEnum
CREATE TYPE "LegalActionStatus" AS ENUM ('PLAINTIFF_WON', 'DEFENDANT_WON', 'SETTLED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('AGRO_PERMIT', 'MANUFACTURING_LICENSE', 'RETAIL_PERMIT', 'AGRO_INSURANCE', 'EXCISE_LICENSE', 'ORGANIC_CERT');

-- CreateEnum
CREATE TYPE "LivestockSpecies" AS ENUM ('CATTLE', 'PIGS', 'POULTRY');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'DEFAULTED', 'PAID_OFF');

-- CreateEnum
CREATE TYPE "MaDealStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MachineryType" AS ENUM ('TRACTOR', 'COMBINE_HARVESTER', 'SEEDER', 'SPRAYER');

-- CreateEnum
CREATE TYPE "MacroEventStatus" AS ENUM ('ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MacroEventType" AS ENUM ('POWER_OUTAGE', 'LOGISTICS_BOTTLENECK', 'GRAIN_MARKET_BOOM', 'DROUGHT', 'PEST_ATTACK', 'CURRENCY_SHOCK', 'LATE_FROST', 'HAIL', 'FLOOD', 'AGRO_FAIR');

-- CreateEnum
CREATE TYPE "MarketOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MarketOrderType" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('USDT_TRC20', 'USDT_ERC20', 'PAYPAL');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD', 'EQUIPMENT_ITEM');

-- CreateEnum
CREATE TYPE "Profession" AS ENUM ('ACCOUNTANT', 'MANAGER', 'OPERATOR', 'ENGINEER', 'AGRONOMIST', 'LOADER', 'DRIVER', 'SECURITY_GUARD', 'SECURITY_OFFICER', 'CLEANER', 'SALES_REP', 'IT_SPECIALIST', 'LAWYER', 'HR_SPECIALIST', 'TECHNICIAN', 'QUALITY_CONTROLLER', 'RESEARCHER', 'DATA_SCIENTIST', 'CASHIER', 'SALES_ASSISTANT', 'MERCHANDISER', 'VETERINARIAN', 'COMBINE_OPERATOR', 'FIELD_WORKER', 'GRAIN_SPECIALIST', 'BEEKEEPER', 'LIVESTOCK_WORKER', 'IRRIGATOR', 'TRACTOR_OPERATOR', 'FARM_WORKER', 'MILKMAID', 'MILKING_OPERATOR', 'DEBONER', 'SLAUGHTER_TECH', 'WEAVER', 'TAILOR');

-- CreateEnum
CREATE TYPE "RatingCategory" AS ENUM ('GRAIN_PRODUCER', 'RETAIL_KING', 'TENDER_CHAMPION');

-- CreateEnum
CREATE TYPE "SeedQuality" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "StockOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockOrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "SubsidyType" AS ENUM ('AGRO_DEVELOPMENT', 'GREEN_TRANSITION', 'REGIONAL_STIMULUS');

-- CreateEnum
CREATE TYPE "SyndicateRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "SyndicateVoteStatus" AS ENUM ('OPEN', 'PASSED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "SyndicateVoteType" AS ENUM ('AD_CAMPAIGN', 'INSURANCE_FUND');

-- CreateEnum
CREATE TYPE "TechCode" AS ENUM ('LEAN_PRODUCTION', 'GREEN_ENERGY', 'ADVANCED_LOGISTICS', 'HIGH_TECH_AGRO');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('OPEN', 'FULFILLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INITIAL_DEPOSIT', 'LAND_PURCHASE', 'LAND_LEASE_PAYMENT', 'CONSTRUCTION_COST', 'EQUIPMENT_PURCHASE', 'ENERGY_BILL', 'SALARY_PAYMENT', 'TAX_PAYMENT', 'MARKET_SALE', 'MARKET_PURCHASE', 'MAINTENANCE_COST', 'NPC_SALE', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'FREIGHT_PAYMENT', 'BANKRUPTCY_LIQUIDATION', 'LOAN_INTEREST_PAYMENT', 'REGULATORY_FINE', 'LICENSE_FEE', 'MACRO_EVENT_CHARGE', 'MACRO_EVENT_BONUS', 'RD_INVESTMENT', 'AUTO_PROCUREMENT', 'STATE_SUBSIDY', 'FX_EXCHANGE_BUY', 'FX_EXCHANGE_SELL', 'CUSTOMS_DUTY', 'CUSTOMS_VAT', 'CUSTOMS_STORAGE_FEE', 'EXPORT_SALE', 'IMPORT_PURCHASE', 'GREEN_ENERGY_INSTALL', 'DIESEL_FUEL_COST', 'SECURITY_MAINTENANCE', 'PATENT_REGISTRATION_FEE', 'COURT_PENALTY_DEBIT', 'COURT_PENALTY_CREDIT', 'HOSTILE_ASSET_FREEZE_FEE', 'MA_ACQUISITION_COST', 'MA_SALE_REVENUE', 'DEPOSIT_OPEN', 'DEPOSIT_MATURITY', 'REVENUE_INTEREST', 'OVERDRAFT_DRAWDOWN', 'OVERDRAFT_INTEREST', 'IPO_PROCEEDS', 'STOCK_BUY', 'STOCK_SELL', 'DIVIDEND_PAYMENT', 'GM_ADJUSTMENT', 'INTERNAL_TRANSFER', 'LOGISTICS_FREIGHT', 'REGULATORY_INSPECTION_FEE', 'DAILY_LOGIN_BONUS');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unlockedAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoContract" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "resourceType" TEXT NOT NULL,
    "maxPricePerUnit" DECIMAL(12,4) NOT NULL,
    "minQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantityPerTick" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTickSpentUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastFilledQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastExecutedTick" BIGINT,
    "totalSpentUah" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bTransferAgreement" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sourceEnterpriseId" TEXT NOT NULL,
    "targetEnterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerTick" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DECIMAL(14,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAtTick" BIGINT NOT NULL,
    "lastExecutedTick" BIGINT,
    "totalTransferred" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bTransferAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameUa" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "population" INTEGER NOT NULL,
    "wageCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "wageBaselineUah" DECIMAL(10,2) NOT NULL,
    "energyTariffUah" DECIMAL(8,4) NOT NULL,
    "demandCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "landPriceCoeff" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRecord" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastAuditTick" BIGINT,
    "consecutiveViolations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionProject" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ConstructionStatus" NOT NULL DEFAULT 'PLANNED',
    "totalCostUah" DECIMAL(14,2) NOT NULL,
    "paidCostUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ticksRequired" INTEGER NOT NULL,
    "ticksRemaining" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "footprintM2" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" "CustomsType" NOT NULL,
    "status" "CustomsStatus" NOT NULL DEFAULT 'PENDING',
    "resourceType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "customsValueUsd" DECIMAL(18,4) NOT NULL,
    "dutyPaidUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatPaidUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "storageFeeAccruedUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fxRateAtCreation" DECIMAL(10,4) NOT NULL,
    "destinationCityId" TEXT,
    "createdAtTick" BIGINT NOT NULL,
    "clearedAtTick" BIGINT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLoginBonus" (
    "playerId" TEXT NOT NULL,
    "lastClaimedTick" BIGINT NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLoginBonus_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "DailySnapshot" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tickNumber" BIGINT NOT NULL,
    "gameWeek" BIGINT NOT NULL,
    "cashBalance" DECIMAL(18,2) NOT NULL,
    "totalAssetsValue" DECIMAL(18,2) NOT NULL,
    "revenueUah" DECIMAL(18,2) NOT NULL,
    "opexUah" DECIMAL(18,2) NOT NULL,
    "taxPaidUah" DECIMAL(18,2) NOT NULL,
    "netProfitUah" DECIMAL(18,2) NOT NULL,
    "averageWorkerMood" DOUBLE PRECISION NOT NULL,
    "activeEnterprises" INTEGER NOT NULL,
    "employeeCount" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "currency" "DepositCurrency" NOT NULL,
    "principalAmount" DECIMAL(18,4) NOT NULL,
    "annualYieldRate" DECIMAL(6,4) NOT NULL,
    "startTick" BIGINT NOT NULL,
    "durationTicks" BIGINT NOT NULL,
    "isMatured" BOOLEAN NOT NULL DEFAULT false,
    "finalAmountPaid" DECIMAL(18,4),
    "maturedAtTick" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "profession" "Profession" NOT NULL,
    "salaryUah" DECIMAL(10,2) NOT NULL,
    "mood" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "baseEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isOnStrike" BOOLEAN NOT NULL DEFAULT false,
    "strikeStartedTick" BIGINT,
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPaidAt" TIMESTAMP(3),
    "accruedSalaryUah" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "qualificationLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyBill" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "tickNumber" BIGINT NOT NULL,
    "consumptionKwh" DOUBLE PRECISION NOT NULL,
    "tariffUah" DECIMAL(8,4) NOT NULL,
    "totalUah" DECIMAL(14,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyContract" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "fixedTariffUah" DECIMAL(8,4) NOT NULL,
    "maxKwhPerTick" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAtTick" BIGINT NOT NULL,
    "expiresAtTick" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "landPlotId" TEXT NOT NULL,
    "type" "EnterpriseType" NOT NULL,
    "name" TEXT NOT NULL,
    "footprintM2" DOUBLE PRECISION NOT NULL,
    "totalFloorAreaM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedFloorAreaM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isOperational" BOOLEAN NOT NULL DEFAULT false,
    "constructedAt" TIMESTAMP(3),
    "basePowerKwhPerTick" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "isCollateral" BOOLEAN NOT NULL DEFAULT false,
    "isSeized" BOOLEAN NOT NULL DEFAULT false,
    "isFrozenByInspection" BOOLEAN NOT NULL DEFAULT false,
    "inspectionFreezeUntilTick" BIGINT,
    "isLegallyFrozen" BOOLEAN NOT NULL DEFAULT false,
    "legalFreezeReason" TEXT,
    "legalFreezeUntilTick" BIGINT,
    "energySourceType" "EnergySourceType" NOT NULL DEFAULT 'GRID',
    "solarCapacityKw" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "batteryCapacityKwh" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currentBatteryKwh" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "extraFieldAreaM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraFieldRentUah" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "localWeatherDesc" TEXT,
    "localWeatherEndsAtTick" BIGINT,
    "localWeatherMod" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "energySoldKwhTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agroTourismEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agroTourismRevenuePerTick" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseInventory" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoSellThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoSellPriceUah" DECIMAL(12,4),

    CONSTRAINT "EnterpriseInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "catalogProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'NEW',
    "wearAndTear" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "wearRatePerTick" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
    "isBroken" BOOLEAN NOT NULL DEFAULT false,
    "energyConsumptionKw" DOUBLE PRECISION NOT NULL,
    "baseQualityModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "marketValueUah" DECIMAL(14,2) NOT NULL,
    "maintenanceCostUah" DECIMAL(12,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMaintenanceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmMachinery" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "machineryType" "MachineryType" NOT NULL,
    "name" TEXT NOT NULL,
    "purchasePriceUah" DECIMAL(14,2) NOT NULL,
    "durability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isRented" BOOLEAN NOT NULL DEFAULT false,
    "rentCostPerTick" DECIMAL(14,2),
    "isOperational" BOOLEAN NOT NULL DEFAULT true,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRepairAt" TIMESTAMP(3),

    CONSTRAINT "FarmMachinery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "category" "FinancialLogCategory" NOT NULL,
    "amountUah" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "tickNumber" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountUah" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRateSingleton" (
    "id" TEXT NOT NULL,
    "usdToUah" DECIMAL(10,4) NOT NULL,
    "baseRate" DECIMAL(10,4) NOT NULL,
    "cumulativeExportUsd" DECIMAL(22,4) NOT NULL DEFAULT 0,
    "cumulativeImportUsd" DECIMAL(22,4) NOT NULL DEFAULT 0,
    "lastUpdatedTick" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRateSingleton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTick" (
    "id" BIGSERIAL NOT NULL,
    "tickNumber" BIGINT NOT NULL,
    "gameDay" BIGINT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "GameTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalMarketTicker" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "priceUsd" DECIMAL(12,4) NOT NULL,
    "previousPriceUsd" DECIMAL(12,4) NOT NULL,
    "baselineUsd" DECIMAL(12,4) NOT NULL,
    "volatilityPct" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "changePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAtTick" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalMarketTicker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrainForwardContract" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityUnits" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DECIMAL(14,4) NOT NULL,
    "createdAtTick" BIGINT NOT NULL,
    "deliveryTick" BIGINT NOT NULL,
    "status" "ForwardContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "penaltyPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrainForwardContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRAutomationPolicy" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoAdjustSalaries" BOOLEAN NOT NULL DEFAULT true,
    "targetMood" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "maxSalaryCapUah" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRAutomationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceReport" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "costUah" DECIMAL(12,2) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "detected" BOOLEAN NOT NULL DEFAULT false,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPlot" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "playerId" TEXT,
    "cadastralNumber" TEXT NOT NULL,
    "status" "LandStatus" NOT NULL DEFAULT 'AVAILABLE',
    "totalAreaM2" DOUBLE PRECISION NOT NULL,
    "usedAreaM2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasePriceUah" DECIMAL(14,2) NOT NULL,
    "monthlyLeaseCostUah" DECIMAL(12,2) NOT NULL,
    "soilQuality" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "lastCropSku" TEXT,
    "leaseStartDate" TIMESTAMP(3),
    "leaseEndDate" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "fertilizerTicksLeft" INTEGER NOT NULL DEFAULT 0,
    "pestDamageMult" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cropDiseaseSeverity" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "cropDiseaseType" TEXT,
    "isOwned" BOOLEAN NOT NULL DEFAULT false,
    "seedQuality" "SeedQuality" NOT NULL DEFAULT 'STANDARD',
    "fieldOpsMask" INTEGER NOT NULL DEFAULT 0,
    "grainQualityClass" INTEGER NOT NULL DEFAULT 2,
    "moistureLevel" DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    "nitrogenLevel" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
    "phosphorusLevel" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
    "potassiumLevel" DOUBLE PRECISION NOT NULL DEFAULT 70.0,

    CONSTRAINT "LandPlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandPlotListing" (
    "id" TEXT NOT NULL,
    "landPlotId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "askingPriceUah" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandPlotListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAction" (
    "id" TEXT NOT NULL,
    "plaintiffId" TEXT NOT NULL,
    "defendantId" TEXT NOT NULL,
    "technologyCode" TEXT NOT NULL,
    "status" "LegalActionStatus" NOT NULL,
    "plaintiffLawyerScore" DOUBLE PRECISION NOT NULL,
    "defendantLawyerScore" DOUBLE PRECISION NOT NULL,
    "benefitUah" DECIMAL(18,2) NOT NULL,
    "penaltyUah" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "resolvedAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "type" "LicenseType" NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAtTick" BIGINT NOT NULL,
    "expiresAtTick" BIGINT NOT NULL,
    "revokedAtTick" BIGINT,
    "feePaidUah" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivestockHerd" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "species" "LivestockSpecies" NOT NULL,
    "headCount" INTEGER NOT NULL,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ageInTicks" INTEGER NOT NULL DEFAULT 0,
    "feedSkippedTicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivestockHerd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "principalUah" DECIMAL(18,2) NOT NULL,
    "remainingUah" DECIMAL(18,2) NOT NULL,
    "annualInterestPct" DOUBLE PRECISION NOT NULL,
    "monthlyPaymentUah" DECIMAL(14,2) NOT NULL,
    "dailyPaymentUah" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL,
    "paidMonths" INTEGER NOT NULL DEFAULT 0,
    "missedPayments" INTEGER NOT NULL DEFAULT 0,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextPaymentTick" BIGINT NOT NULL,
    "paymentFrequencyTicks" INTEGER NOT NULL DEFAULT 30,
    "fullyPaidAt" TIMESTAMP(3),
    "collateralEnterpriseId" TEXT,
    "collateralReleased" BOOLEAN NOT NULL DEFAULT false,
    "collateralForwardContractId" TEXT,
    "loanType" TEXT,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "totalUah" DECIMAL(14,2) NOT NULL,
    "principalUah" DECIMAL(14,2) NOT NULL,
    "interestUah" DECIMAL(14,2) NOT NULL,
    "wasOnTime" BOOLEAN NOT NULL DEFAULT true,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsFreightOrder" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT,
    "carrierId" TEXT,
    "productSku" TEXT NOT NULL,
    "quantityUnits" DOUBLE PRECISION NOT NULL,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,
    "tariffPerUnit" DECIMAL(14,4) NOT NULL,
    "totalValueUah" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "postedAtTick" BIGINT NOT NULL,
    "expiresAtTick" BIGINT NOT NULL,
    "acceptedAtTick" BIGINT,
    "completedAtTick" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsFreightOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsRoute" (
    "id" TEXT NOT NULL,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "riskFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "roadQuality" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "LogisticsRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaDeal" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT,
    "sellerId" TEXT NOT NULL,
    "targetEnterpriseId" TEXT,
    "transactionAmountUah" DECIMAL(22,2) NOT NULL,
    "status" "MaDealStatus" NOT NULL DEFAULT 'PENDING',
    "listedAtTick" BIGINT NOT NULL,
    "executedAtTick" BIGINT,
    "canceledAtTick" BIGINT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroEvent" (
    "id" TEXT NOT NULL,
    "type" "MacroEventType" NOT NULL,
    "status" "MacroEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "affectedCityId" TEXT,
    "affectedFromCityId" TEXT,
    "affectedToCityId" TEXT,
    "demandMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "startTick" BIGINT NOT NULL,
    "endTick" BIGINT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "MacroEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "type" "MarketOrderType" NOT NULL,
    "status" "MarketOrderStatus" NOT NULL DEFAULT 'OPEN',
    "pricePerUnit" DECIMAL(12,4) NOT NULL,
    "qualityMin" DOUBLE PRECISION,
    "quality" DOUBLE PRECISION,
    "quantityTotal" DOUBLE PRECISION NOT NULL,
    "quantityFilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" TIMESTAMP(3),
    "isStateOrder" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTrade" (
    "id" TEXT NOT NULL,
    "sellOrderId" TEXT NOT NULL,
    "buyOrderId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DECIMAL(12,4) NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcDemand" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseUnitsPerDay" DOUBLE PRECISION NOT NULL,
    "referencePrice" DECIMAL(12,4) NOT NULL,
    "priceElasticity" DOUBLE PRECISION NOT NULL DEFAULT -1.2,
    "qualityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.6,

    CONSTRAINT "NpcDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "sizeM2" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "energyConsumptionKwhPerTick" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "monthlyRentUah" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isOperational" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "technologyCode" TEXT NOT NULL,
    "licenseRoyaltyPct" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingDelivery" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "freightCostUah" DECIMAL(14,2) NOT NULL,
    "ticksTotal" INTEGER NOT NULL,
    "ticksRemaining" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "spoiledPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),

    CONSTRAINT "PendingDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isNpcSeller" BOOLEAN NOT NULL DEFAULT false,
    "isAccreditedSupplier" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "companyName" TEXT NOT NULL DEFAULT 'Моя компанія',
    "cashBalance" DECIMAL(18,2) NOT NULL DEFAULT 500000,
    "balanceUsd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netWorth" DECIMAL(18,2) NOT NULL DEFAULT 500000,
    "creditRating" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overdraftLimitUah" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currentOverdraftUsageUah" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "companyValuationUah" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "isListedForSale" BOOLEAN NOT NULL DEFAULT false,
    "minimumSalePriceUah" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "activeResearchTechId" TEXT,
    "insolvencyTickCount" INTEGER NOT NULL DEFAULT 0,
    "isOperationsFrozen" BOOLEAN NOT NULL DEFAULT false,
    "isBankrupt" BOOLEAN NOT NULL DEFAULT false,
    "bankruptcyStartedAt" TIMESTAMP(3),
    "creditScore" INTEGER NOT NULL DEFAULT 500,
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerInventory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTechnology" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "technologyId" TEXT NOT NULL,
    "currentProgressPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "unlockedAtTick" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTechnology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "alertBelow" DECIMAL(12,4),
    "alertAbove" DECIMAL(12,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameUa" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "baseWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseVolumeLitre" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isEquipmentItem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "tickNumber" BIGINT NOT NULL,
    "unitsProduced" DOUBLE PRECISION NOT NULL,
    "avgQuality" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "targetQuantity" DOUBLE PRECISION NOT NULL,
    "completedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputQuality" DOUBLE PRECISION,
    "status" "ConstructionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "ticksRemaining" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingAward" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "category" "RatingCategory" NOT NULL,
    "rank" INTEGER NOT NULL,
    "tick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enterpriseType" "EnterpriseType" NOT NULL,
    "ticksToComplete" INTEGER NOT NULL DEFAULT 1,
    "laborHoursPerUnit" DOUBLE PRECISION NOT NULL,
    "baseQuality" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "powerKwhPerUnit" DOUBLE PRECISION NOT NULL,
    "nameUa" TEXT,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeInput" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RecipeInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeOutput" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RecipeOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryInspection" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "inspectionType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "fineUah" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freezeTicks" INTEGER NOT NULL DEFAULT 0,
    "findings" TEXT NOT NULL DEFAULT '',
    "conductedAtTick" BIGINT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplenishRule" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minStockTicks" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "maxPricePerUnit" DECIMAL(14,4) NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplenishRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailListing" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pricePerUnit" DECIMAL(12,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "promotionActive" BOOLEAN NOT NULL DEFAULT false,
    "promotionEndTick" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySystem" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "securityLevel" INTEGER NOT NULL DEFAULT 1,
    "guardCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyUpkeepUah" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installedAtTick" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderRegistry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tickerId" TEXT NOT NULL,
    "sharesCount" BIGINT NOT NULL,

    CONSTRAINT "ShareholderRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateBudget" (
    "id" TEXT NOT NULL,
    "totalTaxRevenue" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "accumulatedPdv" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "accumulatedOpexTaxes" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "allocatedSubsidiesTotal" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "customsRevenueUah" DECIMAL(22,2) NOT NULL DEFAULT 0,
    "lastAggregatedTick" BIGINT,
    "lastAggregatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOrderBook" (
    "id" TEXT NOT NULL,
    "tickerId" TEXT NOT NULL,
    "type" "StockOrderType" NOT NULL,
    "placedByPlayerId" TEXT,
    "pricePerShareUah" DECIMAL(18,4) NOT NULL,
    "quantity" BIGINT NOT NULL,
    "filledQuantity" BIGINT NOT NULL DEFAULT 0,
    "status" "StockOrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAtTick" BIGINT NOT NULL,
    "filledAtTick" BIGINT,
    "cancelledAtTick" BIGINT,

    CONSTRAINT "StockOrderBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTicker" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "totalSharesIssued" BIGINT NOT NULL,
    "freeFloatShares" BIGINT NOT NULL DEFAULT 0,
    "lastTradedPriceUah" DECIMAL(18,4) NOT NULL,
    "targetValuationUah" DECIMAL(22,2) NOT NULL,
    "marketCapUah" DECIMAL(22,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipoExecutedAtTick" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTicker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubsidyApplication" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "subsidyType" "SubsidyType" NOT NULL,
    "baseCapexUah" DECIMAL(18,2) NOT NULL,
    "subsidyAmountUah" DECIMAL(14,2) NOT NULL,
    "appliedAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubsidyApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubsidyProgram" (
    "id" TEXT NOT NULL,
    "type" "SubsidyType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableFundsUah" DECIMAL(22,2) NOT NULL,
    "subsidyPercentage" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "enterpriseTypes" TEXT NOT NULL DEFAULT '[]',
    "minComplianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubsidyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOffer" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "pricePerUnit" DECIMAL(12,4) NOT NULL,
    "quantityPerTick" DOUBLE PRECISION NOT NULL,
    "minQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "acceptedByCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRoute" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sourceEnterpriseId" TEXT NOT NULL,
    "targetEnterpriseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyPerTick" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Syndicate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "treasury" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaignEndsAtTick" BIGINT,

    CONSTRAINT "Syndicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyndicateMember" (
    "id" TEXT NOT NULL,
    "syndicateId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "SyndicateRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyndicateMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyndicateVote" (
    "id" TEXT NOT NULL,
    "syndicateId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "type" "SyndicateVoteType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SyndicateVoteStatus" NOT NULL DEFAULT 'OPEN',
    "yesVotes" INTEGER NOT NULL DEFAULT 0,
    "noVotes" INTEGER NOT NULL DEFAULT 0,
    "votedPlayerIds" TEXT[],
    "expiresAtTick" BIGINT NOT NULL,
    "createdAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyndicateVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInspection" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "evadedAmountUah" DECIMAL(18,2) NOT NULL,
    "fineAmountUah" DECIMAL(18,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAtTick" BIGINT,
    "conductedAtTick" BIGINT NOT NULL,
    "frozenEnterpriseIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRecord" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "vatUah" DECIMAL(14,2) NOT NULL,
    "citUah" DECIMAL(14,2) NOT NULL,
    "esvUah" DECIMAL(14,2) NOT NULL,
    "pdfoUah" DECIMAL(14,2) NOT NULL,
    "militaryTaxUah" DECIMAL(14,2) NOT NULL,
    "totalUah" DECIMAL(14,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" TEXT NOT NULL,
    "code" "TechCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredResearchPoints" DOUBLE PRECISION NOT NULL,
    "tier" INTEGER NOT NULL,
    "prerequisites" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityRequired" DOUBLE PRECISION NOT NULL,
    "pricePerUnitUah" DECIMAL(12,4) NOT NULL,
    "expiresAtTick" BIGINT NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'OPEN',
    "winnerId" TEXT,
    "createdAtTick" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "costUah" DECIMAL(12,2) NOT NULL,
    "ticksRequired" INTEGER NOT NULL,
    "ticksRemaining" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "maxVolumeM3" DOUBLE PRECISION NOT NULL,
    "usedVolumeM3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseRentalOffer" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pricePerTick" DECIMAL(12,2) NOT NULL,
    "capacityKg" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseRentalOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseRentalSubscription" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startTick" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseRentalSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amountPC" DOUBLE PRECISION NOT NULL,
    "amountUSD" DOUBLE PRECISION NOT NULL,
    "payoutMethod" "PayoutMethod" NOT NULL,
    "payoutAddress" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "footprintM2" DOUBLE PRECISION NOT NULL,
    "maxCapacity" DOUBLE PRECISION NOT NULL,
    "currentVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "basePowerKwhPerTick" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "activatesAtTick" BIGINT,
    "harvestAccumulated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoFertilize" BOOLEAN NOT NULL DEFAULT false,
    "autoHarvest" BOOLEAN NOT NULL DEFAULT false,
    "grainMoisturePct" DOUBLE PRECISION NOT NULL DEFAULT 14.0,
    "plantedSeasonTick" BIGINT,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_playerId_code_key" ON "Achievement"("playerId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "Achievement_playerId_idx" ON "Achievement"("playerId" ASC);

-- CreateIndex
CREATE INDEX "AutoContract_buyerId_isActive_idx" ON "AutoContract"("buyerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "AutoContract_resourceType_isActive_idx" ON "AutoContract"("resourceType" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "B2bTransferAgreement_playerId_isActive_idx" ON "B2bTransferAgreement"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "B2bTransferAgreement_sourceEnterpriseId_idx" ON "B2bTransferAgreement"("sourceEnterpriseId" ASC);

-- CreateIndex
CREATE INDEX "City_name_idx" ON "City"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRecord_playerId_key" ON "ComplianceRecord"("playerId" ASC);

-- CreateIndex
CREATE INDEX "ComplianceRecord_score_idx" ON "ComplianceRecord"("score" ASC);

-- CreateIndex
CREATE INDEX "ConstructionProject_enterpriseId_status_idx" ON "ConstructionProject"("enterpriseId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "CustomsDeclaration_createdAtTick_idx" ON "CustomsDeclaration"("createdAtTick" ASC);

-- CreateIndex
CREATE INDEX "CustomsDeclaration_playerId_status_idx" ON "CustomsDeclaration"("playerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "CustomsDeclaration_status_createdAtTick_idx" ON "CustomsDeclaration"("status" ASC, "createdAtTick" ASC);

-- CreateIndex
CREATE INDEX "DailySnapshot_playerId_gameWeek_idx" ON "DailySnapshot"("playerId" ASC, "gameWeek" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailySnapshot_playerId_tickNumber_key" ON "DailySnapshot"("playerId" ASC, "tickNumber" ASC);

-- CreateIndex
CREATE INDEX "DailySnapshot_tickNumber_idx" ON "DailySnapshot"("tickNumber" ASC);

-- CreateIndex
CREATE INDEX "Deposit_isMatured_startTick_idx" ON "Deposit"("isMatured" ASC, "startTick" ASC);

-- CreateIndex
CREATE INDEX "Deposit_playerId_isMatured_idx" ON "Deposit"("playerId" ASC, "isMatured" ASC);

-- CreateIndex
CREATE INDEX "Employee_enterpriseId_idx" ON "Employee"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "Employee_playerId_idx" ON "Employee"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Employee_profession_idx" ON "Employee"("profession" ASC);

-- CreateIndex
CREATE INDEX "EnergyBill_playerId_idx" ON "EnergyBill"("playerId" ASC);

-- CreateIndex
CREATE INDEX "EnergyBill_tickNumber_idx" ON "EnergyBill"("tickNumber" ASC);

-- CreateIndex
CREATE INDEX "EnergyContract_enterpriseId_isActive_idx" ON "EnergyContract"("enterpriseId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "EnergyContract_expiresAtTick_idx" ON "EnergyContract"("expiresAtTick" ASC);

-- CreateIndex
CREATE INDEX "EnergyContract_playerId_idx" ON "EnergyContract"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Enterprise_landPlotId_idx" ON "Enterprise"("landPlotId" ASC);

-- CreateIndex
CREATE INDEX "Enterprise_playerId_idx" ON "Enterprise"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Enterprise_type_idx" ON "Enterprise"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseInventory_enterpriseId_productId_key" ON "EnterpriseInventory"("enterpriseId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status" ASC);

-- CreateIndex
CREATE INDEX "Equipment_workshopId_idx" ON "Equipment"("workshopId" ASC);

-- CreateIndex
CREATE INDEX "FarmMachinery_enterpriseId_idx" ON "FarmMachinery"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "FarmMachinery_playerId_idx" ON "FarmMachinery"("playerId" ASC);

-- CreateIndex
CREATE INDEX "FinancialLog_playerId_category_tickNumber_idx" ON "FinancialLog"("playerId" ASC, "category" ASC, "tickNumber" ASC);

-- CreateIndex
CREATE INDEX "FinancialLog_playerId_tickNumber_idx" ON "FinancialLog"("playerId" ASC, "tickNumber" ASC);

-- CreateIndex
CREATE INDEX "FinancialLog_tickNumber_idx" ON "FinancialLog"("tickNumber" ASC);

-- CreateIndex
CREATE INDEX "FinancialTransaction_playerId_createdAt_idx" ON "FinancialTransaction"("playerId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FinancialTransaction_type_idx" ON "FinancialTransaction"("type" ASC);

-- CreateIndex
CREATE INDEX "GameTick_tickNumber_idx" ON "GameTick"("tickNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameTick_tickNumber_key" ON "GameTick"("tickNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalMarketTicker_commodity_key" ON "GlobalMarketTicker"("commodity" ASC);

-- CreateIndex
CREATE INDEX "GrainForwardContract_deliveryTick_idx" ON "GrainForwardContract"("deliveryTick" ASC);

-- CreateIndex
CREATE INDEX "GrainForwardContract_enterpriseId_idx" ON "GrainForwardContract"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "GrainForwardContract_playerId_idx" ON "GrainForwardContract"("playerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "HRAutomationPolicy_playerId_key" ON "HRAutomationPolicy"("playerId" ASC);

-- CreateIndex
CREATE INDEX "IntelligenceReport_requesterId_idx" ON "IntelligenceReport"("requesterId" ASC);

-- CreateIndex
CREATE INDEX "IntelligenceReport_targetId_idx" ON "IntelligenceReport"("targetId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LandPlot_cadastralNumber_key" ON "LandPlot"("cadastralNumber" ASC);

-- CreateIndex
CREATE INDEX "LandPlot_cityId_idx" ON "LandPlot"("cityId" ASC);

-- CreateIndex
CREATE INDEX "LandPlot_playerId_idx" ON "LandPlot"("playerId" ASC);

-- CreateIndex
CREATE INDEX "LandPlot_status_idx" ON "LandPlot"("status" ASC);

-- CreateIndex
CREATE INDEX "LandPlotListing_isActive_idx" ON "LandPlotListing"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LandPlotListing_landPlotId_key" ON "LandPlotListing"("landPlotId" ASC);

-- CreateIndex
CREATE INDEX "LandPlotListing_sellerId_idx" ON "LandPlotListing"("sellerId" ASC);

-- CreateIndex
CREATE INDEX "LegalAction_defendantId_idx" ON "LegalAction"("defendantId" ASC);

-- CreateIndex
CREATE INDEX "LegalAction_plaintiffId_idx" ON "LegalAction"("plaintiffId" ASC);

-- CreateIndex
CREATE INDEX "LegalAction_resolvedAtTick_idx" ON "LegalAction"("resolvedAtTick" ASC);

-- CreateIndex
CREATE INDEX "LegalAction_technologyCode_idx" ON "LegalAction"("technologyCode" ASC);

-- CreateIndex
CREATE INDEX "License_enterpriseId_type_status_idx" ON "License"("enterpriseId" ASC, "type" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "License_expiresAtTick_idx" ON "License"("expiresAtTick" ASC);

-- CreateIndex
CREATE INDEX "License_playerId_status_idx" ON "License"("playerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "LivestockHerd_enterpriseId_idx" ON "LivestockHerd"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "LivestockHerd_playerId_idx" ON "LivestockHerd"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Loan_collateralEnterpriseId_idx" ON "Loan"("collateralEnterpriseId" ASC);

-- CreateIndex
CREATE INDEX "Loan_nextPaymentTick_idx" ON "Loan"("nextPaymentTick" ASC);

-- CreateIndex
CREATE INDEX "Loan_playerId_status_idx" ON "Loan"("playerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_idx" ON "LoanPayment"("loanId" ASC);

-- CreateIndex
CREATE INDEX "LogisticsFreightOrder_carrierId_idx" ON "LogisticsFreightOrder"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "LogisticsFreightOrder_status_expiresAtTick_idx" ON "LogisticsFreightOrder"("status" ASC, "expiresAtTick" ASC);

-- CreateIndex
CREATE INDEX "LogisticsRoute_fromCityId_idx" ON "LogisticsRoute"("fromCityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsRoute_fromCityId_toCityId_key" ON "LogisticsRoute"("fromCityId" ASC, "toCityId" ASC);

-- CreateIndex
CREATE INDEX "LogisticsRoute_toCityId_idx" ON "LogisticsRoute"("toCityId" ASC);

-- CreateIndex
CREATE INDEX "MaDeal_buyerId_status_idx" ON "MaDeal"("buyerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "MaDeal_sellerId_status_idx" ON "MaDeal"("sellerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "MaDeal_status_listedAtTick_idx" ON "MaDeal"("status" ASC, "listedAtTick" ASC);

-- CreateIndex
CREATE INDEX "MacroEvent_status_endTick_idx" ON "MacroEvent"("status" ASC, "endTick" ASC);

-- CreateIndex
CREATE INDEX "MacroEvent_type_status_idx" ON "MacroEvent"("type" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "MarketOrder_expiresAt_idx" ON "MarketOrder"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "MarketOrder_playerId_idx" ON "MarketOrder"("playerId" ASC);

-- CreateIndex
CREATE INDEX "MarketOrder_productId_type_status_idx" ON "MarketOrder"("productId" ASC, "type" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "MarketOrder_resourceType_status_idx" ON "MarketOrder"("resourceType" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "MarketTrade_buyOrderId_idx" ON "MarketTrade"("buyOrderId" ASC);

-- CreateIndex
CREATE INDEX "MarketTrade_executedAt_idx" ON "MarketTrade"("executedAt" ASC);

-- CreateIndex
CREATE INDEX "MarketTrade_sellOrderId_idx" ON "MarketTrade"("sellOrderId" ASC);

-- CreateIndex
CREATE INDEX "Notification_playerId_createdAt_idx" ON "Notification"("playerId" ASC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_playerId_isRead_idx" ON "Notification"("playerId" ASC, "isRead" ASC);

-- CreateIndex
CREATE INDEX "NpcDemand_cityId_idx" ON "NpcDemand"("cityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NpcDemand_cityId_productId_key" ON "NpcDemand"("cityId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "Office_cityId_idx" ON "Office"("cityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Office_enterpriseId_key" ON "Office"("enterpriseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Office_playerId_cityId_key" ON "Office"("playerId" ASC, "cityId" ASC);

-- CreateIndex
CREATE INDEX "Office_playerId_idx" ON "Office"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Patent_playerId_isActive_idx" ON "Patent"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Patent_playerId_technologyCode_key" ON "Patent"("playerId" ASC, "technologyCode" ASC);

-- CreateIndex
CREATE INDEX "Patent_technologyCode_isActive_idx" ON "Patent"("technologyCode" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "PendingDelivery_playerId_idx" ON "PendingDelivery"("playerId" ASC);

-- CreateIndex
CREATE INDEX "PendingDelivery_status_ticksRemaining_idx" ON "PendingDelivery"("status" ASC, "ticksRemaining" ASC);

-- CreateIndex
CREATE INDEX "PendingDelivery_toWarehouseId_status_idx" ON "PendingDelivery"("toWarehouseId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email" ASC);

-- CreateIndex
CREATE INDEX "Player_username_idx" ON "Player"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInventory_playerId_productId_key" ON "PlayerInventory"("playerId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "PlayerTechnology_playerId_isUnlocked_idx" ON "PlayerTechnology"("playerId" ASC, "isUnlocked" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTechnology_playerId_technologyId_key" ON "PlayerTechnology"("playerId" ASC, "technologyId" ASC);

-- CreateIndex
CREATE INDEX "PriceAlert_playerId_isActive_idx" ON "PriceAlert"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "PriceAlert_productSku_isActive_idx" ON "PriceAlert"("productSku" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category" ASC);

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku" ASC);

-- CreateIndex
CREATE INDEX "ProductionLog_enterpriseId_tickNumber_idx" ON "ProductionLog"("enterpriseId" ASC, "tickNumber" ASC);

-- CreateIndex
CREATE INDEX "ProductionLog_playerId_tickNumber_idx" ON "ProductionLog"("playerId" ASC, "tickNumber" ASC);

-- CreateIndex
CREATE INDEX "ProductionLog_tickNumber_idx" ON "ProductionLog"("tickNumber" ASC);

-- CreateIndex
CREATE INDEX "ProductionOrder_workshopId_status_idx" ON "ProductionOrder"("workshopId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "RatingAward_playerId_category_idx" ON "RatingAward"("playerId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "RatingAward_tick_idx" ON "RatingAward"("tick" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeInput_recipeId_productId_key" ON "RecipeInput"("recipeId" ASC, "productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeOutput_recipeId_productId_key" ON "RecipeOutput"("recipeId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "RegulatoryInspection_conductedAtTick_idx" ON "RegulatoryInspection"("conductedAtTick" ASC);

-- CreateIndex
CREATE INDEX "RegulatoryInspection_playerId_isPaid_idx" ON "RegulatoryInspection"("playerId" ASC, "isPaid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReplenishRule_enterpriseId_productId_key" ON "ReplenishRule"("enterpriseId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "ReplenishRule_playerId_isActive_idx" ON "ReplenishRule"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "RetailListing_enterpriseId_idx" ON "RetailListing"("enterpriseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RetailListing_enterpriseId_productId_key" ON "RetailListing"("enterpriseId" ASC, "productId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SecuritySystem_enterpriseId_key" ON "SecuritySystem"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "SecuritySystem_playerId_isActive_idx" ON "SecuritySystem"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "ShareholderRegistry_playerId_idx" ON "ShareholderRegistry"("playerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShareholderRegistry_playerId_tickerId_key" ON "ShareholderRegistry"("playerId" ASC, "tickerId" ASC);

-- CreateIndex
CREATE INDEX "ShareholderRegistry_tickerId_idx" ON "ShareholderRegistry"("tickerId" ASC);

-- CreateIndex
CREATE INDEX "StockOrderBook_createdAtTick_idx" ON "StockOrderBook"("createdAtTick" ASC);

-- CreateIndex
CREATE INDEX "StockOrderBook_placedByPlayerId_status_idx" ON "StockOrderBook"("placedByPlayerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "StockOrderBook_tickerId_status_type_idx" ON "StockOrderBook"("tickerId" ASC, "status" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "StockTicker_isActive_idx" ON "StockTicker"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StockTicker_playerId_key" ON "StockTicker"("playerId" ASC);

-- CreateIndex
CREATE INDEX "StockTicker_symbol_idx" ON "StockTicker"("symbol" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StockTicker_symbol_key" ON "StockTicker"("symbol" ASC);

-- CreateIndex
CREATE INDEX "SubsidyApplication_appliedAtTick_idx" ON "SubsidyApplication"("appliedAtTick" ASC);

-- CreateIndex
CREATE INDEX "SubsidyApplication_enterpriseId_idx" ON "SubsidyApplication"("enterpriseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SubsidyApplication_playerId_enterpriseId_subsidyType_key" ON "SubsidyApplication"("playerId" ASC, "enterpriseId" ASC, "subsidyType" ASC);

-- CreateIndex
CREATE INDEX "SubsidyApplication_playerId_subsidyType_idx" ON "SubsidyApplication"("playerId" ASC, "subsidyType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SubsidyProgram_type_key" ON "SubsidyProgram"("type" ASC);

-- CreateIndex
CREATE INDEX "SupplyOffer_productSku_isActive_idx" ON "SupplyOffer"("productSku" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "SupplyOffer_sellerId_isActive_idx" ON "SupplyOffer"("sellerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "SupplyRoute_playerId_isActive_idx" ON "SupplyRoute"("playerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "SupplyRoute_sourceEnterpriseId_idx" ON "SupplyRoute"("sourceEnterpriseId" ASC);

-- CreateIndex
CREATE INDEX "SupplyRoute_targetEnterpriseId_idx" ON "SupplyRoute"("targetEnterpriseId" ASC);

-- CreateIndex
CREATE INDEX "Syndicate_isPublic_idx" ON "Syndicate"("isPublic" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Syndicate_leaderId_key" ON "Syndicate"("leaderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Syndicate_name_key" ON "Syndicate"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SyndicateMember_playerId_key" ON "SyndicateMember"("playerId" ASC);

-- CreateIndex
CREATE INDEX "SyndicateMember_syndicateId_idx" ON "SyndicateMember"("syndicateId" ASC);

-- CreateIndex
CREATE INDEX "SyndicateVote_expiresAtTick_idx" ON "SyndicateVote"("expiresAtTick" ASC);

-- CreateIndex
CREATE INDEX "SyndicateVote_syndicateId_status_idx" ON "SyndicateVote"("syndicateId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "TaxInspection_conductedAtTick_idx" ON "TaxInspection"("conductedAtTick" ASC);

-- CreateIndex
CREATE INDEX "TaxInspection_playerId_isPaid_idx" ON "TaxInspection"("playerId" ASC, "isPaid" ASC);

-- CreateIndex
CREATE INDEX "TaxRecord_playerId_isPaid_idx" ON "TaxRecord"("playerId" ASC, "isPaid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Technology_code_key" ON "Technology"("code" ASC);

-- CreateIndex
CREATE INDEX "Technology_tier_idx" ON "Technology"("tier" ASC);

-- CreateIndex
CREATE INDEX "Tender_status_expiresAtTick_idx" ON "Tender"("status" ASC, "expiresAtTick" ASC);

-- CreateIndex
CREATE INDEX "TrainingSession_employeeId_idx" ON "TrainingSession"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "TrainingSession_playerId_isCompleted_idx" ON "TrainingSession"("playerId" ASC, "isCompleted" ASC);

-- CreateIndex
CREATE INDEX "Warehouse_cityId_idx" ON "Warehouse"("cityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_enterpriseId_key" ON "Warehouse"("enterpriseId" ASC);

-- CreateIndex
CREATE INDEX "Warehouse_playerId_cityId_idx" ON "Warehouse"("playerId" ASC, "cityId" ASC);

-- CreateIndex
CREATE INDEX "WarehouseRentalOffer_isActive_idx" ON "WarehouseRentalOffer"("isActive" ASC);

-- CreateIndex
CREATE INDEX "WarehouseRentalOffer_ownerId_idx" ON "WarehouseRentalOffer"("ownerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseRentalSubscription_offerId_tenantId_key" ON "WarehouseRentalSubscription"("offerId" ASC, "tenantId" ASC);

-- CreateIndex
CREATE INDEX "WarehouseRentalSubscription_tenantId_isActive_idx" ON "WarehouseRentalSubscription"("tenantId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_playerId_status_idx" ON "WithdrawalRequest"("playerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Workshop_enterpriseId_idx" ON "Workshop"("enterpriseId" ASC);

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoContract" ADD CONSTRAINT "AutoContract_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bTransferAgreement" ADD CONSTRAINT "B2bTransferAgreement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bTransferAgreement" ADD CONSTRAINT "B2bTransferAgreement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bTransferAgreement" ADD CONSTRAINT "B2bTransferAgreement_sourceEnterpriseId_fkey" FOREIGN KEY ("sourceEnterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bTransferAgreement" ADD CONSTRAINT "B2bTransferAgreement_targetEnterpriseId_fkey" FOREIGN KEY ("targetEnterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionProject" ADD CONSTRAINT "ConstructionProject_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsDeclaration" ADD CONSTRAINT "CustomsDeclaration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLoginBonus" ADD CONSTRAINT "DailyLoginBonus_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySnapshot" ADD CONSTRAINT "DailySnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyBill" ADD CONSTRAINT "EnergyBill_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyBill" ADD CONSTRAINT "EnergyBill_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyContract" ADD CONSTRAINT "EnergyContract_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyContract" ADD CONSTRAINT "EnergyContract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_landPlotId_fkey" FOREIGN KEY ("landPlotId") REFERENCES "LandPlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseInventory" ADD CONSTRAINT "EnterpriseInventory_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseInventory" ADD CONSTRAINT "EnterpriseInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMachinery" ADD CONSTRAINT "FarmMachinery_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmMachinery" ADD CONSTRAINT "FarmMachinery_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainForwardContract" ADD CONSTRAINT "GrainForwardContract_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainForwardContract" ADD CONSTRAINT "GrainForwardContract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrainForwardContract" ADD CONSTRAINT "GrainForwardContract_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAutomationPolicy" ADD CONSTRAINT "HRAutomationPolicy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPlot" ADD CONSTRAINT "LandPlot_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPlot" ADD CONSTRAINT "LandPlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPlotListing" ADD CONSTRAINT "LandPlotListing_landPlotId_fkey" FOREIGN KEY ("landPlotId") REFERENCES "LandPlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandPlotListing" ADD CONSTRAINT "LandPlotListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAction" ADD CONSTRAINT "LegalAction_defendantId_fkey" FOREIGN KEY ("defendantId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAction" ADD CONSTRAINT "LegalAction_plaintiffId_fkey" FOREIGN KEY ("plaintiffId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivestockHerd" ADD CONSTRAINT "LivestockHerd_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivestockHerd" ADD CONSTRAINT "LivestockHerd_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_collateralEnterpriseId_fkey" FOREIGN KEY ("collateralEnterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsFreightOrder" ADD CONSTRAINT "LogisticsFreightOrder_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsRoute" ADD CONSTRAINT "LogisticsRoute_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsRoute" ADD CONSTRAINT "LogisticsRoute_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaDeal" ADD CONSTRAINT "MaDeal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaDeal" ADD CONSTRAINT "MaDeal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketTrade" ADD CONSTRAINT "MarketTrade_buyOrderId_fkey" FOREIGN KEY ("buyOrderId") REFERENCES "MarketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketTrade" ADD CONSTRAINT "MarketTrade_sellOrderId_fkey" FOREIGN KEY ("sellOrderId") REFERENCES "MarketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcDemand" ADD CONSTRAINT "NpcDemand_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcDemand" ADD CONSTRAINT "NpcDemand_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patent" ADD CONSTRAINT "Patent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDelivery" ADD CONSTRAINT "PendingDelivery_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDelivery" ADD CONSTRAINT "PendingDelivery_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDelivery" ADD CONSTRAINT "PendingDelivery_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDelivery" ADD CONSTRAINT "PendingDelivery_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTechnology" ADD CONSTRAINT "PlayerTechnology_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTechnology" ADD CONSTRAINT "PlayerTechnology_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingAward" ADD CONSTRAINT "RatingAward_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeInput" ADD CONSTRAINT "RecipeInput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeInput" ADD CONSTRAINT "RecipeInput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryInspection" ADD CONSTRAINT "RegulatoryInspection_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryInspection" ADD CONSTRAINT "RegulatoryInspection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishRule" ADD CONSTRAINT "ReplenishRule_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishRule" ADD CONSTRAINT "ReplenishRule_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishRule" ADD CONSTRAINT "ReplenishRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailListing" ADD CONSTRAINT "RetailListing_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailListing" ADD CONSTRAINT "RetailListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuritySystem" ADD CONSTRAINT "SecuritySystem_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuritySystem" ADD CONSTRAINT "SecuritySystem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderRegistry" ADD CONSTRAINT "ShareholderRegistry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderRegistry" ADD CONSTRAINT "ShareholderRegistry_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "StockTicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrderBook" ADD CONSTRAINT "StockOrderBook_placedByPlayerId_fkey" FOREIGN KEY ("placedByPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOrderBook" ADD CONSTRAINT "StockOrderBook_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "StockTicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTicker" ADD CONSTRAINT "StockTicker_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubsidyApplication" ADD CONSTRAINT "SubsidyApplication_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubsidyApplication" ADD CONSTRAINT "SubsidyApplication_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubsidyApplication" ADD CONSTRAINT "SubsidyApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "SubsidyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOffer" ADD CONSTRAINT "SupplyOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRoute" ADD CONSTRAINT "SupplyRoute_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRoute" ADD CONSTRAINT "SupplyRoute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRoute" ADD CONSTRAINT "SupplyRoute_sourceEnterpriseId_fkey" FOREIGN KEY ("sourceEnterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRoute" ADD CONSTRAINT "SupplyRoute_targetEnterpriseId_fkey" FOREIGN KEY ("targetEnterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Syndicate" ADD CONSTRAINT "Syndicate_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicateMember" ADD CONSTRAINT "SyndicateMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicateMember" ADD CONSTRAINT "SyndicateMember_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "Syndicate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicateVote" ADD CONSTRAINT "SyndicateVote_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicateVote" ADD CONSTRAINT "SyndicateVote_syndicateId_fkey" FOREIGN KEY ("syndicateId") REFERENCES "Syndicate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInspection" ADD CONSTRAINT "TaxInspection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRentalOffer" ADD CONSTRAINT "WarehouseRentalOffer_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRentalOffer" ADD CONSTRAINT "WarehouseRentalOffer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRentalSubscription" ADD CONSTRAINT "WarehouseRentalSubscription_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "WarehouseRentalOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRentalSubscription" ADD CONSTRAINT "WarehouseRentalSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


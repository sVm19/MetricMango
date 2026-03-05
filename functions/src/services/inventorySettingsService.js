const DEFAULT_INVENTORY_SETTINGS = Object.freeze({
  lowStockAlertsEnabled: true,
  lowStockThresholdDays: 5,
  lowStockThresholdUnits: null,
  alertFrequency: "daily",
  alertRecipientEmail: "",
  salesSpikeAlertsEnabled: false,
  salesSpikeThresholdPercent: 30,
  defaultLeadTimeDays: 7,
  safetyBufferDays: 0,
  weeklyActionPlanEnabled: true,
  weeklyActionPlanLastSentDate: null
});

const ALLOWED_ALERT_FREQUENCIES = new Set(["daily", "weekly"]);
const ALLOWED_RETENTION_REASONS = new Set([
  "too_expensive",
  "not_using_enough",
  "missing_feature",
  "switching_to_competitor",
  "technical_issues",
  "seasonal",
  "business_closed",
  "other"
]);
const ALLOWED_PURCHASE_ORDER_STATUSES = new Set(["draft", "approved", "exported"]);

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function sanitizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  const email = sanitizeEmail(value);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeInteger(value, { field, min, max, allowNull = false } = {}) {
  if (allowNull && (value === null || value === "" || value === undefined)) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw createValidationError(`Invalid ${field}`);
  }
  if (numeric < min || numeric > max) {
    throw createValidationError(`Invalid ${field}`);
  }
  return numeric;
}

function normalizeBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw createValidationError(`Invalid ${field}`);
  }
  return value;
}

function normalizeOptionalString(value, { field, max = 500, allowBlank = true } = {}) {
  const normalized = String(value || "").trim();
  if (!allowBlank && !normalized) {
    throw createValidationError(`Invalid ${field}`);
  }
  if (normalized.length > max) {
    throw createValidationError(`Invalid ${field}`);
  }
  return normalized;
}

function resolveInventorySettings(store = {}) {
  const raw = store.inventorySettings || {};
  const fallbackEmail = sanitizeEmail(raw.alertRecipientEmail || store.alertEmail || store.email || "");
  const alertFrequency = ALLOWED_ALERT_FREQUENCIES.has(String(raw.alertFrequency || "").trim().toLowerCase())
    ? String(raw.alertFrequency).trim().toLowerCase()
    : DEFAULT_INVENTORY_SETTINGS.alertFrequency;

  const thresholdDays = Number(raw.lowStockThresholdDays);
  const thresholdUnits = raw.lowStockThresholdUnits;
  const spikeThreshold = Number(raw.salesSpikeThresholdPercent);
  const leadTimeDays = Number(raw.defaultLeadTimeDays);
  const safetyBufferDays = Number(raw.safetyBufferDays);
  const weeklyActionPlanLastSentDate = raw.weeklyActionPlanLastSentDate
    ? String(raw.weeklyActionPlanLastSentDate)
    : null;

  return {
    ...DEFAULT_INVENTORY_SETTINGS,
    lowStockAlertsEnabled: typeof raw.lowStockAlertsEnabled === "boolean"
      ? raw.lowStockAlertsEnabled
      : DEFAULT_INVENTORY_SETTINGS.lowStockAlertsEnabled,
    lowStockThresholdDays: Number.isInteger(thresholdDays) && thresholdDays >= 1 && thresholdDays <= 60
      ? thresholdDays
      : DEFAULT_INVENTORY_SETTINGS.lowStockThresholdDays,
    lowStockThresholdUnits: thresholdUnits === null || thresholdUnits === undefined || thresholdUnits === ""
      ? null
      : (Number.isInteger(Number(thresholdUnits)) && Number(thresholdUnits) >= 0 ? Number(thresholdUnits) : DEFAULT_INVENTORY_SETTINGS.lowStockThresholdUnits),
    alertFrequency,
    alertRecipientEmail: fallbackEmail,
    salesSpikeAlertsEnabled: typeof raw.salesSpikeAlertsEnabled === "boolean"
      ? raw.salesSpikeAlertsEnabled
      : DEFAULT_INVENTORY_SETTINGS.salesSpikeAlertsEnabled,
    salesSpikeThresholdPercent: Number.isInteger(spikeThreshold) && spikeThreshold >= 10 && spikeThreshold <= 500
      ? spikeThreshold
      : DEFAULT_INVENTORY_SETTINGS.salesSpikeThresholdPercent,
    defaultLeadTimeDays: Number.isInteger(leadTimeDays) && leadTimeDays >= 1 && leadTimeDays <= 90
      ? leadTimeDays
      : DEFAULT_INVENTORY_SETTINGS.defaultLeadTimeDays,
    safetyBufferDays: Number.isInteger(safetyBufferDays) && safetyBufferDays >= 0 && safetyBufferDays <= 30
      ? safetyBufferDays
      : DEFAULT_INVENTORY_SETTINGS.safetyBufferDays,
    weeklyActionPlanEnabled: typeof raw.weeklyActionPlanEnabled === "boolean"
      ? raw.weeklyActionPlanEnabled
      : DEFAULT_INVENTORY_SETTINGS.weeklyActionPlanEnabled,
    weeklyActionPlanLastSentDate
  };
}

function validateInventorySettingsPatch(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid inventory settings payload");
  }

  const next = {};
  const allowed = new Set([
    "lowStockAlertsEnabled",
    "lowStockThresholdDays",
    "lowStockThresholdUnits",
    "alertFrequency",
    "alertRecipientEmail",
    "salesSpikeAlertsEnabled",
    "salesSpikeThresholdPercent",
    "defaultLeadTimeDays",
    "safetyBufferDays",
    "weeklyActionPlanEnabled"
  ]);

  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid inventory settings field: ${key}`);
    }
  });

  if ("lowStockAlertsEnabled" in payload) {
    next.lowStockAlertsEnabled = normalizeBoolean(payload.lowStockAlertsEnabled, "lowStockAlertsEnabled");
  }
  if ("lowStockThresholdDays" in payload) {
    next.lowStockThresholdDays = normalizeInteger(payload.lowStockThresholdDays, {
      field: "lowStockThresholdDays",
      min: 1,
      max: 60
    });
  }
  if ("lowStockThresholdUnits" in payload) {
    next.lowStockThresholdUnits = normalizeInteger(payload.lowStockThresholdUnits, {
      field: "lowStockThresholdUnits",
      min: 0,
      max: 100000000,
      allowNull: true
    });
  }
  if ("alertFrequency" in payload) {
    const frequency = String(payload.alertFrequency || "").trim().toLowerCase();
    if (!ALLOWED_ALERT_FREQUENCIES.has(frequency)) {
      throw createValidationError("Invalid alertFrequency");
    }
    next.alertFrequency = frequency;
  }
  if ("alertRecipientEmail" in payload) {
    const email = sanitizeEmail(payload.alertRecipientEmail);
    if (!isValidEmail(email)) {
      throw createValidationError("Invalid alertRecipientEmail");
    }
    next.alertRecipientEmail = email;
  }
  if ("salesSpikeAlertsEnabled" in payload) {
    next.salesSpikeAlertsEnabled = normalizeBoolean(payload.salesSpikeAlertsEnabled, "salesSpikeAlertsEnabled");
  }
  if ("salesSpikeThresholdPercent" in payload) {
    next.salesSpikeThresholdPercent = normalizeInteger(payload.salesSpikeThresholdPercent, {
      field: "salesSpikeThresholdPercent",
      min: 10,
      max: 500
    });
  }
  if ("defaultLeadTimeDays" in payload) {
    next.defaultLeadTimeDays = normalizeInteger(payload.defaultLeadTimeDays, {
      field: "defaultLeadTimeDays",
      min: 1,
      max: 90
    });
  }
  if ("safetyBufferDays" in payload) {
    next.safetyBufferDays = normalizeInteger(payload.safetyBufferDays, {
      field: "safetyBufferDays",
      min: 0,
      max: 30
    });
  }
  if ("weeklyActionPlanEnabled" in payload) {
    next.weeklyActionPlanEnabled = normalizeBoolean(payload.weeklyActionPlanEnabled, "weeklyActionPlanEnabled");
  }

  return next;
}

function validateProductPlanningPatch(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid planning payload");
  }
  const next = {};
  const allowed = new Set(["leadTimeDays", "supplierName", "supplierId"]);
  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid planning field: ${key}`);
    }
  });

  if ("leadTimeDays" in payload) {
    next.leadTimeDays = normalizeInteger(payload.leadTimeDays, {
      field: "leadTimeDays",
      min: 1,
      max: 90
    });
  }

  if ("supplierName" in payload) {
    const supplierName = String(payload.supplierName || "").trim();
    if (supplierName.length > 120) {
      throw createValidationError("Invalid supplierName");
    }
    next.supplierName = supplierName;
  }

  if ("supplierId" in payload) {
    const supplierId = String(payload.supplierId || "").trim();
    if (supplierId.length > 120) {
      throw createValidationError("Invalid supplierId");
    }
    next.supplierId = supplierId;
  }

  return next;
}

function validateSupplierPayload(payload = {}, { partial = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid supplier payload");
  }

  const next = {};
  const allowed = new Set(["name", "contactEmail", "defaultLeadTimeDays", "notes"]);
  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid supplier field: ${key}`);
    }
  });

  if ("name" in payload) {
    next.name = normalizeOptionalString(payload.name, {
      field: "name",
      max: 120,
      allowBlank: false
    });
  } else if (!partial) {
    throw createValidationError("Invalid name");
  }

  if ("contactEmail" in payload) {
    const contactEmail = sanitizeEmail(payload.contactEmail);
    if (contactEmail && !isValidEmail(contactEmail)) {
      throw createValidationError("Invalid contactEmail");
    }
    next.contactEmail = contactEmail;
  }

  if ("defaultLeadTimeDays" in payload) {
    next.defaultLeadTimeDays = normalizeInteger(payload.defaultLeadTimeDays, {
      field: "defaultLeadTimeDays",
      min: 1,
      max: 90
    });
  } else if (!partial) {
    next.defaultLeadTimeDays = DEFAULT_INVENTORY_SETTINGS.defaultLeadTimeDays;
  }

  if ("notes" in payload) {
    next.notes = normalizeOptionalString(payload.notes, {
      field: "notes",
      max: 1000
    });
  } else if (!partial) {
    next.notes = "";
  }

  return next;
}

function validatePurchaseOrderDraftPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid purchase order payload");
  }

  const next = {};
  const allowed = new Set(["supplierId", "supplierName", "notes"]);
  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid purchase order field: ${key}`);
    }
  });

  if ("supplierId" in payload) {
    next.supplierId = normalizeOptionalString(payload.supplierId, {
      field: "supplierId",
      max: 120
    });
  }

  if ("supplierName" in payload) {
    next.supplierName = normalizeOptionalString(payload.supplierName, {
      field: "supplierName",
      max: 120
    });
  }

  if ("notes" in payload) {
    next.notes = normalizeOptionalString(payload.notes, {
      field: "notes",
      max: 1000
    });
  }

  return next;
}

function validatePurchaseOrderPatch(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid purchase order patch");
  }

  const next = {};
  const allowed = new Set(["status", "notes"]);
  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid purchase order field: ${key}`);
    }
  });

  if ("status" in payload) {
    const status = String(payload.status || "").trim().toLowerCase();
    if (!ALLOWED_PURCHASE_ORDER_STATUSES.has(status)) {
      throw createValidationError("Invalid status");
    }
    next.status = status;
  }

  if ("notes" in payload) {
    next.notes = normalizeOptionalString(payload.notes, {
      field: "notes",
      max: 1000
    });
  }

  return next;
}

function validateRetentionRequestPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createValidationError("Invalid retention payload");
  }

  const next = {};
  const allowed = new Set(["reason", "note"]);
  Object.keys(payload).forEach(key => {
    if (!allowed.has(key)) {
      throw createValidationError(`Invalid retention field: ${key}`);
    }
  });

  const reason = String(payload.reason || "").trim().toLowerCase();
  if (!ALLOWED_RETENTION_REASONS.has(reason)) {
    throw createValidationError("Invalid reason");
  }
  next.reason = reason;
  next.note = normalizeOptionalString(payload.note, {
    field: "note",
    max: 1000
  });
  return next;
}

module.exports = {
  ALLOWED_ALERT_FREQUENCIES,
  ALLOWED_PURCHASE_ORDER_STATUSES,
  ALLOWED_RETENTION_REASONS,
  DEFAULT_INVENTORY_SETTINGS,
  createValidationError,
  isValidEmail,
  resolveInventorySettings,
  sanitizeEmail,
  validateInventorySettingsPatch,
  validatePurchaseOrderDraftPayload,
  validatePurchaseOrderPatch,
  validateProductPlanningPatch
  ,
  validateRetentionRequestPayload,
  validateSupplierPayload
};

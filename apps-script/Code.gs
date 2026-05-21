// ============================================================
// JJ Apartment RMS — Google Apps Script Backend
// ============================================================

var SPREADSHEET_ID = "1S-bQ05Jdf3ICkRutZhdJo-mf7I2QLij2i6WM3CFeIsE";

// ============================================================
// ROUTERS
// ============================================================

function doGet(e) {
  try {
    var action = e.parameter.action;
    var params = e.parameter;

    switch (action) {
      case "getBuildings":   return respond(getBuildings());
      case "getUnits":       return respond(getUnits());
      case "getTenants":     return respond(getTenants());
      case "getLedger":      return respond(getLedger(params));
      case "getBalance":     return respond(getBalance(params));
      case "getReadings":    return respond(getReadings(params));
      case "getExpenses":    return respond(getExpenses(params));
      case "verifyTenant":   return respond(verifyTenant(params));
      case "getDashboard":   return respond(getDashboardData());
      default:
        return respond(null, "Unknown action: " + action);
    }
  } catch (err) {
    return respond(null, err.message);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    var cfg = getConfig();
    if (body.adminToken !== cfg["AdminPassphrase"]) {
      return respond(null, "Unauthorized");
    }

    var lock = LockService.getScriptLock();
    lock.tryLock(10000);
    try {
      var result;
      switch (action) {
        case "generateBill":   result = generateBill(body);   break;
        case "recordPayment":  result = recordPayment(body);  break;
        case "uploadProof":    result = uploadProof(body);    break;
        case "saveReading":    result = saveReading(body);    break;
        case "addTenant":      result = addTenant(body);      break;
        case "moveTenant":     result = moveTenant(body);     break;
        case "addExpense":     result = addExpense(body);     break;
        case "updateConfig":   result = updateConfig(body);   break;
        default:
          result = { message: "Unknown action: " + action };
      }
      return respond(result);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond(null, err.message);
  }
}

// ============================================================
// HELPERS
// ============================================================

function respond(data, error) {
  var payload = error
    ? { success: false, error: error }
    : { success: true, data: data };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function sheetToJSON(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        val = val.toISOString().split("T")[0];
      }
      row[headers[j]] = val;
    }
    rows.push(row);
  }
  return rows;
}

function getConfig() {
  var rows = sheetToJSON(getSheet("Config"));
  var cfg = {};
  rows.forEach(function(r) { cfg[r["Key"]] = r["Value"]; });
  return cfg;
}

function appendSheetRow(sheet, data) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) {
    var key = String(h).trim();
    return data.hasOwnProperty(key) ? data[key] : "";
  });
  sheet.appendRow(row);
}

function generateTxnID() {
  var ts  = Date.now().toString(36).toUpperCase();
  var rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "TXN-" + ts + "-" + rnd;
}

function isTxnIDDuplicate(txnId) {
  var sheet = getSheet("Ledger");
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === txnId) return true;
  }
  return false;
}

// Normalises a BillingMonth value to "YYYY-MM".
// Sheets auto-converts "2026-05" → Date, which sheetToJSON serialises back
// as "2026-05-01".  Taking the first 7 chars handles both forms.
function normMonth(val) {
  return String(val || "").substring(0, 7);
}

// Positive = tenant owes money. Negative = tenant has credit.
// Deposit credits are never counted.
// Advance credits only offset when at least one Bill/Debit exists.
function computeBalance(tenantId) {
  var allRows = sheetToJSON(getSheet("Ledger")).filter(function(r) {
    return String(r["TenantID"]) === String(tenantId);
  });

  // Strip out Deposit credits entirely
  var rows = allRows.filter(function(r) {
    var isDepositCredit = r["Direction"] === "Credit" &&
      String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
    return !isDepositCredit;
  });

  // If no Debit rows exist yet, new tenant has zero balance
  var hasDebits = rows.some(function(r) { return r["Direction"] === "Debit"; });
  if (!hasDebits) {
    return { rent: 0, elec: 0, water: 0, total: 0 };
  }

  var balance = { rent: 0, elec: 0, water: 0, total: 0 };
  rows.forEach(function(r) {
    var sign = r["Direction"] === "Debit" ? 1 : -1;
    balance.rent  += sign * (parseFloat(r["RentAmount"])  || 0);
    balance.elec  += sign * (parseFloat(r["ElecAmount"])  || 0);
    balance.water += sign * (parseFloat(r["WaterAmount"]) || 0);
  });
  balance.total = balance.rent + balance.elec + balance.water;
  return balance;
}

// ============================================================
// GET HANDLERS
// ============================================================

function getBuildings() {
  return sheetToJSON(getSheet("Buildings"));
}

function getUnits() {
  var units     = sheetToJSON(getSheet("Units"));
  var buildings = sheetToJSON(getSheet("Buildings"));
  var bldMap    = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });

  return units.map(function(u) {
    u["BuildingName"] = bldMap[u["BuildingID"]] || "";
    return u;
  });
}

function getTenants() {
  var tenants   = sheetToJSON(getSheet("Tenants")).filter(function(t) {
    return t["Status"] === "Active";
  });
  var units     = sheetToJSON(getSheet("Units"));
  var buildings = sheetToJSON(getSheet("Buildings"));

  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });
  var bldMap  = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });

  return tenants.map(function(t) {
    var unit = unitMap[t["UnitID"]] || {};
    t["UnitName"]     = unit["UnitName"]    || "";
    t["BuildingName"] = bldMap[unit["BuildingID"]] || "";
    delete t["PIN"];
    return t;
  });
}

function getLedger(params) {
  var rows = sheetToJSON(getSheet("Ledger"));

  if (params.tenantId) {
    rows = rows.filter(function(r) { return r["TenantID"] === params.tenantId; });
  }
  if (params.unitId) {
    rows = rows.filter(function(r) { return r["UnitID"] === params.unitId; });
  }
  if (params.billingMonth) {
    rows = rows.filter(function(r) { return normMonth(r["BillingMonth"]) === normMonth(params.billingMonth); });
  }
  return rows;
}

function getBalance(params) {
  if (!params.tenantId) throw new Error("tenantId is required");
  return computeBalance(params.tenantId);
}

function getReadings(params) {
  var rows = sheetToJSON(getSheet("UtilityReadings"));

  if (params.unitId) {
    rows = rows.filter(function(r) { return r["UnitID"] === params.unitId; });
  }
  if (params.billingMonth) {
    rows = rows.filter(function(r) { return normMonth(r["BillingMonth"]) === normMonth(params.billingMonth); });
  }
  return rows;
}

function getExpenses(params) {
  var rows = sheetToJSON(getSheet("Expenses"));

  if (params.month) {
    rows = rows.filter(function(r) {
      return String(r["Date"]).substring(0, 7) === params.month;
    });
  }
  return rows;
}

function verifyTenant(params) {
  if (!params.unitId || !params.pin) throw new Error("unitId and pin are required");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var match = tenants.filter(function(t) {
    return t["UnitID"]  === params.unitId &&
           String(t["PIN"]) === String(params.pin) &&
           t["Status"]  === "Active";
  });

  if (match.length === 0) throw new Error("Invalid Unit ID or PIN");

  var tenant = match[0];
  delete tenant["PIN"];

  var units  = sheetToJSON(getSheet("Units"));
  var unit   = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};
  tenant["UnitName"]    = unit["UnitName"]    || "";
  tenant["BillingType"] = unit["BillingType"] || "";

  return tenant;
}

function getDashboardData() {
  var units   = sheetToJSON(getSheet("Units"));
  var tenants = sheetToJSON(getSheet("Tenants")).filter(function(t) {
    return t["Status"] === "Active";
  });
  var ledger  = sheetToJSON(getSheet("Ledger"));

  var totalUnits    = units.length;
  var occupiedUnits = units.filter(function(u) { return u["Status"] === "Occupied"; }).length;
  var occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  var now          = new Date();
  var currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");

  var currentMonthLedger = ledger.filter(function(r) {
    return normMonth(r["BillingMonth"]) === currentMonth;
  });

  var currentMonthBilled = 0;
  var currentMonthCollected = 0;
  currentMonthLedger.forEach(function(r) {
    var amt     = parseFloat(r["TotalAmount"]) || 0;
    var txnType = String(r["TxnType"] || "").trim();
    var dir     = String(r["Direction"] || "").trim();
    if (txnType === "Bill"    && dir === "Debit")  currentMonthBilled    += amt;
    if (txnType === "Payment" && dir === "Credit") currentMonthCollected += amt;
  });

  // totalOutstanding: one-pass sum over all ledger rows.
  // Deposit credits are excluded (they are held as security, not a payment).
  var totalOutstanding = 0;
  ledger.forEach(function(r) {
    var isDepositCredit = String(r["Direction"] || "").trim() === "Credit" &&
      String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
    if (isDepositCredit) return;
    var amt = parseFloat(r["TotalAmount"]) || 0;
    if (String(r["Direction"] || "").trim() === "Debit")  totalOutstanding += amt;
    if (String(r["Direction"] || "").trim() === "Credit") totalOutstanding -= amt;
  });
  if (totalOutstanding < 0) totalOutstanding = 0;

  var delinquentTenants = [];

  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });
  var bldMap = {};
  sheetToJSON(getSheet("Buildings")).forEach(function(b) {
    bldMap[b["BuildingID"]] = b["BuildingName"];
  });

  tenants.forEach(function(tenant) {
    var balance = computeBalance(tenant["TenantID"]);
    if (balance.total <= 0) return; // skip zero or credit tenants

    var tenantLedger = ledger.filter(function(r) {
      return r["TenantID"] === tenant["TenantID"];
    });

    var monthMap = {};
    tenantLedger.forEach(function(r) {
      var m = normMonth(r["BillingMonth"]);
      if (!m) return;
      // Skip deposit credits in month map too
      var isDepositCredit = r["Direction"] === "Credit" &&
        String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
      if (isDepositCredit) return;

      if (!monthMap[m]) monthMap[m] = { rent: 0, elec: 0, water: 0 };
      var sign = r["Direction"] === "Debit" ? 1 : -1;
      monthMap[m].rent  += sign * (parseFloat(r["RentAmount"])  || 0);
      monthMap[m].elec  += sign * (parseFloat(r["ElecAmount"])  || 0);
      monthMap[m].water += sign * (parseFloat(r["WaterAmount"]) || 0);
    });

    var unpaidMonths = Object.keys(monthMap)
      .filter(function(m) {
        var mo = monthMap[m];
        return (mo.rent + mo.elec + mo.water) > 0;
      })
      .sort()
      .map(function(m) {
        var mo = monthMap[m];
        return {
          month:     m,
          rentOwed:  mo.rent,
          elecOwed:  mo.elec,
          waterOwed: mo.water,
          total:     mo.rent + mo.elec + mo.water
        };
      });

    if (unpaidMonths.length === 0) return;

    var unit = unitMap[tenant["UnitID"]] || {};
    delinquentTenants.push({
      tenantId:     tenant["TenantID"],
      name:         tenant["Name"],
      unit:         unit["UnitName"]    || tenant["UnitID"],
      building:     bldMap[unit["BuildingID"]] || "",
      unpaidMonths: unpaidMonths,
      totalOwed:    balance.total
    });
  });

  delinquentTenants.sort(function(a, b) {
    var aOldest = a.unpaidMonths[0] ? a.unpaidMonths[0].month : "";
    var bOldest = b.unpaidMonths[0] ? b.unpaidMonths[0].month : "";
    return aOldest < bOldest ? -1 : 1;
  });

  return {
    occupancyRate:         occupancyRate,
    totalUnits:            totalUnits,
    occupiedUnits:         occupiedUnits,
    currentMonthCollected: currentMonthCollected,
    currentMonthBilled:    currentMonthBilled,
    totalOutstanding:      totalOutstanding,
    delinquentTenants:     delinquentTenants
  };
}

// ============================================================
// POST HANDLERS
// ============================================================

function generateBill(body) {
  var billingMonth = String(body.billingMonth || "").trim();
  if (!billingMonth) throw new Error("billingMonth is required");

  var tenants;
  if (body.tenantId) {
    var allTenants = sheetToJSON(getSheet("Tenants"));
    var found = allTenants.filter(function(t) { return t["TenantID"] === body.tenantId; });
    if (found.length === 0) throw new Error("Tenant not found");
    tenants = found;
  } else {
    tenants = sheetToJSON(getSheet("Tenants")).filter(function(t) {
      return t["Status"] === "Active";
    });
  }

  var units = sheetToJSON(getSheet("Units"));
  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });

  var readings = sheetToJSON(getSheet("UtilityReadings")).filter(function(r) {
    return normMonth(r["BillingMonth"]) === normMonth(billingMonth);
  });

  var ledgerSheet = getSheet("Ledger");
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var billsCreated = 0;
  var skipped = 0;

  tenants.forEach(function(tenant) {
    var tenantId    = tenant["TenantID"];
    var unitId      = tenant["UnitID"];
    var unit        = unitMap[unitId] || {};
    var monthlyRate = parseFloat(unit["MonthlyRate"]) || 0;

    var reading     = readings.filter(function(r) { return r["UnitID"] === unitId; })[0] || {};
    var elecCharge  = parseFloat(reading["ElecCharge"])  || 0;
    var waterCharge = parseFloat(reading["WaterCharge"]) || 0;

    // Roll over prior positive (unpaid) per-category balances
    var prior = computeBalance(tenantId);
    var priorRent  = prior.rent  > 0 ? prior.rent  : 0;
    var priorElec  = prior.elec  > 0 ? prior.elec  : 0;
    var priorWater = prior.water > 0 ? prior.water : 0;

    var txnId = "BILL-" + tenantId + "-" + billingMonth;
    if (isTxnIDDuplicate(txnId)) {
      skipped++;
      return;
    }

    var rentAmount  = Math.max(0, monthlyRate + priorRent);
    var elecAmount  = Math.max(0, elecCharge  + priorElec);
    var waterAmount = Math.max(0, waterCharge + priorWater);
    var totalAmount = rentAmount + elecAmount + waterAmount;

    appendSheetRow(ledgerSheet, {
      TxnID:        txnId,
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: billingMonth,
      TxnType:      "Bill",
      Direction:    "Debit",
      RentAmount:   rentAmount,
      ElecAmount:   elecAmount,
      WaterAmount:  waterAmount,
      TotalAmount:  totalAmount,
      Notes:        "Monthly Bill",
      Date:         today
    });

    billsCreated++;
  });

  return { billsCreated: billsCreated, skipped: skipped };
}

function recordPayment(body) {
  var tenantId     = String(body.tenantId     || "").trim();
  var billingMonth = String(body.billingMonth || "").trim();
  var totalPaid    = parseFloat(body.totalPaid)    || 0;
  var rentAmount   = parseFloat(body.rentAmount)   || 0;
  var elecAmount   = parseFloat(body.elecAmount)   || 0;
  var waterAmount  = parseFloat(body.waterAmount)  || 0;
  var paymentMode  = String(body.paymentMode  || "").trim();
  var referenceNo  = String(body.referenceNo  || "").trim();
  var notes        = String(body.notes        || "").trim();

  if (!tenantId) throw new Error("tenantId is required");
  if (totalPaid <= 0) throw new Error("totalPaid must be greater than 0");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var tenant  = tenants.filter(function(t) { return t["TenantID"] === tenantId; })[0];
  if (!tenant) throw new Error("Tenant not found");

  var units = sheetToJSON(getSheet("Units"));
  var unit  = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};

  var buildings = sheetToJSON(getSheet("Buildings"));
  var bldMap = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });
  unit["BuildingName"] = bldMap[unit["BuildingID"]] || "";

  var cfg   = getConfig();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (!billingMonth) {
    billingMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  }

  var txnId = "PAY-" + tenantId + "-" + Date.now();

  appendSheetRow(getSheet("Ledger"), {
    TxnID:        txnId,
    TenantID:     tenantId,
    UnitID:       tenant["UnitID"],
    BillingMonth: billingMonth,
    TxnType:      "Payment",
    Direction:    "Credit",
    RentAmount:   rentAmount,
    ElecAmount:   elecAmount,
    WaterAmount:  waterAmount,
    TotalAmount:  totalPaid,
    PaymentMode:  paymentMode,
    ReferenceNo:  referenceNo,
    Notes:        notes,
    Date:         today
  });

  var remainingBalance = computeBalance(tenantId);

  try {
    sendReceiptEmail(tenant, unit, billingMonth, {
      rentAmount:  rentAmount,
      elecAmount:  elecAmount,
      waterAmount: waterAmount,
      totalPaid:   totalPaid,
      paymentMode: paymentMode,
      referenceNo: referenceNo
    }, remainingBalance, cfg);
  } catch (emailErr) {
    Logger.log("Email send failed: " + emailErr.message);
  }

  return { txnId: txnId, remainingBalance: remainingBalance };
}

function uploadProof(body) {
  var base64Image = String(body.base64Image || "").trim();
  var fileName    = String(body.fileName    || ("proof-" + Date.now() + ".jpg")).trim();

  if (!base64Image) throw new Error("base64Image is required");

  var decoded = Utilities.base64Decode(base64Image);
  var blob    = Utilities.newBlob(decoded, "image/jpeg", fileName);

  var folders = DriveApp.getFoldersByName("JJ Apartment Proofs");
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder("JJ Apartment Proofs");

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { driveUrl: file.getUrl() };
}

function saveReading(body) {
  return { message: "stub: saveReading", unitId: body.unitId };
}

function addTenant(body) {
  var name       = String(body.name       || "").trim();
  var unitId     = String(body.unitId     || "").trim();
  var contact    = String(body.contact    || "").trim();
  var email      = String(body.email      || "").trim();
  var moveInDate = String(body.moveInDate || "").trim();
  var advance    = parseFloat(body.advance) || 0;
  var deposit    = parseFloat(body.deposit) || 0;
  var pin        = String(body.pin        || "").trim();

  if (!name || !unitId || !pin) throw new Error("name, unitId, and pin are required");

  var tenantId = "T-" + Date.now();
  var today    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var month    = moveInDate ? moveInDate.substring(0, 7)
               : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  appendSheetRow(getSheet("Tenants"), {
    TenantID:   tenantId,
    Name:       name,
    UnitID:     unitId,
    Contact:    contact,
    Email:      email,
    MoveInDate: moveInDate,
    Advance:    advance,
    Deposit:    deposit,
    PIN:        pin,
    Status:     "Active"
  });

  if (advance > 0) {
    appendSheetRow(getSheet("Ledger"), {
      TxnID:        generateTxnID(),
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: month,
      TxnType:      "Credit",
      Direction:    "Credit",
      RentAmount:   advance,
      ElecAmount:   0,
      WaterAmount:  0,
      TotalAmount:  advance,
      Notes:        "Advance",
      Date:         today
    });
  }

  if (deposit > 0) {
    appendSheetRow(getSheet("Ledger"), {
      TxnID:        generateTxnID(),
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: month,
      TxnType:      "Credit",
      Direction:    "Credit",
      RentAmount:   deposit,
      ElecAmount:   0,
      WaterAmount:  0,
      TotalAmount:  deposit,
      Notes:        "Deposit",
      Date:         today
    });
  }

  var unitsSheet  = getSheet("Units");
  var unitsData   = unitsSheet.getDataRange().getValues();
  var unitHeaders = unitsData[0];
  var unitIdCol   = unitHeaders.indexOf("UnitID");
  var statusCol   = unitHeaders.indexOf("Status");
  for (var i = 1; i < unitsData.length; i++) {
    if (String(unitsData[i][unitIdCol]) === unitId) {
      unitsSheet.getRange(i + 1, statusCol + 1).setValue("Occupied");
      break;
    }
  }

  return { tenantId: tenantId };
}

function moveTenant(body) {
  return { message: "stub: moveTenant", tenantId: body.tenantId };
}

function addExpense(body) {
  return { message: "stub: addExpense", category: body.category };
}

function updateConfig(body) {
  return { message: "stub: updateConfig", key: body.key };
}

// ============================================================
// EMAIL HELPER
// Uses GmailApp — no API key needed, sends from the Google account
// that owns this Apps Script project.
//
// Config sheet rows required:
//   PropertyName  — e.g. "JJ Apartment"
//   AdminContact  — phone / Messenger shown at bottom of receipt
//   AdminEmail    — Outlook (or any) address for the admin copy
//                   Leave blank to skip the admin copy silently.
// ============================================================

function sendReceiptEmail(tenant, unit, billingMonth, payment, remainingBalance, cfg) {
  var tenantEmail = String(tenant["Email"] || "").trim();
  if (!tenantEmail) {
    Logger.log("sendReceiptEmail: skipped — tenant has no email (tenantId=" + tenant["TenantID"] + ")");
    return;
  }

  var propertyName = cfg["PropertyName"] || "JJ Apartment";
  var adminContact = cfg["AdminContact"] || "N/A";
  var adminEmail   = String(cfg["AdminEmail"] || "").trim();

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var subject = "Payment Receipt — " + (unit["UnitName"] || "") + ", " + billingMonth;

  var rentBal  = remainingBalance.rent  || 0;
  var elecBal  = remainingBalance.elec  || 0;
  var waterBal = remainingBalance.water || 0;
  var totalBal = remainingBalance.total || 0;

  var bodyText = [
    propertyName,
    "Payment Receipt",
    "",
    "Tenant: "        + (tenant["Name"]      || ""),
    "Unit: "          + (unit["UnitName"]    || "") + " · " + (unit["BuildingName"] || ""),
    "Billing Month: " + billingMonth,
    "Date Paid: "     + today,
    "",
    "Rent Paid:     ₱" + (payment.rentAmount  || 0).toFixed(2),
    "Electric Paid: ₱" + (payment.elecAmount  || 0).toFixed(2),
    "Water Paid:    ₱" + (payment.waterAmount || 0).toFixed(2),
    "Total Paid:    ₱" + (payment.totalPaid   || 0).toFixed(2),
    "",
    "Payment Mode: " + (payment.paymentMode || ""),
    "Reference No: " + (payment.referenceNo || "N/A"),
    "",
    "Remaining Balance:",
    "  Rent:     ₱" + rentBal.toFixed(2),
    "  Electric: ₱" + elecBal.toFixed(2),
    "  Water:    ₱" + waterBal.toFixed(2),
    "  Total:    ₱" + totalBal.toFixed(2),
    "",
    "For inquiries contact: " + adminContact
  ].join("\n");

  // 1. Receipt to tenant
  GmailApp.sendEmail(tenantEmail, subject, bodyText);
  Logger.log("sendReceiptEmail: receipt sent to tenant=" + tenantEmail);

  // 2. Admin copy — silent skip if AdminEmail not configured in Config sheet
  if (adminEmail) {
    var adminSubject = "COPY: " + subject;
    var adminBody    = "This is your admin copy of the receipt sent to " + tenantEmail + "\n\n" + bodyText;
    GmailApp.sendEmail(adminEmail, adminSubject, adminBody);
    Logger.log("sendReceiptEmail: admin copy sent to=" + adminEmail);
  } else {
    Logger.log("sendReceiptEmail: admin copy skipped — AdminEmail not set in Config sheet");
  }
}

function testDashboard() {
  var result = getDashboardData();
  Logger.log(JSON.stringify(result));
}

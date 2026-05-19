// ============================================================
// JJ Apartment RMS — Google Apps Script Backend
// ============================================================
// Replace YOUR_SPREADSHEET_ID with your actual Spreadsheet ID
// after running the setup steps in SETUP.md.
// ============================================================

var SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";

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

    // Verify admin token for all POST requests
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
      // Normalize dates to ISO strings
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

function generateTxnID() {
  // Format: TXN-{timestamp}-{random 4 chars}
  var ts = Date.now().toString(36).toUpperCase();
  var rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "TXN-" + ts + "-" + rnd;
}

function isTxnIDDuplicate(txnId) {
  var sheet = getSheet("Ledger");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === txnId) return true;
  }
  return false;
}

function computeBalance(tenantId) {
  var rows = sheetToJSON(getSheet("Ledger")).filter(function(r) {
    return r["TenantID"] === tenantId;
  });

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
    // Never expose PIN to GET response
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
    rows = rows.filter(function(r) { return r["BillingMonth"] === params.billingMonth; });
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
    rows = rows.filter(function(r) { return r["BillingMonth"] === params.billingMonth; });
  }
  return rows;
}

function getExpenses(params) {
  var rows = sheetToJSON(getSheet("Expenses"));

  if (params.month) {
    // Filter by YYYY-MM prefix on Date field
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
    return t["UnitID"] === params.unitId &&
           String(t["PIN"]) === String(params.pin) &&
           t["Status"] === "Active";
  });

  if (match.length === 0) throw new Error("Invalid Unit ID or PIN");

  var tenant = match[0];
  delete tenant["PIN"]; // never return PIN

  // Attach unit info
  var units = sheetToJSON(getSheet("Units"));
  var unit  = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};
  tenant["UnitName"] = unit["UnitName"] || "";
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

  // Current month: YYYY-MM
  var now          = new Date();
  var currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");

  var currentMonthLedger = ledger.filter(function(r) {
    return r["BillingMonth"] === currentMonth;
  });

  var currentMonthBilled = 0;
  var currentMonthCollected = 0;
  currentMonthLedger.forEach(function(r) {
    var amt = parseFloat(r["TotalAmount"]) || 0;
    if (r["TxnType"] === "Bill" && r["Direction"] === "Debit") {
      currentMonthBilled += amt;
    }
    if (r["TxnType"] === "Payment" && r["Direction"] === "Credit") {
      currentMonthCollected += amt;
    }
  });

  // Total outstanding across all active tenants
  var totalOutstanding = 0;
  var delinquentTenants = [];

  var unitMap = {};
  var allUnits = sheetToJSON(getSheet("Units"));
  allUnits.forEach(function(u) { unitMap[u["UnitID"]] = u; });
  var bldMap = {};
  sheetToJSON(getSheet("Buildings")).forEach(function(b) {
    bldMap[b["BuildingID"]] = b["BuildingName"];
  });

  tenants.forEach(function(tenant) {
    var tenantLedger = ledger.filter(function(r) {
      return r["TenantID"] === tenant["TenantID"];
    });

    var balance = computeBalance(tenant["TenantID"]);
    if (balance.total <= 0) return;

    totalOutstanding += balance.total;

    // Build unpaid months breakdown
    // Group Debit (Bill) rows by BillingMonth and subtract Credits for that month
    var monthMap = {};
    tenantLedger.forEach(function(r) {
      var m = r["BillingMonth"];
      if (!m) return;
      if (!monthMap[m]) {
        monthMap[m] = { rent: 0, elec: 0, water: 0 };
      }
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
      .sort() // oldest first
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
      tenantId:    tenant["TenantID"],
      name:        tenant["Name"],
      unit:        unit["UnitName"]    || tenant["UnitID"],
      building:    bldMap[unit["BuildingID"]] || "",
      unpaidMonths: unpaidMonths,
      totalOwed:   balance.total
    });
  });

  // Sort delinquent tenants by oldest unpaid month
  delinquentTenants.sort(function(a, b) {
    var aOldest = a.unpaidMonths[0] ? a.unpaidMonths[0].month : "";
    var bOldest = b.unpaidMonths[0] ? b.unpaidMonths[0].month : "";
    return aOldest < bOldest ? -1 : 1;
  });

  return {
    occupancyRate:          occupancyRate,
    totalUnits:             totalUnits,
    occupiedUnits:          occupiedUnits,
    currentMonthCollected:  currentMonthCollected,
    currentMonthBilled:     currentMonthBilled,
    totalOutstanding:       totalOutstanding,
    delinquentTenants:      delinquentTenants
  };
}

// ============================================================
// POST HANDLERS (STUBS — full logic implemented in Step 2)
// ============================================================

function generateBill(body) {
  // STUB: will iterate active tenants, compute rent + utility charges,
  // roll over prior balances, and write one Ledger Debit row per tenant.
  return { message: "stub: generateBill", billingMonth: body.billingMonth };
}

function recordPayment(body) {
  // STUB: will write one Ledger Credit row, then send Resend email receipt.
  return { message: "stub: recordPayment", tenantId: body.tenantId };
}

function saveReading(body) {
  // STUB: will write UtilityReadings row(s). For Combined units, writes two
  // rows (one per unit) each with 50% of consumption and charge.
  return { message: "stub: saveReading", unitId: body.unitId };
}

function addTenant(body) {
  // STUB: will create Tenant row, write Advance Credit and Deposit Credit
  // ledger rows, and set unit Status = Occupied.
  return { message: "stub: addTenant", name: body.name };
}

function moveTenant(body) {
  // STUB: will compute final balance, apply Deposit Credit, update tenant
  // Status = Moved Out, set unit Status = Vacant.
  return { message: "stub: moveTenant", tenantId: body.tenantId };
}

function addExpense(body) {
  // STUB: will append a row to the Expenses sheet.
  return { message: "stub: addExpense", category: body.category };
}

function updateConfig(body) {
  // STUB: will update the matching Key row in the Config sheet.
  return { message: "stub: updateConfig", key: body.key };
}

// ============================================================
// EMAIL HELPER (Resend API — called after recordPayment)
// ============================================================

function sendReceiptEmail(tenant, unit, billingMonth, payment, remainingBalance, cfg) {
  // STUB: full implementation in Step 2.
  // Will call Resend API via UrlFetchApp.fetch with RESEND_API_KEY from
  // Script Properties.
  var apiKey = PropertiesService.getScriptProperties().getProperty("RESEND_API_KEY");
  if (!apiKey || !tenant["Email"]) return;

  var subject = "Payment Receipt — " + unit["UnitName"] + ", " + billingMonth;
  var body = [
    cfg["PropertyName"] || "JJ Apartment",
    "",
    "Tenant: " + tenant["Name"],
    "Unit: " + unit["UnitName"],
    "Billing Month: " + billingMonth,
    "",
    "Rent Paid:  ₱" + (payment.rentAmount  || 0).toFixed(2),
    "Elec Paid:  ₱" + (payment.elecAmount  || 0).toFixed(2),
    "Water Paid: ₱" + (payment.waterAmount || 0).toFixed(2),
    "Total Paid: ₱" + (payment.totalPaid   || 0).toFixed(2),
    "",
    "Payment Mode: " + payment.paymentMode,
    "Reference No: " + (payment.referenceNo || "N/A"),
    "",
    "Remaining Balance:",
    "  Rent:  ₱" + (remainingBalance.rent  || 0).toFixed(2),
    "  Elec:  ₱" + (remainingBalance.elec  || 0).toFixed(2),
    "  Water: ₱" + (remainingBalance.water || 0).toFixed(2),
    "",
    "Admin Contact: " + (cfg["AdminContact"] || "N/A")
  ].join("\n");

  var payload = {
    from:    cfg["ResendFromEmail"],
    to:      [tenant["Email"]],
    subject: subject,
    text:    body
  };

  UrlFetchApp.fetch("https://api.resend.com/emails", {
    method:  "post",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type":  "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

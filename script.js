const DEFAULT_KEY = "C1";
const DEFAULT_BAUTEIL = "01";
const ACCESS_PIN = "2025"; // simple PIN to unlock the tool
const THEME_STORAGE_KEY = "aks-theme";
const DEFAULT_THEME = "light";
const RESULT_HEADERS = [
  "Gruppe Technischer Anlagen",
  "Technische Anlage",
  "Techn. Anlagen Nr.",
  "GLT-Code",
  "Anlagenpriorität",
  "Kostenstelle",
  "Gebäude",
  "Raum",
  "Anlagetyp",
  "ID Raum",
  "Menge"
];

let CATALOG = [];          // raw from JSON (AKS catalog)
let CONFIG = {};           // map: "groupId||code" -> entry
let GROUP_MAP = new Map(); // groupId -> [entries]
let SORTED_GROUP_IDS = []; // numerically sorted group IDs

// building data from building_id_map.json
let BUILDING_MAP = [];      // full records
let BUILDING_LABELS = [];   // unique bauwerk labels, e.g. "Gebäude 48"
let BUILDING_TO_ID = {};    // bauwerk -> idBauwerk

// ------------------------
// Helpers
// ------------------------

// Extract number from "Gebäude 48", "Gebäude 05 (Mensa)", etc.
function getBuildingNumber(buildingLabel) {
  const m = (buildingLabel || "").match(/(\d+)/);
  return m ? m[1] : "";
}

// ------------------------
// Load aks_catalog.json
// ------------------------
async function loadCatalog() {
  const res = await fetch("aks_catalog.json");
  if (!res.ok) {
    throw new Error("Cannot load aks_catalog.json (status " + res.status + ")");
  }
  CATALOG = await res.json();

  CATALOG.forEach(entry => {
    const key = `${entry.groupId}||${entry.code}`;
    CONFIG[key] = {
      groupId: entry.groupId,
      sub: entry.sub,
      code: entry.code,
      description: entry.description
    };
    if (!GROUP_MAP.has(entry.groupId)) {
      GROUP_MAP.set(entry.groupId, []);
    }
    GROUP_MAP.get(entry.groupId).push(entry);
  });

  // Sort variants inside each group
  GROUP_MAP.forEach(arr => {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  });

  // Sort group IDs numerically for the dropdown
  SORTED_GROUP_IDS = [...GROUP_MAP.keys()].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) {
      return na - nb;
    }
    return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
  });
}

// ------------------------
// Load building list from JSON
// ------------------------
async function loadBuildings() {
  try {
    const res = await fetch("building_id_map.json");
    if (!res.ok) {
      console.warn("Cannot load building_id_map.json (status " + res.status + ")");
      return;
    }
    BUILDING_MAP = await res.json();

    const labelSet = new Set();
    BUILDING_TO_ID = {};

    BUILDING_MAP.forEach(rec => {
      const label = (rec.bauwerk || "").trim();
      const idBauwerk = (rec.idBauwerk || "").trim();
      if (!label) return;

      // Collect unique building names for dropdown
      labelSet.add(label);

      // Map building -> idBauwerk (first one wins, constant per building)
      if (idBauwerk && !BUILDING_TO_ID[label]) {
        BUILDING_TO_ID[label] = idBauwerk;
      }
    });

    BUILDING_LABELS = Array.from(labelSet).sort((a, b) =>
      a.localeCompare(b, "de", { numeric: true, sensitivity: "base" })
    );
  } catch (err) {
    console.warn("Error loading building_id_map.json:", err);
  }
}

// ------------------------
// Create one input row
// ------------------------
function createInputRow() {
  const row = document.createElement("div");
  row.className = "input-table-row";

  const groupCell = document.createElement("div");
  const variantCell = document.createElement("div");
  const buildingCell = document.createElement("div");
  const roomCell = document.createElement("div");
  const qtyCell = document.createElement("div");
  const deleteCell = document.createElement("div");
  deleteCell.className = "delete-row";

  const groupSelect = document.createElement("select");
  const variantSelect = document.createElement("select");
  const buildingSelect = document.createElement("select");
  const roomInput = document.createElement("textarea");
  const qtyInput = document.createElement("input");

  buildingSelect.classList.add("building-input");
  roomInput.classList.add("room-input");
  qtyInput.classList.add("qty-input");

  // Gruppe
  groupSelect.innerHTML = `<option value="">-- Gruppe wählen --</option>`;
  SORTED_GROUP_IDS.forEach(groupId => {
    const opt = document.createElement("option");
    opt.value = groupId;
    opt.textContent = groupId;
    groupSelect.appendChild(opt);
  });

  // Anlagetyp
  variantSelect.innerHTML = `<option value="">-- Anlagetyp wählen --</option>`;

  // Gebäude from list
  buildingSelect.innerHTML = `<option value="">-- Gebäude wählen --</option>`;
  BUILDING_LABELS.forEach(label => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    buildingSelect.appendChild(opt);
  });

  // Räume + Menge
  roomInput.placeholder = "U05\nU06 x4\nU08 x2\nE16 x2\nE23 x3";
  qtyInput.type = "number";
  qtyInput.min = "1";
  qtyInput.value = "1";

  groupSelect.addEventListener("change", () => {
    const groupId = groupSelect.value;
    variantSelect.innerHTML = `<option value="">-- Anlagetyp wählen --</option>`;
    if (!groupId) return;
    const entries = GROUP_MAP.get(groupId) || [];
    entries.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.code;
      opt.textContent = `${e.code} – ${e.description || ""}`;
      variantSelect.appendChild(opt);
    });
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.textContent = "×";
  delBtn.className = "btn-secondary";
  delBtn.style.padding = "0.25rem 0.5rem";
  delBtn.addEventListener("click", () => {
    row.remove();
  });

  groupCell.appendChild(groupSelect);
  variantCell.appendChild(variantSelect);
  buildingCell.appendChild(buildingSelect);
  roomCell.appendChild(roomInput);
  qtyCell.appendChild(qtyInput);
  deleteCell.appendChild(delBtn);

  row.appendChild(groupCell);
  row.appendChild(variantCell);
  row.appendChild(buildingCell);
  row.appendChild(roomCell);
  row.appendChild(qtyCell);
  row.appendChild(deleteCell);

  return row;
}

// ------------------------
// ID generation
// ------------------------
function generateIdsForRow(groupId, building, room, variant, quantity) {
  const key = `${groupId}||${variant}`;
  const cfg = CONFIG[key];
  if (!cfg) {
    throw new Error("Unknown AKS combination: " + key);
  }

  const gebNum = getBuildingNumber(building);
  const roomStr = room.trim();
  const floor = roomStr.charAt(0);

  const ort = `${DEFAULT_KEY}${gebNum}${DEFAULT_BAUTEIL}${floor}_${roomStr}`;
  const qty = Number(quantity) || 1;
  const ids = [];

  for (let i = 1; i <= qty; i++) {
    const nr = String(i).padStart(3, "0");
    const id = `${ort}_${cfg.groupId}_${cfg.sub}_${cfg.code}${nr}`;
    ids.push(id);
  }

  return { cfg, ids };
}

function addResultRow(
  gruppe,
  technischeAnlage,
  technNr,
  gltCode,
  priority,
  costCenter,
  gebaeude,
  raum,
  anlagetyp,
  idRaum,
  menge
) {
  const tbody = document.getElementById("result-body");
  const tr = document.createElement("tr");

  const cells = [
    gruppe,
    technischeAnlage,
    technNr,
    gltCode,
    priority,
    costCenter,
    gebaeude,
    raum,
    anlagetyp,
    idRaum,
    String(menge)
  ];

  cells.forEach(text => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  });

  tbody.appendChild(tr);
}

function clearResults() {
  document.getElementById("result-body").innerHTML = "";
  const info = document.getElementById("row-count-info");
  if (info) info.textContent = "0 assets generated";
}

function sortResultTable() {
  const tbody = document.getElementById("result-body");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((a, b) => {
    const gruppeA = a.cells[0].textContent;
    const gruppeB = b.cells[0].textContent;

    const cmpGruppe = gruppeA.localeCompare(gruppeB, "de", {
      numeric: true,
      sensitivity: "base"
    });
    if (cmpGruppe !== 0) return cmpGruppe;

    const idA = a.cells[2].textContent;
    const idB = b.cells[2].textContent;
    return idA.localeCompare(idB, "de", { numeric: true, sensitivity: "base" });
  });

  rows.forEach(row => tbody.appendChild(row));

  const info = document.getElementById("row-count-info");
  if (info) info.textContent = `${rows.length} assets generated`;
}

function collectResultTableRows() {
  const tbody = document.getElementById("result-body");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  return rows.map(tr =>
    Array.from(tr.querySelectorAll("td")).map(td => td.textContent)
  );
}

function downloadXLSX() {
  const rows = collectResultTableRows();
  if (rows.length === 0) {
    alert("No data to download.");
    return;
  }

  const data = [RESULT_HEADERS, ...rows];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "AKS Assets");

  XLSX.writeFile(wb, "aks_assets.xlsx");
}

// Keep German special letters as-is for CSV export
function normalizeGermanForCSV(str) {
  return str ?? "";
}

function downloadCSV() {
  const rows = collectResultTableRows();
  if (rows.length === 0) {
    alert("No data to download.");
    return;
  }

  const escapeCell = value => {
    const normalized = normalizeGermanForCSV(value ?? "");
    const hasSpecial = /[",\n]/.test(normalized);
    const escaped = normalized.replace(/"/g, '""');
    return hasSpecial ? `"${escaped}"` : escaped;
  };

  const allRows = [RESULT_HEADERS, ...rows];
  const csvContent = allRows
    .map(row => row.map(escapeCell).join(","))
    .join("\r\n");

  const BOM = "\uFEFF"; // ensure Excel opens UTF-8 correctly
  const blob = new Blob([BOM, csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = "aks_assets.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (err) {
    console.warn("Cannot access localStorage for theme:", err);
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn("Cannot persist theme preference:", err);
  }
}

// ------------------------
// DOMContentLoaded
// ------------------------
window.addEventListener("DOMContentLoaded", async () => {
  const pinOverlay = document.getElementById("pin-overlay");
  const pinInput = document.getElementById("pin-input");
  const pinSubmit = document.getElementById("pin-submit");
  const pinError = document.getElementById("pin-error");
  const themeToggle = document.getElementById("theme-toggle");

  const clearPinError = () => {
    pinError.style.display = "none";
    pinError.textContent = "";
  };

  const unlockApp = () => {
    clearPinError();
    pinOverlay.style.display = "none";
  };

  const handlePinSubmit = () => {
    const entered = (pinInput.value || "").trim();
    if (entered === ACCESS_PIN) {
      unlockApp();
      pinInput.value = "";
      return;
    }
    pinInput.value = "";
    pinError.textContent = "Wrong PIN. Try again.";
    pinError.style.display = "block";
    pinInput.focus();
  };

  pinInput.addEventListener("input", () => {
    if (pinError.style.display === "block") {
      clearPinError();
    }
  });

  pinInput.addEventListener("keydown", evt => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      handlePinSubmit();
    }
  });

  pinSubmit.addEventListener("click", handlePinSubmit);

  const applyTheme = theme => {
    document.body.dataset.theme = theme;
    if (themeToggle) {
      const isDark = theme === "dark";
      themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
    }
  };

  const storedTheme = getStoredTheme();
  applyTheme(storedTheme || DEFAULT_THEME);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      storeTheme(nextTheme);
    });
  }

  const inputRowsContainer = document.getElementById("input-rows");
  const addRowBtn = document.getElementById("add-row-btn");
  const generateBtn = document.getElementById("generate-btn");
  const clearResultsBtn = document.getElementById("clear-results-btn");
  const downloadXlsxBtn = document.getElementById("download-xlsx-btn");
  const downloadCsvBtn = document.getElementById("download-csv-btn");
  const inputError = document.getElementById("input-error");

  try {
    await loadCatalog();
    await loadBuildings();   // load buildings + idBauwerk
  } catch (err) {
    alert("Error loading data: " + err.message);
    console.error(err);
    return;
  }

  // first blank row
  inputRowsContainer.appendChild(createInputRow());

  addRowBtn.addEventListener("click", () => {
    inputRowsContainer.appendChild(createInputRow());
  });

  generateBtn.addEventListener("click", () => {
    inputError.style.display = "none";
    inputError.textContent = "";
    clearResults();

    const rowDivs = Array.from(inputRowsContainer.children);
    let anyValid = false;

    rowDivs.forEach(row => {
      const selects = row.querySelectorAll("select");
      const groupId = selects[0]?.value.trim() || "";
      const variant = selects[1]?.value.trim() || "";

      const buildingSelect = row.querySelector(".building-input");
      const roomInput = row.querySelector(".room-input");
      const qtyInput = row.querySelector(".qty-input");

      const building = buildingSelect ? buildingSelect.value.trim() : "";
      const roomRaw = roomInput ? roomInput.value : "";
      const defaultQty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

      if (!groupId && !variant && !building && !roomRaw.trim()) {
        return;
      }

      if (!groupId || !variant || !building || !roomRaw.trim()) {
        return;
      }

      const roomTokens = roomRaw
        .split(/[\n,;]+/)
        .map(r => r.trim())
        .filter(r => r.length > 0);

      roomTokens.forEach(token => {
        const match = token.match(/^(\S+)(?:\s*x(\d+))?$/i);
        if (!match) return;

        const room = match[1];
        const qtyForRoom = match[2] ? parseInt(match[2], 10) : defaultQty;

        try {
          const { cfg, ids } = generateIdsForRow(
            groupId,
            building,
            room,
            variant,
            qtyForRoom
          );

          const gruppeCell = `${cfg.groupId}.${cfg.sub} ${cfg.description || ""}`.trim();
          const priority = "mittel";

          const gebNum = getBuildingNumber(building);
          const costCenter = "99000" + gebNum;

          // ID Raum from building map (idBauwerk)
          const idRaum = BUILDING_TO_ID[building] || "";

          ids.forEach(id => {
            const techAnlage = `${cfg.description || ""}_${id}`.replace(/^_/, "");
            addResultRow(
              gruppeCell,
              techAnlage,
              id,
              id,
              priority,
              costCenter,
              building,
              room,
              cfg.code,
              idRaum,
              1
            );
          });

          anyValid = true;
        } catch (err) {
          console.error(err);
        }
      });
    });

    if (anyValid) {
      sortResultTable();
    }

    if (!anyValid) {
      inputError.textContent =
        "No valid rows. Please fill Gruppe, Anlagetyp, Gebäude and Räume.";
      inputError.style.display = "block";
    }
  });

  clearResultsBtn.addEventListener("click", clearResults);
  downloadXlsxBtn.addEventListener("click", downloadXLSX);
  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener("click", downloadCSV);
  }
});

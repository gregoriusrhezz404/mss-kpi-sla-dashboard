/**
 * WAJIB: pastikan nama file di bawah SAMA PERSIS dengan nama file CSV di repo.
 * (spasi & huruf besar/kecil harus sama)
 */
const DATASETS = [
  { label: "MSS FEB 2026 (1-28)", file: "MSS FEB 2026(1-28).csv" },
  { label: "PVOT ALL FEB 2026 (1-28)", file: "PVOT ALL FEB 2026 (1-28).csv" },
  { label: "Tiket FEB 2026 (1-28)", file: "Tiket FEB 2026 (1-28).csv" },
];

const el = (id) => document.getElementById(id);
const tbl = el("tbl");
const metaEl = el("meta");
const activeFileEl = el("activeFile");
const statusTextEl = el("statusText");

let headers = [];
let rows = [];
let page = 1;
let rpp = 100;

// ---------- helpers ----------
function setStatus(t){ statusTextEl.textContent = t; }

function guessDelimiter(text){
  // ambil 10 baris awal, hitung jumlah , vs ;
  const lines = text.split(/\r?\n/).slice(0, 10).join("\n");
  const commas = (lines.match(/,/g) || []).length;
  const semis  = (lines.match(/;/g) || []).length;
  // banyak CSV dari Excel Indonesia pakai ; sebagai delimiter
  return semis > commas ? ";" : ",";
}

function cleanCell(v){
  let s = String(v ?? "").trim();
  // buang hanya di PINGGIR, jangan sentuh delimiter di tengah
  s = s.replace(/^[\s:;,\t]+/, "").replace(/[\s:;,\t]+$/, "");
  // kalau isinya cuma ;;;;; atau :;;; -> kosong
  if (/^[:;]+$/.test(s)) return "";
  return s;
}

function toNum(v){
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;

  // kalau masih ada ';' di tengah, biasanya itu gabungan 2 kolom -> BUKAN angka
  if (s.includes(";")) return null;

  s = s.replace("%","");

  // format Indonesia: 98,75 => 98.75
  // format ribuan: 1.234,56 => 1234.56
  s = s.replace(/\./g,"").replace(",","."); 

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseCSV(text){
  const delim = guessDelimiter(text);
  const out = [];

  let row = [];
  let cur = "";
  let inQ = false;

  for (let i=0; i<text.length; i++){
    const ch = text[i];

    if (ch === '"'){
      if (inQ && text[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }

    if (!inQ && ch === delim){
      row.push(cur); cur = "";
      continue;
    }

    if (!inQ && (ch === "\n" || ch === "\r")){
      if (ch === "\r" && text[i+1] === "\n") i++;
      row.push(cur); cur = "";

      const cleaned = row.map(cleanCell);
      if (cleaned.some(c => c !== "")) out.push(cleaned);

      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  const cleaned = row.map(cleanCell);
  if (cleaned.some(c => c !== "")) out.push(cleaned);

  return out;
}

function isJunkRow(cells){
  const cleaned = cells.map(cleanCell);
  const joined = cleaned.join(" ").toLowerCase();
  const nonEmpty = cleaned.filter(x => x !== "").length;

  if (nonEmpty === 0) return true;
  // buang baris pivot label / header aneh yang bikin tampilan rusak
  if (joined.includes("column labels")) return true;
  if (joined.includes("average of")) return true;
  // kalau kosongnya kebanyakan (biasanya pivot header)
  if (nonEmpty < 3) return true;

  return false;
}

function toNum(v){
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace("%","");
  // 1.234,56 -> 1234.56 ; 98,75 -> 98.75
  s = s.replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function heatClass(v){
  const n = toNum(v);
  if (n === null) return "";
  if (n === 1) return "g";
  if (n === 0) return "r";
  if (n >= 99) return "g";
  if (n >= 95) return "y";
  return "r";
}

// ---------- UI ----------
function setupDropdown(){
  const sel = el("dataset");
  sel.innerHTML = "";
  for(const d of DATASETS){
    const opt = document.createElement("option");
    opt.value = d.file;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", ()=>{
    page = 1;
    load();
  });
}

function applyPaging(){
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / rpp));
  if (page > totalPages) page = totalPages;

  el("prev").disabled = page <= 1;
  el("next").disabled = page >= totalPages;

  metaEl.textContent = `Rows: ${total.toLocaleString("id-ID")} • Page ${page}/${totalPages} • RPP ${rpp}`;
}

function render(){
  tbl.innerHTML = "";

  if (!headers.length){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.textContent = "No data.";
    td.style.padding = "16px";
    tr.appendChild(td);
    tbl.appendChild(tr);
    return;
  }

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h=>{
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const start = (page - 1) * rpp;
  const end = start + rpp;
  const pageRows = rows.slice(start, end);

  const tbody = document.createElement("tbody");
  pageRows.forEach(r=>{
    const tr = document.createElement("tr");
    for (let i=0; i<headers.length; i++){
      const td = document.createElement("td");
      const v = cleanCell(r[i] ?? "");
      td.textContent = v;

      const n = toNum(v);
      if (n !== null) td.classList.add("num");
      const hc = heatClass(v);
      if (hc) td.classList.add(hc);

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
}

// ---------- load ----------
async function load(){
  const file = el("dataset").value || DATASETS[0].file;
  activeFileEl.textContent = file;

  setStatus("Loading…");

  try{
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);

    const text = await res.text();
    const raw = parseCSV(text).filter(r => !isJunkRow(r));

    if (!raw.length){
      headers = [];
      rows = [];
      applyPaging();
      render();
      setStatus("Empty");
      return;
    }

    headers = raw[0].map((h,i)=> cleanCell(h) || `col_${i}`);
    rows = raw.slice(1);

    applyPaging();
    render();
    setStatus("Ready");
  }catch(err){
    console.error(err);
    headers = [];
    rows = [];
    applyPaging();
    render();
    setStatus("Error");
    metaEl.textContent = `Gagal load: ${err.message}`;
  }
}

function wire(){
  el("rpp").addEventListener("change", ()=>{
    rpp = Number(el("rpp").value);
    page = 1;
    applyPaging();
    render();
  });

  el("prev").addEventListener("click", ()=>{
    if (page > 1){ page--; applyPaging(); render(); }
  });

  el("next").addEventListener("click", ()=>{
    const totalPages = Math.max(1, Math.ceil(rows.length / rpp));
    if (page < totalPages){ page++; applyPaging(); render(); }
  });

  el("reload").addEventListener("click", ()=> load());
}

// init
setupDropdown();
wire();
rpp = Number(el("rpp").value);
load();


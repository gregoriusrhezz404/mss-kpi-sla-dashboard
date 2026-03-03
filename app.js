const DATASETS = [
  { label: "MSS FEB 2026 (1-28)", file: "MSS FEB 2026(1-28).csv" },
  { label: "PVOT ALL FEB 2026 (1-28)", file: "PVOT ALL FEB 2026 (1-28).csv" },
  { label: "Tiket FEB 2026 (1-28)", file: "Tiket FEB 2026 (1-28).csv" },
];

const el = (id) => document.getElementById(id);
const tbl = el("tbl");
const statusEl = el("status");
const metaEl = el("meta");
const activeFileEl = el("activeFile");
const buildInfoEl = el("buildInfo");

let headers = [];
let rows = [];
let viewRows = [];
let page = 1;
let rpp = 100;
let sortKey = -1;
let sortDir = 1;

function setStatus(msg, spinning=true){
  statusEl.innerHTML = spinning
    ? `<div class="spinner"></div><div>${msg}</div>`
    : `<div style="width:14px;height:14px"></div><div>${msg}</div>`;
}

function cleanCell(v){
  return String(v ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .replace(/^;+|;+$|^,+|,+$/g, "");
}

function detectDelimiter(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 10);
  const first = lines[0] ?? "";
  const comma = (first.match(/,/g) || []).length;
  const semi  = (first.match(/;/g) || []).length;
  return semi > comma ? ";" : ",";
}

function parseCSV(text) {
  const delim = detectDelimiter(text);
  const out = [];
  let row = [];
  let cur = "";
  let inQ = false;

  for (let i=0;i<text.length;i++){
    const ch = text[i];

    if (ch === '"'){
      if (inQ && text[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ){
      row.push(cur); cur="";
    } else if ((ch === '\n' || ch === '\r') && !inQ){
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur="";

      const cleaned = row.map(cleanCell);
      if (cleaned.some(c => c !== "")) out.push(cleaned);
      row = [];
    } else {
      cur += ch;
    }
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
  if (nonEmpty < 3) return true;
  if (joined.includes("column labels")) return true;
  if (joined.includes("average of")) return true;

  return false;
}

function pickHeaderIndex(rawRows){
  const limit = Math.min(rawRows.length, 25);
  let best = { idx: 0, score: -1 };

  for (let i=0;i<limit;i++){
    const r = rawRows[i];
    const cleaned = r.map(cleanCell);
    if (isJunkRow(cleaned)) continue;

    const nonEmpty = cleaned.filter(x => x !== "").length;
    const numericCells = cleaned.filter(x => toNum(x) !== null).length;
    const textCells = cleaned.filter(x => /[A-Za-z]/.test(x)).length;

    const score = nonEmpty * 2 + textCells * 3 - numericCells * 1;
    if (score > best.score) best = { idx: i, score };
  }
  return best.idx;
}

function toNum(v){
  if(v == null) return null;
  let s = cleanCell(v);
  if(!s) return null;
  s = s.replace("%","");
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

function setupDatasetDropdown(){
  const sel = el("dataset");
  sel.innerHTML = "";
  for(const d of DATASETS){
    const opt = document.createElement("option");
    opt.value = d.file;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    page = 1;
    sortKey = -1;
    sortDir = 1;
    load();
  });
}

async function load(){
  const file = el("dataset").value || DATASETS[0].file;
  activeFileEl.textContent = file;
  setStatus("Loading CSV…", true);
  buildInfoEl.textContent = "Loading";

  try{
    const url = encodeURI(file);
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error(`File tidak ditemukan (${res.status}). Cek nama file di repo.`);

    const text = await res.text();

    const parsed = parseCSV(text);
    const cleaned = parsed.filter(r => !isJunkRow(r));

    if(!cleaned.length){
      headers = [];
      rows = [];
      applyFilter();
      render();
      setStatus("CSV kosong / tidak terbaca.", false);
      buildInfoEl.textContent = "Empty";
      return;
    }

    const hIdx = pickHeaderIndex(cleaned);
    headers = (cleaned[hIdx] || []).map((h,i)=> h || `col_${i}`);
    rows = cleaned.slice(hIdx + 1);

    // normalize row length
    const maxLen = headers.length;
    rows = rows.map(r => {
      const x = r.slice(0, maxLen);
      while (x.length < maxLen) x.push("");
      return x;
    });

    applyFilter();
    render();
    setStatus("Loaded.", false);
    buildInfoEl.textContent = "Ready";
  } catch(err){
    console.error(err);
    headers = [];
    rows = [];
    applyFilter();
    render();
    setStatus(`Error: ${err.message}`, false);
    buildInfoEl.textContent = "Error";
  }
}

function applyFilter(){
  const q = el("q").value.trim().toLowerCase();
  const filtered = !q ? rows : rows.filter(r => r.join(" ").toLowerCase().includes(q));
  viewRows = sortKey >= 0 ? sortRows(filtered) : filtered;

  const total = viewRows.length;
  const totalPages = Math.max(1, Math.ceil(total / rpp));
  if(page > totalPages) page = totalPages;

  el("prev").disabled = page <= 1;
  el("next").disabled = page >= totalPages;

  metaEl.textContent = `Rows: ${total.toLocaleString("id-ID")} • Page ${page}/${totalPages} • RPP ${rpp}`;
}

function sortRows(list){
  const idx = sortKey;
  const dir = sortDir;
  return [...list].sort((a,b)=>{
    const av = a[idx] ?? "";
    const bv = b[idx] ?? "";
    const an = toNum(av);
    const bn = toNum(bv);

    if(an !== null && bn !== null) return (an - bn) * dir;
    return String(av).localeCompare(String(bv), "id", {numeric:true, sensitivity:"base"}) * dir;
  });
}

function render(){
  tbl.innerHTML = "";

  if(!headers.length){
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

  headers.forEach((h, idx)=>{
    const th = document.createElement("th");
    th.textContent = h;

    const s = document.createElement("span");
    s.className = "sort";
    s.textContent = (sortKey === idx) ? (sortDir === 1 ? "▲" : "▼") : "↕";
    th.appendChild(s);

    th.addEventListener("click", ()=>{
      if(sortKey === idx) sortDir *= -1;
      else { sortKey = idx; sortDir = 1; }
      applyFilter();
      render();
    });

    trh.appendChild(th);
  });

  thead.appendChild(trh);
  tbl.appendChild(thead);

  const start = (page - 1) * rpp;
  const end = start + rpp;
  const pageRows = viewRows.slice(start, end);

  const tbody = document.createElement("tbody");

  pageRows.forEach(r=>{
    const tr = document.createElement("tr");
    for(let i=0;i<headers.length;i++){
      const td = document.createElement("td");
      const v = r[i] ?? "";
      td.textContent = v;

      const n = toNum(v);
      if(n !== null) td.classList.add("num");
      const hc = heatClass(v);
      if(hc) td.classList.add(hc);

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
}

function wire(){
  el("q").addEventListener("input", ()=>{
    page = 1;
    applyFilter();
    render();
  });

  el("rpp").addEventListener("change", ()=>{
    rpp = Number(el("rpp").value);
    page = 1;
    applyFilter();
    render();
  });

  el("prev").addEventListener("click", ()=>{
    if(page > 1){ page--; applyFilter(); render(); }
  });

  el("next").addEventListener("click", ()=>{
    const totalPages = Math.max(1, Math.ceil(viewRows.length / rpp));
    if(page < totalPages){ page++; applyFilter(); render(); }
  });

  el("reload").addEventListener("click", ()=> load());

  window.addEventListener("keydown", (e)=>{
    if(e.key === "/" && document.activeElement !== el("q")){
      e.preventDefault();
      el("q").focus();
    }
    if(e.key === "Escape"){
      el("q").value = "";
      page = 1;
      applyFilter();
      render();
    }
  });
}

setupDatasetDropdown();
wire();
rpp = Number(el("rpp").value);
load();
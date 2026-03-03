const DATASETS = [
  { label: "MSS FEB 2026 (1-28)", file: "MSS FEB 2026(1-28).csv" },
  { label: "PVOT ALL FEB 2026 (1-28)", file: "PVOT ALL FEB 2026 (1-28).csv" },
  { label: "Tiket FEB 2026 (1-28)", file: "Tiket FEB 2026 (1-28).csv" },
];

const el = (id) => document.getElementById(id);
const tbl = el("tbl");

let headers = [];
let rows = [];     // all
let view = [];     // filtered + sorted
let page = 1;
let rpp = 100;
let sortKey = -1;
let sortDir = 1;

const setStatus = (txt, ok=true) => {
  el("statusText").textContent = txt;
  el("dot").style.background = ok ? "var(--accent2)" : "#ef4444";
};

function cleanCell(v){
  let s = String(v ?? "").trim();
  s = s.replace(/^[\s:;,\t]+/, "").replace(/[\s:;,\t]+$/, "");
  if (/^[:;]+$/.test(s)) return "";
  return s;
}

function parseCSV(text){
  // CSV parser (supports quotes)
  const out = [];
  let row = [];
  let cur = "";
  let inQ = false;

  for (let i=0;i<text.length;i++){
    const ch = text[i];
    if (ch === '"'){
      if (inQ && text[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ){
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

function toNum(v){
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(";")) return null; // gabungan 2 kolom
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

function setupDatasets(){
  const sel = el("dataset");
  sel.innerHTML = "";
  for(const d of DATASETS){
    const opt = document.createElement("option");
    opt.value = d.file;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    page = 1; sortKey = -1; sortDir = 1;
    load();
  });
}

function apply(){
  const q = el("q").value.trim().toLowerCase();
  const filtered = !q ? rows : rows.filter(r => r.join(" ").toLowerCase().includes(q));
  view = sortKey >= 0 ? sortRows(filtered) : filtered;

  const totalPages = Math.max(1, Math.ceil(view.length / rpp));
  if (page > totalPages) page = totalPages;

  el("prev").disabled = page <= 1;
  el("next").disabled = page >= totalPages;

  el("rowsCount").textContent = rows.length.toLocaleString("id-ID");
  el("filteredCount").textContent = view.length.toLocaleString("id-ID");
  el("pageInfo").textContent = `${page}/${totalPages}`;
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
    th.textContent = h || `col_${idx}`;
    const s = document.createElement("span");
    s.className = "sort";
    s.textContent = (sortKey === idx) ? (sortDir === 1 ? "▲" : "▼") : "↕";
    th.appendChild(s);

    th.addEventListener("click", ()=>{
      if(sortKey === idx) sortDir *= -1;
      else { sortKey = idx; sortDir = 1; }
      apply();
      render();
    });

    trh.appendChild(th);
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const start = (page - 1) * rpp;
  const end = start + rpp;
  const pageRows = view.slice(start, end);

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

async function load(){
  const file = el("dataset").value || DATASETS[0].file;
  el("activeFile").textContent = file;

  setStatus("Loading…", true);

  try{
    const res = await fetch(file, { cache:"no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const raw = parseCSV(text).filter(r => !isJunkRow(r));

    headers = raw[0] || [];
    rows = raw.slice(1);

    apply();
    render();
    setStatus("Ready", true);
  } catch(e){
    console.error(e);
    headers = [];
    rows = [];
    apply();
    render();
    setStatus("Error", false);
  }
}

// debounce search biar cepat
let t = null;
function wire(){
  el("q").addEventListener("input", ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      page = 1;
      apply();
      render();
    }, 150);
  });

  el("clear").addEventListener("click", ()=>{
    el("q").value = "";
    page = 1;
    apply();
    render();
  });

  el("rpp").addEventListener("change", ()=>{
    rpp = Number(el("rpp").value);
    page = 1;
    apply();
    render();
  });

  el("prev").addEventListener("click", ()=>{
    if(page > 1){ page--; apply(); render(); }
  });

  el("next").addEventListener("click", ()=>{
    const totalPages = Math.max(1, Math.ceil(view.length / rpp));
    if(page < totalPages){ page++; apply(); render(); }
  });

  el("reload").addEventListener("click", load);

  window.addEventListener("keydown", (e)=>{
    if(e.key === "/" && document.activeElement !== el("q")){
      e.preventDefault();
      el("q").focus();
    }
    if(e.key === "Escape"){
      el("q").value = "";
      page = 1;
      apply();
      render();
    }
  });
}

// init
setupDatasets();
wire();
rpp = Number(el("rpp").value);
load();

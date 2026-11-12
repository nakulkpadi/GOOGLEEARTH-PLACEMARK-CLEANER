/*
 WEBNIX STUDIO — Placemark Cleaner
 www.webnixstudio.in
 Local-only KML/KMZ processing. Third-party dependency: JSZip (MIT/GPLv3 dual license).
 Icons are hidden using IconStyle scale 0; LabelStyle scale 1. Point names stay in KML.
*/
(function () {
  'use strict';
  const COLORS = [
    ['yellow','Yellow','#f1c623'],['blue','Blue','#438af5'],['red','Red','#f15b5b'],
    ['pink','Pink','#e85ead'],['green','Green','#35bd73'],['lightblue','Light Blue / Cyan','#50cbd3'],
    ['purple','Purple','#835de5'],['white','White','#fafbff'],['orange','Orange','#f69e43'],
    ['black','Black','#333b52'],['other','Other / Custom','#b3bdce']
  ];
  const COLOR_NAMES = Object.fromEntries(COLORS.map(x => [x[0], x[1]]));
  const COLOR_MAP = {ylw:'yellow',yellow:'yellow',gold:'yellow',blue:'blue',blu:'blue',navy:'blue',red:'red',
    pink:'pink',mag:'pink',magenta:'pink',grn:'green',green:'green',lime:'green',
    ltblu:'lightblue',tblu:'lightblue',lightblue:'lightblue',cyan:'lightblue',teal:'lightblue',turquoise:'lightblue',
    purple:'purple',violet:'purple',prpl:'purple',pur:'purple',wht:'white',white:'white',orange:'orange',black:'black',blk:'black'};
  const COLOR_RE = /(?:^|[-_./ ])(ltblu|tblu|lightblue|turquoise|magenta|purple|yellow|orange|violet|green|black|white|pink|cyan|teal|blue|ylw|blu|red|grn|wht|blk|prpl|pur|mag|lime|gold)(?=[-_./ ]|$)/i;
  const GEOMS = new Set(['Point','LineString','LinearRing','Polygon','MultiGeometry','Model','Track','MultiTrack']);
  const NONPOINT = new Set(['LineString','LinearRing','Polygon','Model','Track','MultiTrack']);
  const $ = id => document.getElementById(id);
  let state = null;
  let selected = new Set();
  let page = 0;
  const PAGE_SIZE = 110;

  function children(parent, name) { return parent ? Array.from(parent.children).filter(x => x.localName === name) : []; }
  function child(parent, name) { return children(parent, name)[0] || null; }
  function content(elem) { return elem ? (elem.textContent || '').trim() : ''; }
  function get(parent, name) { return content(child(parent, name)); }
  function descendants(elem, predicate) {
    const out = []; if (!elem) return out;
    const todo = Array.from(elem.children);
    while (todo.length) {
      const node = todo.pop();
      if (predicate(node)) out.push(node);
      todo.push(...Array.from(node.children));
    }
    return out;
  }
  function makeElem(parent, name) { return parent.ownerDocument.createElementNS(parent.namespaceURI || 'http://www.opengis.net/kml/2.2', name); }
  function ensure(parent, name) { let el = child(parent, name); if (!el) { el = makeElem(parent, name); parent.appendChild(el); } return el; }
  function textSet(el, val) { el.textContent = val; }

  function parseKML(xml, fileLabel) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err || !doc.documentElement || doc.documentElement.localName !== 'kml')
      throw Error('Invalid KML XML in ' + fileLabel + (err ? ': ' + err.textContent.slice(0, 120) : ''));
    return doc;
  }
  function propsFromStyle(style) {
    const iconStyle = child(style, 'IconStyle'); if (!iconStyle) return {};
    const obj = {};
    const icon = child(iconStyle, 'Icon');
    if (icon) obj.href = get(icon, 'href');
    for (const field of ['color','colorMode','scale']) {
      const e = child(iconStyle, field); if (e) obj[field] = content(e);
    }
    return obj;
  }
  function styleDefinitions(doc) {
    const map = new Map();
    for (const e of doc.getElementsByTagName('*')) {
      if ((e.localName === 'Style' || e.localName === 'StyleMap') && e.hasAttribute('id')) map.set(e.getAttribute('id'), e);
    }
    return map;
  }
  function resolveStyle(url, defs, seen = new Set()) {
    if (!url) return {props:{},resolved:true};
    if (!url.startsWith('#')) return {props:{},resolved:false};
    const key = url.slice(1);
    if (seen.has(key) || !defs.has(key)) return {props:{},resolved:false};
    seen.add(key);
    const style = defs.get(key);
    if (style.localName === 'Style') return {props:propsFromStyle(style),resolved:true};
    if (style.localName !== 'StyleMap') return {props:{},resolved:false};
    const pairs = children(style,'Pair');
    const pair = pairs.find(p => get(p,'key') === 'normal') || pairs[0];
    if (!pair) return {props:{},resolved:false};
    const embedded = child(pair,'Style');
    return embedded ? {props:propsFromStyle(embedded),resolved:true} : resolveStyle(get(pair,'styleUrl'),defs,seen);
  }
  function pointOnly(pm) {
    const geom = Array.from(pm.children).filter(x => GEOMS.has(x.localName));
    if (!geom.length) return false;
    let hasPoint = false;
    for (const g of geom) {
      if (NONPOINT.has(g.localName)) return false;
      if (g.localName === 'Point') hasPoint = true;
      for (const n of descendants(g, () => true)) {
        if (NONPOINT.has(n.localName)) return false;
        if (n.localName === 'Point') hasPoint = true;
      }
    }
    return hasPoint;
  }
  function tintColor(abgr) {
    if (!abgr || !/^[0-9a-f]{8}$/i.test(abgr.replace(/^#/,''))) return null;
    const v = abgr.replace(/^#/,'').toLowerCase();
    const r = parseInt(v.slice(6,8),16)/255, g = parseInt(v.slice(4,6),16)/255, b = parseInt(v.slice(2,4),16)/255;
    if (r === 1 && g === 1 && b === 1) return null;
    const hi = Math.max(r,g,b), lo = Math.min(r,g,b), delta = hi-lo;
    if (hi === 0 || delta/hi < .16) return hi > .70 ? 'white' : 'black';
    let h = 0;
    if (hi === r) h = ((g-b)/delta + 6)%6;
    else if (hi === g) h = (b-r)/delta + 2;
    else h = (r-g)/delta + 4;
    h /= 6;
    if (h < .045 || h >= .955) return 'red';
    if (h < .115) return 'orange';
    if (h < .19) return 'yellow';
    if (h < .455) return 'green';
    if (h < .535) return 'lightblue';
    if (h < .725) return 'blue';
    if (h < .82) return 'purple';
    return 'pink';
  }
  function hrefColor(href) {
    let path = href.replace(/\\/g,'/').split('?')[0].split('#')[0];
    try { path = decodeURIComponent(path); } catch (_) {}
    const found = path.match(COLOR_RE);
    if (found) return COLOR_MAP[found[1].toLowerCase()] || null;
    const file = path.split('/').pop();
    if (path.toLowerCase().includes('/paddle/') && /^(?:[a-z]|[0-9]|10)\.png$/i.test(file)) return 'red';
    return null;
  }
  function iconType(href) {
    const h = (href || '').toLowerCase();
    if (!h) return 'Default';
    if (h.includes('pushpin')) return 'Pushpin';
    if (h.includes('/paddle/') || /(?:blank|circle|square|stars?|diamond)(?:\.png|\?|$)/.test(h)) return 'Paddle';
    if (h.includes('shapes/') || h.includes('pal4/') || h.includes('pal3/') || h.includes('pal2/')) return 'Symbol';
    return 'Custom';
  }
  function classify(pm, defs) {
    if (!pointOnly(pm)) return {skip:'non-point geometry'};
    const name = get(pm,'name');
    if (!name) return {skip:'no name'};
    const shared = resolveStyle(get(pm,'styleUrl'),defs);
    const props = Object.assign({},shared.props,propsFromStyle(child(pm,'Style')));
    if ('scale' in props && Number.isFinite(parseFloat(props.scale)) && parseFloat(props.scale) <= 0) return {skip:'already hidden'};
    if (Object.prototype.hasOwnProperty.call(props,'href') && !props.href) return {skip:'already hidden'};
    const href = props.href;
    let color, why = '';
    if (props.colorMode && props.colorMode.toLowerCase() === 'random') { color = 'other'; why = 'Random color mode'; }
    else if (typeof href === 'undefined') { color = shared.resolved ? 'yellow' : 'other'; why = shared.resolved ? 'Default Google Earth pin' : 'Unresolved external style'; }
    else {
      const base = hrefColor(href), tinted = tintColor(props.color);
      if (tinted && base && base !== 'white' && tinted !== base) {color = 'other'; why = 'Mixed icon color/tint';}
      else {color = tinted || base || 'other'; why = href;}
    }
    return {name, color, type:iconType(href), href:href || '', why};
  }
  function hideMarker(pm) {
    // Inline Style applies ONLY to this Placemark, even when others share a Style/StyleMap.
    let style = child(pm,'Style');
    if (!style) {
      style = makeElem(pm,'Style');
      const before = Array.from(pm.children).find(x => GEOMS.has(x.localName) || x.localName === 'ExtendedData' || x.localName === 'Region');
      if (before) pm.insertBefore(style,before); else pm.appendChild(style);
    }
    textSet(ensure(ensure(style,'IconStyle'),'scale'),'0');
    textSet(ensure(ensure(style,'LabelStyle'),'scale'),'1');
  }
  function getPlacemarks(doc) {return Array.from(doc.getElementsByTagName('*')).filter(x => x.localName === 'Placemark');}
  function niceSize(n) {return n < 1024 ? n+' B' : n < 1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(1)+' MB';}
  function escapeHtml(str) {return String(str).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
  function showStatus(msg,kind='') { $('status').textContent=msg; $('status').className='status '+kind; }
  function showSave(msg,kind='') { $('saveStatus').textContent=msg; $('saveStatus').className='status '+kind; }
  function filenameParts(name) {const i=name.lastIndexOf('.'); return i>0 ? {stem:name.slice(0,i),ext:name.slice(i).toLowerCase()} : {stem:name,ext:''};}
  function safeFileStem(raw) {return raw.trim().replace(/[\\/<>:"|?*\x00-\x1F]/g,'_').replace(/[.\s]+$/,'').slice(0,180);}

  async function importFile(file) {
    const {ext,stem} = filenameParts(file.name);
    if (!['.kmz','.kml'].includes(ext)) throw Error('Choose a .kmz or .kml file.');
    if (file.size > 300 * 1024 * 1024) throw Error('File is over 300 MB. Try a smaller KMZ, or split the map into folders.');
    showStatus('Reading and analyzing '+file.name+'…');
    await new Promise(resolve => setTimeout(resolve,25));
    const kmls = [];
    let zip = null;
    if (ext === '.kmz') {
      if (typeof JSZip === 'undefined') throw Error('Missing JSZip library. Keep the entire downloaded folder together.');
      zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter(z=>!z.dir && z.name.toLowerCase().endsWith('.kml'));
      if (!entries.length) throw Error('This KMZ does not contain any KML map data.');
      for (const e of entries) kmls.push({entry:e.name,xml:await e.async('string')});
    } else kmls.push({entry:file.name,xml:await file.text()});
    const points = [];
    const report = {total:0,ignored:0,alreadyHidden:0,nameless:0,files:kmls.length};
    kmls.forEach((kml,kmlIndex)=>{
      const doc = parseKML(kml.xml,kml.entry);
      const defs = styleDefinitions(doc);
      getPlacemarks(doc).forEach((pm,pmIndex)=>{
        report.total++;
        const info=classify(pm,defs);
        if (info.skip) {
          if (info.skip === 'already hidden') report.alreadyHidden++;
          else if(info.skip === 'no name') report.nameless++;
          else report.ignored++;
        } else points.push({...info, id:kmlIndex+':'+pmIndex, kmlIndex, pmIndex, entry:kml.entry});
      });
    });
    return {file,zip,ext,stem,kmls,points,report};
  }
  function displayData() {
    selected = new Set(); page=0;
    $('workspace').hidden=false;
    $('loadedFilename').textContent=state.file.name;
    $('loadedMeta').textContent=niceSize(state.file.size)+' · '+state.kmls.length+' KML document(s) · Local file';
    $('totalCount').textContent=state.report.total.toLocaleString();
    $('pointCount').textContent=state.points.length.toLocaleString();
    $('outputName').value=state.stem+'_CLEANED';
    $('outputExtension').textContent=state.ext;
    $('stepTwo').classList.add('active'); $('stepThree').classList.add('active');
    $('searchBox').value='';
    renderColors();renderList();updateSelected();
    showStatus('Scanned '+state.report.total+' placemarks. Found '+state.points.length+' named point icons. Polygon and line boundaries are never changed.','success');
    showSave('');
    $('workspace').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderColors() {
    const box=$('colorList'); box.textContent='';
    for(const [key,label,swatch] of COLORS) {
      const entries=state.points.filter(p=>p.color===key);
      if(!entries.length) continue;
      const checked=entries.filter(p=>selected.has(p.id)).length;
      const row=document.createElement('label'); row.className='color-choice';
      row.innerHTML='<input type="checkbox" data-group="'+key+'"><span class="swatch" style="background:'+swatch+'"></span><span class="label">'+escapeHtml(label)+'</span><span class="count">'+checked+' / '+entries.length+'</span>';
      const ck=row.querySelector('input'); ck.checked=checked===entries.length; ck.indeterminate=checked>0&&checked<entries.length;
      ck.addEventListener('change',()=>{for(const p of entries) {if(ck.checked) selected.add(p.id); else selected.delete(p.id);} renderColors();renderList();updateSelected();});
      box.appendChild(row);
    }
    if(!box.childElementCount) box.textContent='No visible named point icons detected.';
  }
  function filtered() {
    const s=$('searchBox').value.trim().toLocaleLowerCase();
    return !s ? state.points : state.points.filter(p=>[p.name,p.color,p.type,p.href,p.entry].some(v=>(v||'').toLocaleLowerCase().includes(s)));
  }
  function renderList() {
    const items=filtered();
    page=Math.min(page,Math.max(0,Math.ceil(items.length/PAGE_SIZE)-1));
    const start=page*PAGE_SIZE;
    const view=items.slice(start,start+PAGE_SIZE);
    const box=$('placeList');box.textContent='';
    if(!view.length){box.innerHTML='<div class="empty-list">No matching named placemarks.</div>';}
    const frag=document.createDocumentFragment();
    const icons={yellow:'📌',blue:'📍',red:'📍',pink:'📍',green:'📍',lightblue:'📍',purple:'📍',white:'📍',orange:'📍',black:'📍',other:'◆'};
    for(const p of view) {
      const row=document.createElement('label');row.className='place-row';
      const colorHex=(COLORS.find(x=>x[0]===p.color)||COLORS[10])[2];
      row.innerHTML='<input type="checkbox" data-point="'+p.id+'" '+(selected.has(p.id)?'checked':'')+'><span class="placename"><span class="symbol" style="color:'+colorHex+'">'+icons[p.color]+'</span><span style="min-width:0"><strong title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</strong><small title="'+escapeHtml(p.href || p.why)+'">'+escapeHtml(p.entry)+'</small></span></span><span class="type"><strong>'+escapeHtml(COLOR_NAMES[p.color])+'</strong>'+escapeHtml(p.type)+'</span>';
      row.querySelector('input').addEventListener('change',e=>{if(e.target.checked)selected.add(p.id); else selected.delete(p.id); renderColors();updateSelected();});
      frag.appendChild(row);
    }
    box.appendChild(frag);
    $('pageInfo').textContent=items.length?`${start+1}–${Math.min(start+PAGE_SIZE,items.length)} of ${items.length.toLocaleString()}`:'0 placemarks';
    $('prevPage').disabled=page<=0; $('nextPage').disabled=(start+PAGE_SIZE)>=items.length;
  }
  function updateSelected() {
    $('selectedCount').textContent=selected.size.toLocaleString();
    $('saveAsBtn').disabled=selected.size===0;
    $('downloadBtn').disabled=selected.size===0;
  }
  function selectGroup(set) { selected=set;renderColors();renderList();updateSelected(); }
  function updateFiltered(add) {for(const p of filtered()) {if(add) selected.add(p.id); else selected.delete(p.id);}renderColors();renderList();updateSelected();}
  function buildFilename() {
    const raw=safeFileStem($('outputName').value);
    if(!raw) throw Error('Enter an output filename before saving.');
    // The extension is controlled to avoid accidental .kml/.kmz mismatches.
    return (raw.toLowerCase().endsWith(state.ext) ? raw.slice(0,-state.ext.length) : raw)+state.ext;
  }
  async function buildOutput() {
    if(!state || !selected.size) throw Error('Select at least one placemark icon to hide.');
    const fileName=buildFilename();
    showSave('Preparing cleaned file. Original names, coordinates, shapes and other assets are preserved…');
    await new Promise(resolve=>setTimeout(resolve,30));
    const serial = new XMLSerializer();
    const updates = [];
    let changed=0;
    for(let ki=0;ki<state.kmls.length;ki++) {
      const kml=state.kmls[ki];
      const pmList=state.points.filter(p=>p.kmlIndex===ki && selected.has(p.id));
      if(!pmList.length) continue;
      const parsed=parseKML(kml.xml,kml.entry);
      const placemarks=getPlacemarks(parsed);
      for(const p of pmList) {hideMarker(placemarks[p.pmIndex]);changed++;}
      updates.push({entry:kml.entry,xml:serial.serializeToString(parsed)});
    }
    let blob;
    if(state.ext==='.kml') blob=new Blob([updates[0].xml],{type:'application/vnd.google-earth.kml+xml;charset=utf-8'});
    else {
      // Preserve original KMZ entries and attachment names. Only changed KML entries are rewritten.
      const zip=await JSZip.loadAsync(await state.file.arrayBuffer());
      for(const update of updates) zip.file(update.entry,update.xml);
      blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},meta=>{if(meta.percent>=0 && meta.percent<100)showSave('Building KMZ… '+Math.round(meta.percent)+'%');});
    }
    return {blob,fileName,changed};
  }
  function download(blob,name) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function saveOutput(usePicker) {
    const a=$('saveAsBtn'), b=$('downloadBtn');
    if(a.disabled||b.disabled)return;
    a.disabled=true;b.disabled=true;
    try {
      const {blob,fileName,changed}=await buildOutput();
      if(usePicker&&typeof window.showSaveFilePicker==='function') {
        const isKmz=state.ext==='.kmz';
        try {
          const handle=await window.showSaveFilePicker({suggestedName:fileName,types:[{description:isKmz?'Google Earth KMZ file':'Google Earth KML file',accept:{[isKmz?'application/vnd.google-earth.kmz':'application/vnd.google-earth.kml+xml']:[state.ext]}}]});
          const stream=await handle.createWritable();await stream.write(blob);await stream.close();
          showSave('Saved '+changed+' cleaned placemarks to '+handle.name+'. Names and boundaries remain.','success');
        } catch (e) {if(e.name==='AbortError'){showSave('Save cancelled. No changes were made to the original file.');}else throw e;}
      } else {
        download(blob,fileName);
        showSave('Created '+fileName+' with '+changed+' hidden icons. Your browser will handle the download folder.','success');
      }
    } catch(e) {showSave('Could not save: '+(e.message||String(e)),'error');}
    finally {updateSelected();}
  }
  async function chooseFile(file) {
    if(!file)return;
    $('workspace').hidden=true;state=null;
    try { state=await importFile(file);displayData(); }
    catch(e){showStatus('Could not open file: '+(e.message||String(e)),'error');}
  }
  function wire() {
    const drop=$('dropArea');
    const input=$('fileInput');
    const browse=()=>input.click();
    drop.addEventListener('click',browse);
    drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();browse();}});
    input.addEventListener('change',()=>{chooseFile(input.files?.[0]); input.value='';});
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');chooseFile(e.dataTransfer?.files?.[0]);});
    $('changeFile').addEventListener('click',browse);
    $('selectAll').addEventListener('click',()=>selectGroup(new Set(state.points.map(p=>p.id))));
    $('selectNone').addEventListener('click',()=>selectGroup(new Set()));
    $('searchBox').addEventListener('input',()=>{page=0;renderList();});
    $('selectFiltered').addEventListener('click',()=>updateFiltered(true));
    $('clearFiltered').addEventListener('click',()=>updateFiltered(false));
    $('prevPage').addEventListener('click',()=>{if(page>0){page--;renderList();}});
    $('nextPage').addEventListener('click',()=>{page++;renderList();});
    $('saveAsBtn').addEventListener('click',()=>saveOutput(true));
    $('downloadBtn').addEventListener('click',()=>saveOutput(false));
    if (typeof JSZip==='undefined') showStatus('JSZip library missing. Keep the entire assets folder with index.html.','error');
  }
  // Testing hooks expose pure methods. No data leaves browser; no network requests.
  window.WebnixKML = {parseKML,styleDefinitions,classify,hideMarker,getPlacemarks,hrefColor,tintColor,pointOnly};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();

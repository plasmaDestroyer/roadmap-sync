let DATA, DAYS=null, GRAV=null;
const STORAGE_KEY='dsasprint2026_checks';
const load=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}}catch{return{}}};
const save=c=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify(c));
  fetch('/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
    }).catch(err=>console.warn('sync failed', err));
};
/* bookmarks — orthogonal to checks (revisit flag, not "done"); same client shape */
const BMARK_KEY='dsasprint2026_bookmarks';
const loadBookmarks=()=>{try{return JSON.parse(localStorage.getItem(BMARK_KEY))||{}}catch{return{}}};
const SECT_KEY='dsasprint2026_sections';
const loadSect=()=>{try{return JSON.parse(localStorage.getItem(SECT_KEY))||{}}catch{return{}}};
const istDate=()=>new Date(Date.now()+5.5*36e5).toISOString().slice(0,10);   // YYYY-MM-DD in IST
const saveBookmarks=b=>{
  localStorage.setItem(BMARK_KEY,JSON.stringify(b));
  fetch('/bookmarks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).catch(err=>console.warn('bookmark sync failed',err));
};
const STAR='<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.86L14.02 10.08L20.56 10.08L15.27 13.92L17.29 20.14L12 16.3L6.71 20.14L8.73 13.92L3.44 10.08L9.98 10.08Z"/></svg>';
const BMARK=`<span class="bmark" title="bookmark / revisit">${STAR}</span>`;
/* revision — Cold/Warm/Solid rotation; own store, synced like bookmarks. shape {id:{s:stage,n:note}} */
const REV_KEY='dsasprint2026_revision';
const loadRev=()=>{try{return JSON.parse(localStorage.getItem(REV_KEY))||{}}catch{return{}}};
function saveRev(r){localStorage.setItem(REV_KEY,JSON.stringify(r));fetch('/revision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)}).catch(err=>console.warn('revision sync failed',err));}
const REVADD='<span class="revtog" title="add to revision"><svg class="ri i-add" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg><svg class="ri i-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
function paint(){
  const c=load(),b=loadBookmarks(),rv=loadRev();
  document.querySelectorAll('.row').forEach(r=>{if(c[r.dataset.id])r.classList.add('ck');if(b[r.dataset.id])r.classList.add('bm');if(rv[r.dataset.id])r.classList.add('rev');});
  refresh();
}
async function syncFromServer(){
  try{
  const [pr,bm,rv]=await Promise.all([fetch('/progress'),fetch('/bookmarks'),fetch('/revision')]);   // one round-trip, one repaint
  if(pr.ok) save({...load(),...await pr.json()});
  if(bm.ok) saveBookmarks({...loadBookmarks(),...await bm.json()});
  if(rv.ok){ const srv=await rv.json(); if(srv&&typeof srv==='object') localStorage.setItem(REV_KEY,JSON.stringify({...loadRev(),...srv})); }
  paint();
  if(document.getElementById('view-revision').classList.contains('on')) renderRevBoard();
  }catch{}
}
async function boot(){
  try{
    const [res,layout,days,grav]=await Promise.all([fetch('/data.json'),loadLayout(),loadDays(),loadGrav()]);
    if(!res.ok) throw new Error('data.json: '+res.status);
    DATA=await res.json();
    LAYOUT=layout; applyLayout();
    buildChapters();
    DAYS=days; if(DAYS){ applyDayLayout(); buildDays(); }   // additive: the roadmap still boots if days.json is missing
    GRAV=grav; if(GRAV) buildGrav();
    buildHeroRing();
    paint();
    if(document.getElementById('view-revision').classList.contains('on')) renderRevBoard();
    syncFromServer();
  }catch(e){
    console.error('boot failed:',e);
    chWrap.innerHTML=`
      <div style="max-width:520px;margin:64px auto;padding:32px 28px;text-align:center;
                  background:var(--card);border:1px solid var(--hair2);border-radius:14px">
        <div style="font-family:var(--serif);font-size:22px;color:var(--verm);margin-bottom:10px">
          Couldn't load the roadmap
        </div>
        <div style="font-family:var(--mono);font-size:13px;line-height:1.7;color:var(--faint)">
          The server didn't return the roadmap data.<br>
          Check that it's running, then reload the page.
        </div>
      </div>`;
  }
}

const tierOf=p=>p.tier==='done'?'core':p.tier;
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/* ── reorder edit mode: layout overlay + persistence ── */
let LAYOUT={};
const TIERS=['core','stretch','bonus'];
const HANDLE='<span class="drag-handle" aria-hidden="true"><span class="dotgrid"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>';
const SPARK='<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2Q12 12 22 12Q12 12 12 22Q12 12 2 12Q12 12 12 2Z"/></svg>';
// link destinations: [colour var, kind] — j=judge (tinted ↗), a=article (lined "read" glyph)
const DEST={LC:['--lc','j'],GFG:['--gfg','j'],NC:['--ncs','j'],TUF:['--tuf','a'],WEB:['--web','a'],CF:['--lld','j']};
const READ='<svg class="readi" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
// judge arrow as an SVG (geometrically centred ~12,12) — the ↗ glyph sits off-centre in the box
const ARR='<svg class="arrg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M9 5h10v10" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrowFor=(t,u)=>{const d=DEST[t]||['--faint','j'];return `<a class="arr" style="color:var(${d[0]})" href="${u}" target="_blank" rel="noopener" title="${t}"><span class="g">${d[1]==='j'?ARR:READ}</span></a>`;};
async function loadLayout(){ try{const r=await fetch('/layout');if(r.ok)return await r.json();}catch{} return {}; }
function saveLayout(){ fetch('/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(LAYOUT)}).catch(err=>console.warn('layout sync failed',err)); }
/* reorder + retier each saved topic in DATA; problems missing from a saved order keep their place at the end */
function applyLayout(){
  DATA.sprints.forEach(sp=>sp.topics.forEach(t=>{
    const saved=LAYOUT[sp.id+'-'+slug(t[0])]; if(!saved||!saved.length)return;
    const byId=new Map(t[1].map(p=>[p.id,p])), ordered=[];
    saved.forEach(({id,tier})=>{const p=byId.get(id);if(p){if(tier)p.tier=tier;ordered.push(p);byId.delete(id);}});
    t[1].forEach(p=>{if(byId.has(p.id))ordered.push(p);});
    t[1]=ordered;
  }));
}

/* build chapters + topic index */
const chWrap=document.getElementById('chapters'), idx=document.getElementById('idx');
const ROMAN=['I','II','III','IV','V','VI','VII','✦'];
function buildChapters(){
DATA.sprints.forEach((sp,si)=>{
  const d=document.createElement('details');
  d.className='chapter'; d.id='sec-'+sp.id;
  const op=loadSect(); d.open = sp.id in op ? op[sp.id] : sp.load!=='bonus';
  d.addEventListener('toggle',()=>{const o=loadSect();o[sp.id]=d.open;localStorage.setItem(SECT_KEY,JSON.stringify(o));});
  d.style.animationDelay=(0.28+si*0.05)+'s';
  let body='';
  sp.topics.forEach(([tname,probs])=>{
    const tid=sp.id+'-'+slug(tname);
    body+=`<div class="tp" id="tp-${tid}"><span class="tp-name">${esc(tname)}</span><span class="tp-line"></span><span class="tp-mini" data-tpmini="${tid}">0/0</span></div>`;
    [['core','Core',null],['stretch','Stretch','— if ahead'],['bonus',null,null]].forEach(([tier,label,note])=>{
      const items=probs.filter(p=>tierOf(p)===tier);
      if(!items.length)return;
      if(label) body+=`<div class="tierlab ${tier}">${label}${note?`<span class="tl-note">${note}</span>`:''}</div>`;
      items.forEach(p=>{
        const badges=p.srcs.map(s=>`<span class="bdg b-${s}">${s}</span>`);
        if(p.lc) badges.push(`<span class="bdg b-LCnum">LC ${p.lc}</span>`);
        else { const h=p.links[0]&&p.links[0][0]; if(h&&!p.srcs.includes(h)) badges.push(`<span class="bdg b-${h}">${h}</span>`); }
        if(p.fire)badges.push('<span class="bdg b-fire">🔥</span>');
        if(p.lock)badges.push('<span class="bdg b-lock">🔒</span>');
        const links=p.links.map(([t,u])=>arrowFor(t,u)).join('');
        body+=`<div class="row ${tier}" data-id="${p.id}" data-tier="${tier}" data-tp="${tid}" data-q="${esc((p.title+' '+tname).toLowerCase())}">
          <div class="rmain">${HANDLE}<div class="cir"></div>
          <div class="pmain"><span class="pname">${esc(p.title)}</span><span class="pbadges">${badges.join('')}</span>${p.note?`<span class="hint-mark">${SPARK}</span>`:''}${BMARK}${REVADD}${p.note?`<div class="hint-note">${esc(p.note)}</div>`:''}</div></div>
          <div class="plinks">${links}</div></div>`;
      });
    });
    /* topic index card */
    idx.insertAdjacentHTML('beforeend',
     `<a class="tcard" href="#tp-${tid}">
        <span class="tring" data-tring="${tid}"><svg width="42" height="42" viewBox="0 0 42 42">
          <circle class="tr-track" cx="21" cy="21" r="17"/>
          <circle class="tr-arc" data-trarc="${tid}" cx="21" cy="21" r="17" stroke-dasharray="106.8" stroke-dashoffset="106.8"/>
        </svg><span class="tr-pct" data-trpct="${tid}">0%</span></span>
        <span><span class="tc-name">${esc(tname)}</span><br><span class="tc-count" data-trcount="${tid}">0 / 0</span></span>
      </a>`);
  });
  d.innerHTML=`<summary class="ch-head">
    <span class="ch-num">${ROMAN[si]||si+1}</span>
    <div class="ch-mid">
      <div class="ch-title">${esc(sp.title)}</div>
      <div class="ch-sub"><span>${sp.week} · ${sp.dates}</span>${si===0?'<span class="now">● active</span>':''}<span class="load-${sp.load}">${sp.load==='bonus'?'optional':sp.load+' load'}</span></div>
    </div>
    <span class="ch-ring"><svg width="54" height="54" viewBox="0 0 54 54">
      <circle class="chr-track" cx="27" cy="27" r="22"/>
      <circle class="chr-arc" id="chr-${sp.id}" cx="27" cy="27" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
    </svg><span class="chr-txt" id="chrtxt-${sp.id}">0%</span></span>
    <span class="ch-chev">▾</span>
  </summary><div class="ch-body">${body}</div>`;
  chWrap.appendChild(d);
});
}

/* toggling */
function toggle(id){
  const c=load(); const was=!!c[id];
  if(was)delete c[id]; else c[id]=true; save(c);
  document.querySelectorAll(`.row[data-id="${id}"]`).forEach(r=>r.classList.toggle('ck',!was));
  refresh();
}
function toggleBookmark(id){
  const b=loadBookmarks(); const was=!!b[id];
  if(was)delete b[id]; else b[id]=true; saveBookmarks(b);
  document.querySelectorAll(`.row[data-id="${id}"]`).forEach(r=>r.classList.toggle('bm',!was));
  applyFilters();
}
function rowClick(e){
  const r=e.target.closest('.row');
  if(!r||e.target.closest('a')||e.target.closest('.drag-handle'))return;
  const bm=e.target.closest('.bmark');
  if(bm){ const saving=!r.classList.contains('bm'); toggleBookmark(r.dataset.id);
    if(saving) for(let i=0;i<8;i++){const t=document.createElement('span');t.className='btick';t.style.setProperty('--a',(i*45)+'deg');bm.appendChild(t);t.addEventListener('animationend',()=>t.remove());}
    bm.classList.remove('pop'); void bm.offsetWidth; bm.classList.add('pop'); return; }
  const rt=e.target.closest('.revtog');
  if(rt){ const adding=!r.classList.contains('rev'); toggleRev(r.dataset.id);
    if(adding){ const h=document.createElement('span'); h.className='rhalo'; rt.appendChild(h);
      h.addEventListener('animationend',()=>h.remove()); setTimeout(()=>h.remove(),900);   // belt+braces: never strand a halo
      bumpRevTab(); }
    return; }
  const m=e.target.closest('.hint-mark');
  if(m){ m.classList.toggle('on'); r.querySelector('.hint-note').classList.toggle('on'); return; }
  toggle(r.dataset.id);
}
chWrap.addEventListener('click',rowClick);
/* link-arrow press: drop the tile + spawn a halo per click (rapid clicks overlap); css in .arr */
function arrPress(e){
  const a=e.target.closest('.arr'); if(!a) return;
  const h=document.createElement('span'); h.className='fhalo';
  a.appendChild(h); h.addEventListener('animationend',()=>h.remove());
  a.classList.remove('go'); void a.offsetWidth; a.classList.add('go');
  clearTimeout(a._t); a._t=setTimeout(()=>a.classList.remove('go'),560);
}
chWrap.addEventListener('pointerdown',arrPress);

/* ── drag-to-reorder (native DnD + FLIP), scoped within a topic ── */
let dragged=null, lastAfter;
function rowAfter(tp,y){
  let closest=null, co=-Infinity;
  for(const row of chWrap.querySelectorAll(`.row[data-tp="${tp}"]:not(.dragging):not(.hidden)`)){
    const b=row.getBoundingClientRect(), off=y-b.top-b.height/2;
    if(off<0 && off>co){ co=off; closest=row; }
  }
  return closest;
}
function flip(reorder){
  const tp=dragged.dataset.tp, rows=[...chWrap.querySelectorAll(`.row[data-tp="${tp}"]`)];
  const tops=rows.map(r=>r.getBoundingClientRect().top);
  reorder();
  rows.forEach((r,i)=>{ if(r===dragged)return; const dy=tops[i]-r.getBoundingClientRect().top;
    if(dy) r.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}); });
}
function reclassRow(r){
  let n=r.previousElementSibling, found=null;
  while(n){ if(n.classList.contains('tierlab')){ found=TIERS.find(t=>n.classList.contains(t)); break; } n=n.previousElementSibling; }
  const tier=found||r.dataset.tier||'core';
  TIERS.forEach(t=>r.classList.toggle(t, t===tier)); r.dataset.tier=tier;
}
chWrap.addEventListener('mousedown',e=>{
  const h=e.target.closest('.drag-handle'); if(h) h.closest('.row').setAttribute('draggable','true');
});
chWrap.addEventListener('mouseup',e=>{
  if(dragged)return; const r=e.target.closest('.row[draggable="true"]'); if(r) r.removeAttribute('draggable');
});
chWrap.addEventListener('dragstart',e=>{
  const r=e.target.closest('.row'); if(!r)return;
  dragged=r; lastAfter=undefined; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','');
  requestAnimationFrame(()=>r.classList.add('dragging'));   // defer so the drag-image stays solid
});
chWrap.addEventListener('dragover',e=>{
  if(!dragged)return; e.preventDefault();
  const tp=dragged.dataset.tp, after=rowAfter(tp,e.clientY);
  if(after===lastAfter)return; lastAfter=after;
  flip(()=>{
    if(after) after.parentNode.insertBefore(dragged,after);
    else { const rows=chWrap.querySelectorAll(`.row[data-tp="${tp}"]:not(.dragging):not(.hidden)`); if(rows.length) rows[rows.length-1].after(dragged); }
  });
  reclassRow(dragged);
});
chWrap.addEventListener('dragend',()=>{
  if(!dragged)return; const r=dragged;
  r.classList.remove('dragging'); r.removeAttribute('draggable'); reclassRow(r);
  r.animate([{transform:'scale(1.012)'},{transform:'none'}],{duration:200,easing:'ease-out'});   // settle
  persistTopic(r.dataset.tp); dragged=null; lastAfter=undefined;
});
function topicTierMap(tp){
  const m=new Map();
  for(const sp of DATA.sprints) for(const t of sp.topics) if(sp.id+'-'+slug(t[0])===tp) t[1].forEach(p=>m.set(p.id,tierOf(p)));
  return m;
}
function syncDataTopic(tp,order){
  for(const sp of DATA.sprints) for(const t of sp.topics){
    if(sp.id+'-'+slug(t[0])!==tp) continue;
    const byId=new Map(t[1].map(p=>[p.id,p])), arr=[];
    order.forEach(({id,tier})=>{const p=byId.get(id);if(p){p.tier=tier;arr.push(p);byId.delete(id);}});
    t[1].forEach(p=>{if(byId.has(p.id))arr.push(p);}); t[1]=arr; return;
  }
}
function persistTopic(tp){
  const order=[...chWrap.querySelectorAll(`.row[data-tp="${tp}"]`)].map(r=>({id:r.dataset.id,tier:r.dataset.tier}));
  const prev=topicTierMap(tp), tierChanged=order.some(o=>prev.get(o.id)!==o.tier);
  LAYOUT[tp]=order; syncDataTopic(tp,order); saveLayout();
  if(tierChanged) buildHeroRing();
  refresh();
}

/* segmented hero ring — one circle, three proportional arcs */
const RING={R:74,CX:86,CY:86,GAP:10,COLORS:['var(--verm)','var(--amber)','var(--web)']};
let ringFills=[];
function buildRing(totals){
  const C=2*Math.PI*RING.R, T=totals.reduce((a,b)=>a+b,0), g=document.getElementById('ringSegs');
  g.replaceChildren();
  let angle=0; ringFills=[];
  totals.forEach((n,i)=>{
    const segDeg=360*n/T, arcLen=C*(segDeg-RING.GAP)/360;
    const mk=cls=>{
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx',RING.CX);c.setAttribute('cy',RING.CY);c.setAttribute('r',RING.R);
      c.setAttribute('class','ringseg '+cls);c.setAttribute('stroke',RING.COLORS[i]);
      c.setAttribute('transform',`rotate(${angle-90} ${RING.CX} ${RING.CY})`);
      g.appendChild(c);return c;};
    const tr=mk('track'); tr.setAttribute('stroke-dasharray',`${arcLen} ${C-arcLen}`);
    const fl=mk('fill');  fl.setAttribute('stroke-dasharray',`0 ${C}`); fl.style.display='none';
    ringFills.push({el:fl,arcLen,C});
    angle+=segDeg;
  });
}
function updateRing(pairs){
  pairs.forEach(([d,t],i)=>{
    const f=ringFills[i]; if(!f)return;
    const p=t?d/t:0, len=f.arcLen*p;
    if(p<=0){f.el.style.display='none';return;}
    f.el.style.display='';
    f.el.setAttribute('stroke-dasharray',`${len} ${f.C-len}`);
  });
}
function buildHeroRing(){
  let ct=0,st=0,bt=0;
  DATA.sprints.forEach(sp=>sp.topics.forEach(([_,probs])=>probs.forEach(p=>{
    const t=tierOf(p); if(t==='core')ct++; else if(t==='stretch')st++; else bt++;
  })));
  buildRing([ct,st,bt]);
}

/* progress */
function refresh(){
  const c=load(); let cd=0,ct=0,sd=0,st=0,bd=0,bt=0; let next=null;
  const tp={};
  DATA.sprints.forEach(sp=>{
    let d=0,t=0;
    sp.topics.forEach(([tname,probs])=>{
      const tid=sp.id+'-'+slug(tname);
      tp[tid]=tp[tid]||{d:0,t:0,cd:0,ctt:0};
      probs.forEach(p=>{
        const tier=tierOf(p),done=!!c[p.id]; t++; tp[tid].t++;
        if(done){d++;tp[tid].d++;}
        if(tier==='core'){tp[tid].ctt++;if(done)tp[tid].cd++;}
        if(tier==='core'){ct++;if(done)cd++;else if(!next)next=p.title;}
        else if(tier==='stretch'){st++;if(done)sd++;}
        else{bt++;if(done)bd++;}
      });
    });
    const arc=document.getElementById('chr-'+sp.id),txt=document.getElementById('chrtxt-'+sp.id);
    if(arc){arc.style.strokeDashoffset=138.2*(1-(t?d/t:0));}
    if(txt){txt.textContent=Math.round(t?100*d/t:0)+'%';}
  });
  for(const [tid,o] of Object.entries(tp)){
    const {d,t,cd:tcd,ctt}=o;
    /* state color: amber → <20% · vermillion → >20% · green → core clear · purple → everything clear */
    let col='var(--amber)';
    if(t>0&&d===t)col='var(--web)';
    else if(ctt>0&&tcd===ctt)col='var(--green)';
    else if(t>0&&d/t>0.2)col='var(--verm)';
    const arc=document.querySelector(`[data-trarc="${tid}"]`);
    if(arc){arc.style.strokeDashoffset=106.8*(1-(t?d/t:0));arc.style.stroke=col;}
    const pct=document.querySelector(`[data-trpct="${tid}"]`); if(pct)pct.textContent=Math.round(t?100*d/t:0)+'%';
    const cnt=document.querySelector(`[data-trcount="${tid}"]`); if(cnt)cnt.textContent=d+' / '+t;
    const mini=document.querySelector(`[data-tpmini="${tid}"]`); if(mini)mini.textContent=d+'/'+t;
  }
  document.getElementById('brNum').textContent=cd+sd+bd;
  document.getElementById('brDen').textContent='of '+(ct+st+bt)+' solved';
  updateRing([[cd,ct],[sd,st],[bd,bt]]);
  document.getElementById('mCore').textContent=cd+' / '+ct;
  document.getElementById('fCore').style.width=(ct?100*cd/ct:0)+'%';
  document.getElementById('mStr').textContent=sd+' / '+st;
  document.getElementById('fStr').style.width=(st?100*sd/st:0)+'%';
  document.getElementById('mBon').textContent=bd+' / '+bt;
  document.getElementById('fBon').style.width=(bt?100*bd/bt:0)+'%';
  document.getElementById('nextUp').textContent=next||'all Core clear ✦';
  const total=ct+st+bt;                                    // drive the hardcoded counts off real data
  document.getElementById('dekCount').textContent=total+' problems';
  document.getElementById('tabCount').textContent=total;
  const rvc=document.getElementById('revCount'); if(rvc) rvc.textContent=Object.keys(loadRev()).length;
  refreshDays();
  refreshGrav();
  let pct=0,pcd=0;                                        // pace excludes the post-OA prep track
  DATA.sprints.forEach(sp=>{ if(sp.id==='prep')return;
    sp.topics.forEach(([_,ps])=>ps.forEach(p=>{ if(tierOf(p)==='core'){pct++; if(c[p.id])pcd++;} })); });
  const dl=Math.ceil((new Date('2026-07-13T00:00:00+05:30')-new Date())/86400000);   // same OA date tick() uses
  document.getElementById('paceChip').innerHTML = dl<=0 ? 'OA window live'
    : `Pace — <b>${((pct-pcd)/Math.max(dl,1)).toFixed(1)}</b> Core/day to OA`;
}
boot();

/* streak — additive, read from the server events log */
fetch('/streak').then(r=>r.ok?r.json():null).then(s=>{
  if(s&&(s.current||s.today)) document.getElementById('streakChip').innerHTML=`Streak — <b>${s.current}</b> ${s.current===1?'day':'days'} · <b>${s.today}</b> today`;
}).catch(()=>{});

/* countdown stamp */
function tick(){
  const d=Math.ceil((new Date('2026-07-13T00:00:00+05:30')-new Date())/86400000);
  document.getElementById('tmStamp').textContent=d>0?`T–${d} DAYS TO OA WINDOW`:'OA WINDOW LIVE';
}
tick();setInterval(tick,60000);

/* dark mode */
const THEME_KEY='dsasprint2026_theme';
const modeBtn=document.getElementById('modeBtn');
function applyTheme(t,anim){
  if(anim){document.documentElement.classList.add('theme-anim');
    setTimeout(()=>document.documentElement.classList.remove('theme-anim'),400);}
  document.documentElement.dataset.theme=t;
  modeBtn.textContent={light:'☀',dark:'☾','dark-hc':'◐'}[t]||'☾';
}
const THEME_CYCLE=['dark','dark-hc','light'];   // default dark; click cycles dark → high-contrast → light
applyTheme(localStorage.getItem(THEME_KEY)||'dark',false);
modeBtn.addEventListener('click',()=>{
  const t=THEME_CYCLE[(THEME_CYCLE.indexOf(document.documentElement.dataset.theme)+1)%THEME_CYCLE.length];
  localStorage.setItem(THEME_KEY,t);applyTheme(t,true);
});

/* filters */
let tier='all',status='all',q='';
function applyFilters(){
  document.querySelectorAll('#view-probs .row').forEach(r=>{   // toolbar belongs to the Problems view only
    const okT=tier==='all'||r.dataset.tier===tier;
    const done=r.classList.contains('ck');
    const okS=status==='all'?true:status==='saved'?r.classList.contains('bm'):status==='done'?done:!done;
    const okQ=!q||r.dataset.q.includes(q);
    r.classList.toggle('hidden',!(okT&&okS&&okQ));
  });
  document.querySelectorAll('.ch-body').forEach(b=>{
    b.querySelectorAll('.tierlab').forEach(tt=>{
      let n=tt.nextElementSibling,any=false;
      while(n&&n.classList.contains('row')){if(!n.classList.contains('hidden'))any=true;n=n.nextElementSibling;}
      tt.classList.toggle('hidden',!any);
    });
    b.querySelectorAll('.tp').forEach(t1=>{
      let n=t1.nextElementSibling,any=false;
      while(n&&!n.classList.contains('tp')){if(n.classList.contains('row')&&!n.classList.contains('hidden'))any=true;n=n.nextElementSibling;}
      t1.classList.toggle('hidden',!any);
    });
  });
}
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();applyFilters();});
document.getElementById('qClear').addEventListener('click',()=>{const i=document.getElementById('q');i.value='';q='';applyFilters();i.focus();});
document.getElementById('tierChips').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  document.querySelectorAll('#tierChips .chip').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');tier=b.dataset.tier;applyFilters();
  if(tier==='bonus')document.getElementById('sec-pb').open=true;
});
document.getElementById('statusChips').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  document.querySelectorAll('#statusChips .chip').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');status=b.dataset.st;applyFilters();
});
let allOpen=true;
document.getElementById('toggleAll').addEventListener('click',e=>{
  allOpen=!allOpen;
  document.querySelectorAll('details.chapter').forEach(d=>d.open=allOpen);
  e.target.innerHTML=allOpen?'<span class="ic">⊟</span> Collapse':'<span class="ic">⊞</span> Expand';
});

/* ── view tabs (Problems / Theory) ── */
const VIEW_KEY='dsasprint2026_view';
function setView(v){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.view===v));
  ['probs','days','theory','graviton','revision'].forEach(k=>document.getElementById('view-'+k).classList.toggle('on',v===k));
  document.querySelector('.toolbar').style.display = v==='probs' ? '' : 'none';
  if(v==='revision') renderRevBoard();
  localStorage.setItem(VIEW_KEY,v);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setView(t.dataset.view)));
{const sv=localStorage.getItem(VIEW_KEY); if(sv&&sv!=='probs'&&document.getElementById('view-'+sv)) setView(sv);}

/* ══ Graviton OA track — three dated days of Codeforces plus an overflow pile. Rows reuse
      the roadmap's markup + handlers, so check / bookmark / +revision behave identically.
      No drag: the days are a fixed prescription, not a plan to reshuffle. ══ */
const gvWrap=document.getElementById('gvChapters');
async function loadGrav(){ try{const r=await fetch('/graviton.json'); if(r.ok)return await r.json();}catch{} return null; }
const cfUrl=cf=>{const m=/^(\d+)([A-Z]\d*)$/.exec(cf);
  return m?`https://codeforces.com/problemset/problem/${m[1]}/${m[2]}`:'https://codeforces.com/problemset';};
/* a problem is a CF id, a LeetCode number, or neither (a past OA, which carries its own id) */
const gvId=p=>p.id||('gv'+(p.cf||'lc'+p.lc));
const gvLink=p=>p.cf?['CF',cfUrl(p.cf)]:p.lc?['LC',`https://leetcode.com/problems/${p.slug}/`]:null;
/* Codeforces' own difficulty ramp, mapped onto the palette */
const gvRatC=r=>r<1200?'--faint':r<1400?'--green':r<1600?'--ncs':r<1900?'--lld':'--web';
/* `backticks` → <code>, applied after escaping — the drill copy is dense with identifiers */
const gvTick=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>');
function gvRow(p){
  const tc=(GRAV.themes||{})[p.th]||'--faint', l=gvLink(p);
  const bdg=[`<span class="bdg" style="color:var(${tc});border-color:var(${tc})">${esc(p.th)}</span>`];
  if(p.r){ const rc=gvRatC(p.r); bdg.push(`<span class="bdg" style="color:var(${rc});border-color:var(${rc})">${p.r}</span>`); }
  if(p.cf) bdg.push(`<span class="bdg b-CF">${esc(p.cf)}</span>`);
  if(p.lc) bdg.push(`<span class="bdg b-LCnum">LC ${p.lc}</span>`);
  if(p.mins) bdg.push(`<span class="bdg b-time">${p.mins} min</span>`);
  const q=[p.t,p.th,p.cf,p.lc?'lc'+p.lc:''].join(' ').toLowerCase();
  return `<div class="row core" data-id="${gvId(p)}" data-q="${esc(q)}">
    <div class="rmain"><div class="cir"></div>
    <div class="pmain"><span class="pname">${esc(p.t)}</span><span class="pbadges">${bdg.join('')}</span>${BMARK}${REVADD}</div></div>
    <div class="plinks">${l?arrowFor(l[0],l[1]):''}</div></div>`;
}
/* a tier label is emitted whenever the tier changes, so a day can group Past OAs apart */
const gvRows=probs=>probs.map((p,i)=>
  (p.tier&&p.tier!==(probs[i-1]||{}).tier?`<div class="tierlab core">${esc(p.tier)}</div>`:'')+gvRow(p)).join('');
/* collapsible: the drills are long, and most of the time you want the problems, not the prose */
function gvAside(a,dayId,open){
  if(!a)return '';
  const blocks=a.blocks.map(b=>{
    let h=`<p class="gva-lead">${gvTick(b.lead)}</p>`;
    if(b.code) h+=`<pre class="gva-code">${esc(b.code)}</pre>`;
    if(b.items&&b.items.length){ const t=b.ord?'ol':'ul';
      h+=`<${t} class="gva-list">${b.items.map(i=>`<li>${gvTick(i)}</li>`).join('')}</${t}>`; }
    return h;
  }).join('');
  return `<details class="gva" data-sect="${dayId}-aside"${open?' open':''}>
    <summary class="gva-h"><span class="gva-kick">Alongside</span>
    <span class="gva-name">${esc(a.name)}</span><span class="gva-min">${a.mins} min</span>
    <span class="gva-chev">▾</span></summary><div class="gva-body">${blocks}</div></details>`;
}
function buildGrav(){
  gvWrap.replaceChildren();
  const op=loadSect();
  GRAV.days.forEach(d=>{
    const over=d.id==='gdx';
    const det=document.createElement('details');
    det.className='chapter'; det.id='sec-'+d.id;
    det.open = d.id in op ? op[d.id] : d.n<=1;            // day one open, the rest folded
    det.addEventListener('toggle',()=>{const o=loadSect();o[d.id]=det.open;localStorage.setItem(SECT_KEY,JSON.stringify(o));});
    det.innerHTML=`<summary class="ch-head">
      <span class="ch-num">${over?'✦':d.n}</span>
      <div class="ch-mid">
        <div class="ch-title">${over?'Overflow':'Day '+d.n}</div>
        <div class="ch-sub"><span>${esc(d.name)}</span><span data-gvcount="${d.id}"></span></div>
      </div>
      <span class="ch-ring"><svg width="54" height="54" viewBox="0 0 54 54">
        <circle class="chr-track" cx="27" cy="27" r="22"/>
        <circle class="chr-arc" data-gvarc="${d.id}" cx="27" cy="27" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
      </svg><span class="chr-txt" data-gvpct="${d.id}">0%</span></span>
      <span class="ch-chev">▾</span></summary>
      <div class="ch-body">${d.note?`<div class="gva-note">${gvTick(d.note)}</div>`:''}${gvRows(d.probs)}${gvAside(d.aside,d.id,op[d.id+'-aside'])}</div>`;
    gvWrap.appendChild(det);
    det.querySelectorAll('details.gva').forEach(g=>g.addEventListener('toggle',()=>{   // toggle doesn't bubble
      const o=loadSect(); o[g.dataset.sect]=g.open; localStorage.setItem(SECT_KEY,JSON.stringify(o)); }));
  });
  const lg=document.getElementById('gvLegend');
  if(lg) lg.innerHTML='Rating badges follow the Codeforces ramp. '+
    [['≤1199','--faint'],['1200–1399','--green'],['1400–1599','--ncs'],['1600–1899','--lld'],['1900+','--web']]
      .map(([k,c])=>`<b style="color:var(${c})">${k}</b>`).join(' · ')+
    ' · the three days are the plan, the overflow pile is only for slack.';
}
function refreshGrav(){
  if(!GRAV||!gvWrap.children.length)return;
  const c=load(); let done=0,total=0;
  GRAV.days.forEach(d=>{
    const t=d.probs.length, dn=d.probs.filter(p=>c[gvId(p)]).length;
    if(d.id!=='gdx'){ total+=t; done+=dn; }               // tab count tracks the three real days
    const arc=gvWrap.querySelector(`[data-gvarc="${d.id}"]`);
    if(arc) arc.style.strokeDashoffset=138.2*(1-(t?dn/t:0));
    const pct=gvWrap.querySelector(`[data-gvpct="${d.id}"]`);
    if(pct) pct.textContent=Math.round(t?100*dn/t:0)+'%';
    const cn=gvWrap.querySelector(`[data-gvcount="${d.id}"]`);
    if(cn) cn.textContent=dn+' / '+t;
  });
  const tc=document.getElementById('gvCount'); if(tc) tc.textContent=done+' / '+total;
}
gvWrap.addEventListener('click',rowClick);
gvWrap.addEventListener('pointerdown',arrPress);

/* ── Markdown export (concise, for pasting to an AI) ── */
function buildMarkdown(){
  const c=load();
  let cd=0,ct=0,sd=0,st=0,bd=0,bt=0;
  DATA.sprints.forEach(sp=>sp.topics.forEach(([_,probs])=>probs.forEach(p=>{
    const tier=tierOf(p),done=!!c[p.id];
    if(tier==='core'){ct++;if(done)cd++;}
    else if(tier==='stretch'){st++;if(done)sd++;}
    else{bt++;if(done)bd++;}
  })));
  const today=istDate();
  const lines=[
    `DSA sprint progress (${today}) — Core ${cd}/${ct}, Stretch ${sd}/${st}, Bonus ${bd}/${bt}. Go primary, Python fallback. (* = stretch tier)`,''
  ];
  DATA.sprints.forEach(sp=>{
    lines.push(`${sp.week} ${sp.title}`);
    sp.topics.forEach(([tname,probs])=>{
      const done=[],left=[];
      let d=0;
      probs.forEach(p=>{
        const star=tierOf(p)==='stretch'?'*':'';
        const tags=[p.srcs.join('/'), p.lc?`LC${p.lc}`:''].filter(Boolean).join(' ');
        const label=`${p.title}${tags?` (${tags})`:''}${star}`;
        if(c[p.id]){done.push(label);d++;}
        else left.push(label);
      });
      let s=`- ${tname} [${d}/${probs.length}]`;
      if(done.length)s+=` done: ${done.join(', ')}`;
      if(done.length&&left.length)s+=' |';
      if(left.length)s+=` left: ${left.join(', ')}`;
      lines.push(s);
    });
    lines.push('');
  });
  return lines.join('\n');
}
// serialise the (static) CS-theory view straight from its DOM — no separate data to keep in sync
function buildTheoryMd(){
  const out=['## CS Theory',''];
  document.querySelectorAll('#view-theory .subj').forEach(s=>{
    const name=s.querySelector('.subj-name')?.textContent.trim()||'';
    const tier=s.querySelector('.tierpill')?.textContent.trim()||'';
    const tag=s.querySelector('.subj-tag')?.textContent.trim()||'';
    out.push(`### ${name}${tier?` — ${tier}`:''}`);
    if(tag) out.push(`_${tag}_`);
    out.push('');
    s.querySelectorAll('.blk').forEach(b=>{
      const h=b.querySelector('.blk-h')?.textContent.trim()||'';
      if(h) out.push(`**${h}**`);
      const res=b.querySelector('.reslist');
      if(res) res.querySelectorAll('.resitem').forEach(a=>{
        const star=a.querySelector('.r-star')?'★ ':'';
        const rn=a.querySelector('.r-name')?.textContent.trim()||a.href;
        const note=a.querySelector('.r-note')?.textContent.trim()||'';
        out.push(`- ${star}[${rn}](${a.href})${note?` — ${note}`:''}`);
      });
      else b.querySelectorAll('li').forEach(li=>out.push(`- ${li.textContent.replace(/\s+/g,' ').trim()}`));
      out.push('');
    });
  });
  return out.join('\n');
}
const buildExport=()=>buildMarkdown()+'\n\n'+buildTheoryMd();

function flash(btn,txt){
  const old=btn.innerHTML;btn.textContent=txt;
  setTimeout(()=>btn.innerHTML=old,1400);
}
async function copyText(t,btn){
  try{await navigator.clipboard.writeText(t);flash(btn,'Copied ✓');}
  catch{ const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();flash(btn,'Copied ✓'); }
}
function downloadText(t,btn){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([t],{type:'text/markdown'}));
  a.download='dsa-roadmap-'+istDate()+'.md';
  a.click();URL.revokeObjectURL(a.href);flash(btn,'Saved ✓');
}
// dropdown options: "This view" = current tab (problems / theory), "Everything" = combined doc
document.querySelectorAll('.menu [data-act]').forEach(b=>b.addEventListener('click',()=>{
  const theory=document.getElementById('view-theory').classList.contains('on');
  const text=b.dataset.scope==='all'?buildExport():(theory?buildTheoryMd():buildMarkdown());
  const menu=b.closest('details.menu'); menu.removeAttribute('open');
  (b.dataset.act==='copy'?copyText:downloadText)(text,menu.querySelector('summary'));
}));
document.addEventListener('click',e=>{ if(!e.target.closest('details.menu')) document.querySelectorAll('details.menu[open]').forEach(d=>d.removeAttribute('open')); });

/* ══ revision list view (Cold/Warm/Solid) — additive; state {id:{s,n}} in dsasprint2026_revision ══ */
const REV_ORDER=['cold','warm','solid'];
let PROBIDX=null;
function probIdx(){ if(PROBIDX)return PROBIDX; PROBIDX=new Map();
  DATA.sprints.forEach(sp=>sp.topics.forEach(([tname,ps])=>ps.forEach(p=>PROBIDX.set(p.id,{...p,tp:tname}))));
  if(DAYS) DAYS.days.forEach(d=>d.probs.forEach(p=>PROBIDX.set(p.id,      // day-plan problems are filable too
    {id:p.id,title:p.title,srcs:[p.tag],links:[[p.host,p.url]],lc:p.lc,tp:'Day '+d.n})));
  if(GRAV) GRAV.days.forEach(d=>d.probs.forEach(p=>{ const l=gvLink(p);   // so are the Graviton ones
    PROBIDX.set(gvId(p),{id:gvId(p),title:p.t,srcs:[l?l[0]:'OA'],links:l?[l]:[],lc:p.lc,tp:'Graviton · '+d.name}); }));
  return PROBIDX; }
const REVLINKC={LC:'--lc',GFG:'--gfg',NC:'--ncs',TUF:'--tuf',WEB:'--web',CF:'--lld'};
function revLink(l){ if(!l)return ''; const [t,u]=l,c=REVLINKC[t]||'--faint',g=(t==='TUF'||t==='WEB')?READ:ARR;
  return `<a class="rlink" style="color:var(${c})" href="${u}" target="_blank" rel="noopener" title="open ${esc(t)}">${g}</a>`; }
function revBadge(p){ if(p.lc)return `<span class="bdg b-LCnum">LC ${p.lc}</span>`;
  const s=p.srcs&&p.srcs[0]; return s?`<span class="bdg b-${s}">${esc(s)}</span>`:''; }
function revCard(p,note){
  const el=document.createElement('div'); el.className='lrow'; el.dataset.id=p.id;
  el.innerHTML=HANDLE+`<div class="lhead-c"><span class="ltitle" title="${esc(p.title)}">${esc(p.title)}</span>${revBadge(p)}${revLink(p.links&&p.links[0])}</div>`
    +`<span class="lnote" contenteditable="plaintext-only">${esc(note||'')}</span>`
    +`<div class="lacts"><button class="lact lprom" title="promote (Cold→Warm→Solid)">✓</button><button class="lact lreset" title="reset to Cold">↺</button><button class="lact lrem" title="remove from board">✕</button></div>`;
  return el; }
const revBody=s=>document.querySelector(`#view-revision .lbody[data-stage="${s}"]`);
function renderRevBoard(){
  if(!DATA)return; const st=loadRev(), idx=probIdx();
  REV_ORDER.forEach(s=>revBody(s).replaceChildren());
  for(const [id,v] of Object.entries(st)){ const p=idx.get(id); if(!p)continue;
    (revBody((v&&v.s)||'cold')||revBody('cold')).appendChild(revCard(p,(v&&v.n)||'')); }
  revRecount(); }
function revRecount(){
  REV_ORDER.forEach(s=>{ const b=revBody(s); if(!b)return; const rows=b.querySelectorAll('.lrow'), n=rows.length;
    const cel=document.querySelector(`#view-revision [data-n="${s}"]`); if(cel)cel.textContent=n;
    let ph=b.querySelector('.lempty');
    if(!n){ if(!ph){ph=document.createElement('div');ph.className='lempty';ph.textContent=s==='cold'?"queue clear — nothing to re-solve":'nothing here yet';b.appendChild(ph);} } else if(ph)ph.remove();
    rows.forEach(r=>{ r.querySelector('.lprom').classList.toggle('off',s==='solid'); r.querySelector('.lreset').classList.toggle('off',s==='cold'); });
  });
  const rvc=document.getElementById('revCount'); if(rvc)rvc.textContent=Object.keys(loadRev()).length; }
function revPersist(){                                    // rebuild whole state from the DOM (stage + order + note stick)
  const st={};
  document.querySelectorAll('#view-revision .lbody').forEach(b=>b.querySelectorAll('.lrow').forEach(r=>{ st[r.dataset.id]={s:b.dataset.stage,n:r.querySelector('.lnote').textContent.trim()}; }));
  saveRev(st); revRecount(); }
function addRev(id){ const st=loadRev(); if(st[id])return; st[id]={s:'cold',n:''}; saveRev(st);
  document.querySelectorAll(`.row[data-id="${id}"]`).forEach(r=>r.classList.add('rev')); renderRevBoard(); }
function toggleRev(id){ const st=loadRev(), on=!!st[id]; if(on)delete st[id]; else st[id]={s:'cold',n:''}; saveRev(st);
  document.querySelectorAll(`.row[data-id="${id}"]`).forEach(r=>r.classList.toggle('rev',!on));
  if(document.getElementById('view-revision').classList.contains('on')) renderRevBoard(); else revRecount(); }
function bumpRevTab(){ const t=document.getElementById('revCount'); if(!t)return;
  t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
/* FLIP: measure every card, mutate, then play each one back from where it was — cards glide
   between groups instead of teleporting. Same trick the roadmap drag-reorder uses. */
function revFlip(mutate){
  const rows=[...revView.querySelectorAll('.lrow')];
  const before=new Map(rows.map(r=>[r,r.getBoundingClientRect()]));
  mutate();
  rows.forEach(r=>{
    if(!r.isConnected)return;                                  // removed by the mutation
    const f=before.get(r), l=r.getBoundingClientRect(), dx=f.left-l.left, dy=f.top-l.top;
    if(!dx&&!dy)return;
    r.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],
      {duration:430,easing:'cubic-bezier(.22,1,.36,1)'});
  });
}
function revFlashRow(row,cls){ row.classList.remove('flash','flashup'); void row.offsetWidth; row.classList.add(cls); }
/* board taps: ✓ promote, ↺ reset-to-Cold (the fail action), ✕ remove */
const revView=document.getElementById('view-revision');
revView.addEventListener('click',e=>{
  const row=e.target.closest('.lrow'); if(!row)return; const cur=row.parentElement.dataset.stage;
  if(e.target.closest('.lprom')){ const nx=REV_ORDER[REV_ORDER.indexOf(cur)+1]; if(!nx)return;
    revFlip(()=>{ revBody(nx).appendChild(row); revPersist(); }); revFlashRow(row,'flashup'); return; }
  if(e.target.closest('.lreset')){ if(cur==='cold')return;
    revFlip(()=>{ revBody('cold').appendChild(row); revPersist(); }); revFlashRow(row,'flash'); return; }
  if(e.target.closest('.lrem')){ const id=row.dataset.id;
    row.classList.add('going');
    row.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX(-18px) scale(.93)'}],
      {duration:190,easing:'ease-in',fill:'forwards'});
    // timer, not the animation's onfinish: a cancelled or never-finishing animation
    // must not strand the card on the board with its state unsaved
    setTimeout(()=>{
      revFlip(()=>{ row.remove(); revPersist(); });            // the survivors close the gap
      document.querySelectorAll(`.row[data-id="${id}"]`).forEach(x=>x.classList.remove('rev'));
    },190);
    return; }
});
/* drag between groups — handle-armed (like the roadmap) so it doesn't fight inline note editing */
let revDragged=null;
function revAfter(body,y){ const els=[...body.querySelectorAll('.lrow:not(.dragging)')];
  return els.reduce((best,el)=>{const b=el.getBoundingClientRect(),off=y-b.top-b.height/2;return(off<0&&off>best.off)?{off,el}:best;},{off:-Infinity,el:null}).el; }
revView.addEventListener('mousedown',e=>{ const h=e.target.closest('.drag-handle'); if(h) h.closest('.lrow').setAttribute('draggable','true'); });
revView.addEventListener('mouseup',e=>{ if(revDragged)return; const r=e.target.closest('.lrow[draggable="true"]'); if(r) r.removeAttribute('draggable'); });
revView.addEventListener('dragstart',e=>{ const r=e.target.closest('.lrow'); if(!r||r.getAttribute('draggable')!=='true')return;
  revDragged=r; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',''); requestAnimationFrame(()=>r.classList.add('dragging')); });
revView.addEventListener('dragover',e=>{ if(!revDragged)return; e.preventDefault();
  const g=e.target.closest('.lgroup'); if(!g)return; const body=g.querySelector('.lbody');
  const ph=body.querySelector('.lempty'); if(ph)ph.remove();
  const after=revAfter(body,e.clientY); if(after)body.insertBefore(revDragged,after); else body.appendChild(revDragged); });
revView.addEventListener('dragend',()=>{ if(!revDragged)return; revDragged.classList.remove('dragging'); revDragged.removeAttribute('draggable'); revDragged=null; revPersist(); });
revView.addEventListener('focusout',e=>{ if(e.target.classList&&e.target.classList.contains('lnote')) revPersist(); });   // save note on blur
revView.addEventListener('keydown',e=>{ if(e.target.classList&&e.target.classList.contains('lnote')&&e.key==='Enter'){ e.preventDefault(); e.target.blur(); } });
/* add-search picker (manual add from the fixed pool) */
const revAddIn=document.getElementById('revAdd'), revListEl=document.getElementById('revList');
function revMatches(q){ q=q.trim().toLowerCase(); if(!q){revListEl.innerHTML='';return;}
  const st=loadRev(), idx=probIdx();
  const hits=[...idx.values()].filter(p=>!st[p.id]&&(p.title.toLowerCase().includes(q)||(p.tp||'').toLowerCase().includes(q))).slice(0,8);
  revListEl.innerHTML=hits.length?hits.map(p=>`<div class="ritem" data-id="${p.id}"><span class="ritem-t">${esc(p.title)}</span><span class="ritem-tp">${esc(p.tp||'')}</span></div>`).join(''):`<div class="rlist-empty">no match in the pool</div>`; }
revAddIn.addEventListener('input',()=>revMatches(revAddIn.value));
revListEl.addEventListener('mousedown',e=>{ const it=e.target.closest('.ritem'); if(!it)return; e.preventDefault(); addRev(it.dataset.id); revAddIn.value=''; revListEl.innerHTML=''; revAddIn.focus(); });
revAddIn.addEventListener('blur',()=>setTimeout(()=>{revListEl.innerHTML='';},150));







/* ══ day plan — 18 critical days, five patterns a day. Rows reuse the roadmap's own
      markup + handlers, so check / bookmark / +revision all behave identically. ══ */
const dayWrap=document.getElementById('dayChapters');
async function loadDays(){ try{const r=await fetch('/days.json'); if(r.ok)return await r.json();}catch{} return null; }
const DAY_TAGC={DSU:'--ncs',GRD:'--amber',SP:'--lld',DP1:'--verm',DP2:'--tuf',SW:'--green',MS:'--web',
                BS:'--lc',LL:'--py',STR:'--gfg',MTH:'--ink2',TRI:'--ncs',PFX:'--amber'};
/* saved plan wins; anything it doesn't mention (a newly added problem) keeps its home day */
function applyDayLayout(){
  const plan=LAYOUT.dayplan; if(!plan)return;
  const byId=new Map(), home=new Map(), out={};
  DAYS.days.forEach(d=>{ out[d.id]=[]; d.probs.forEach(p=>{byId.set(p.id,p); home.set(p.id,d.id);}); });
  const placed=new Set();
  DAYS.days.forEach(d=>(plan[d.id]||[]).forEach(id=>{
    const p=byId.get(id); if(p&&!placed.has(id)){ out[d.id].push(p); placed.add(id); } }));
  byId.forEach((p,id)=>{ if(!placed.has(id)) out[home.get(id)].push(p); });
  DAYS.days.forEach(d=>{ d.probs=out[d.id]; });
}
function dayRow(p){
  const c=DAY_TAGC[p.tag]||'--faint';
  const badges=[`<span class="bdg dtag" style="color:var(${c});border-color:var(${c})">${esc(p.tag)}</span>`];
  badges.push(p.lc?`<span class="bdg b-LCnum">LC ${p.lc}</span>`:`<span class="bdg b-${p.host}">${esc(p.host)}</span>`);
  if(p.lock) badges.push('<span class="bdg b-lock">🔒</span>');
  return `<div class="row core" data-id="${p.id}" data-tier="core" data-tag="${esc(p.tag)}" data-q="${esc((p.title+' '+p.tag).toLowerCase())}">
    <div class="rmain">${HANDLE}<div class="cir"></div>
    <div class="pmain"><span class="pname">${esc(p.title)}</span><span class="pbadges">${badges.join('')}</span>${BMARK}${REVADD}</div></div>
    <div class="plinks">${arrowFor(p.host,p.url)}</div></div>`;
}
function buildDays(){
  dayWrap.replaceChildren();
  const op=loadSect();
  DAYS.days.forEach(d=>{
    const det=document.createElement('details');
    det.className='chapter'; det.id='sec-'+d.id;
    det.open = d.id in op ? op[d.id] : d.n<=2;             // first two days open, rest folded
    det.addEventListener('toggle',()=>{const o=loadSect();o[d.id]=det.open;localStorage.setItem(SECT_KEY,JSON.stringify(o));});
    det.innerHTML=`<summary class="ch-head">
      <span class="ch-num">${d.n}</span>
      <div class="ch-mid">
        <div class="ch-title">Day ${d.n}</div>
        <div class="ch-sub"><span class="daytags" data-daytags="${d.id}"></span><span data-daycount="${d.id}"></span></div>
      </div>
      <span class="ch-ring"><svg width="54" height="54" viewBox="0 0 54 54">
        <circle class="chr-track" cx="27" cy="27" r="22"/>
        <circle class="chr-arc" data-dayarc="${d.id}" cx="27" cy="27" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
      </svg><span class="chr-txt" data-daypct="${d.id}">0%</span></span>
      <span class="ch-chev">▾</span></summary>
      <div class="ch-body" data-day="${d.id}">${d.probs.map(dayRow).join('')}</div>`;
    dayWrap.appendChild(det);
  });
  const lg=document.getElementById('dayLegend');
  if(lg) lg.innerHTML='Five problems a day, one per pattern — clear the day, not the tag. '+
    Object.entries(DAYS.tags).map(([k,v])=>`<b style="color:var(${DAY_TAGC[k]||'--faint'})">${k}</b> ${esc(v)}`).join(' · ');
}
function refreshDays(){
  if(!DAYS||!dayWrap||!dayWrap.children.length)return;
  const c=load(); let done=0,total=0;
  DAYS.days.forEach(d=>{
    const rows=[...dayWrap.querySelectorAll(`.ch-body[data-day="${d.id}"] .row`)];
    const t=rows.length, dn=rows.filter(r=>c[r.dataset.id]).length;
    total+=t; done+=dn;
    const arc=dayWrap.querySelector(`[data-dayarc="${d.id}"]`);
    if(arc) arc.style.strokeDashoffset=138.2*(1-(t?dn/t:0));
    const pct=dayWrap.querySelector(`[data-daypct="${d.id}"]`);
    if(pct) pct.textContent=Math.round(t?100*dn/t:0)+'%';
    const tg=dayWrap.querySelector(`[data-daytags="${d.id}"]`);
    if(tg) tg.textContent=rows.map(r=>r.dataset.tag).join(' · ')||'empty';
    const cn=dayWrap.querySelector(`[data-daycount="${d.id}"]`);
    if(cn) cn.textContent=dn+' / '+t;
  });
  const tc=document.getElementById('dayCount'); if(tc) tc.textContent=done+' / '+total;
}
/* keep DAYS in step with the screen after a drag, so a later rebuild matches what's shown */
function syncDaysFromDom(){
  const byId=new Map(); DAYS.days.forEach(d=>d.probs.forEach(p=>byId.set(p.id,p)));
  DAYS.days.forEach(d=>{
    const b=dayWrap.querySelector(`.ch-body[data-day="${d.id}"]`); if(!b)return;
    d.probs=[...b.querySelectorAll('.row')].map(r=>byId.get(r.dataset.id)).filter(Boolean);
  });
}
function persistDays(){
  const plan={};
  dayWrap.querySelectorAll('.ch-body[data-day]').forEach(b=>{
    plan[b.dataset.day]=[...b.querySelectorAll('.row')].map(r=>r.dataset.id); });
  LAYOUT.dayplan=plan; saveLayout(); syncDaysFromDom(); refreshDays();
}
/* rows behave exactly as they do on the roadmap */
dayWrap.addEventListener('click',rowClick);
dayWrap.addEventListener('pointerdown',arrPress);
/* ── drag, across days ── */
let dayDragged=null, lastDayAfter;
function dayAfter(body,y){
  const els=[...body.querySelectorAll('.row:not(.dragging)')];
  return els.reduce((best,el)=>{const b=el.getBoundingClientRect(),off=y-b.top-b.height/2;
    return (off<0&&off>best.off)?{off,el}:best;},{off:-Infinity,el:null}).el;
}
function dayFlip(mutate){                       // slide the neighbours instead of snapping them
  const rows=[...dayWrap.querySelectorAll('.row')];
  const before=new Map(rows.map(r=>[r,r.getBoundingClientRect()]));
  mutate();
  rows.forEach(r=>{
    if(r===dayDragged)return;
    const f=before.get(r), l=r.getBoundingClientRect(), dy=f.top-l.top;
    if(!dy)return;
    r.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:230,easing:'cubic-bezier(.22,1,.36,1)'});
  });
}
dayWrap.addEventListener('mousedown',e=>{
  const h=e.target.closest('.drag-handle'); if(h) h.closest('.row').setAttribute('draggable','true'); });
dayWrap.addEventListener('mouseup',e=>{
  if(dayDragged)return; const r=e.target.closest('.row[draggable="true"]'); if(r) r.removeAttribute('draggable'); });
dayWrap.addEventListener('dragstart',e=>{
  const r=e.target.closest('.row'); if(!r||r.getAttribute('draggable')!=='true')return;
  dayDragged=r; lastDayAfter=undefined; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','');
  requestAnimationFrame(()=>r.classList.add('dragging'));
});
dayWrap.addEventListener('dragover',e=>{
  if(!dayDragged)return; e.preventDefault();
  const det=e.target.closest('details.chapter'); if(!det)return;
  if(!det.open) det.open=true;                              // hover a folded day to drop into it
  const body=det.querySelector('.ch-body'), after=dayAfter(body,e.clientY);
  if(after===lastDayAfter && dayDragged.parentElement===body) return;   // nothing would move
  lastDayAfter=after;
  dayFlip(()=>{ if(after) body.insertBefore(dayDragged,after); else body.appendChild(dayDragged); });
  dayWrap.querySelectorAll('details.chapter').forEach(x=>x.classList.toggle('dayover',x===det));
});
dayWrap.addEventListener('dragend',()=>{
  if(!dayDragged)return;
  dayDragged.classList.remove('dragging'); dayDragged.removeAttribute('draggable');
  dayWrap.querySelectorAll('.dayover').forEach(x=>x.classList.remove('dayover'));
  dayDragged=null; lastDayAfter=undefined; persistDays();
});

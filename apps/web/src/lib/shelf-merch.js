// Auto-extracted from shelf-merch.html — vanilla JS view engine.
// Wrapped so it mounts exactly once into #app/#toast/#layer when called from React.
import * as api from '../services/api-bridge.js';

let __mounted = false;
/** Survives Vite HMR so a hot reload does not reset authed state or re-run boot. */
const bootState = typeof window !== 'undefined'
  ? (window.__shelfMerchBoot ??= { gen: 0, sessionAt: 0 })
  : { gen: 0, sessionAt: 0 };
export function mountShelfMerch() {
  if (__mounted) return; __mounted = true;
/* =================================================================
   SHELF MERCH — Corporate Swag Platform (single-file interactive demo)
   INR throughout · brand green · vanilla JS view-router + in-memory state
================================================================= */

/* ---------- icons ---------- */
const I = {
  logo:`<svg viewBox="0 0 32 32" fill="none"><path d="M16 3 4 9l12 6 12-6-12-6Z" fill="#15784C"/><path d="M4 15l12 6 12-6" stroke="#0E5536" stroke-width="2.4" stroke-linejoin="round"/><path d="M4 21l12 6 12-6" stroke="#1E8E5C" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  home:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>`,
  orders:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h12"/></svg>`,
  wallet:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h2"/></svg>`,
  shop:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16l-1 11H5L4 9Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>`,
  swag:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l3 2 3-2 3 2 3-2v4l-2 2v10H8V10L6 8V4Z"/></svg>`,
  kit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/></svg>`,
  camp:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10v4h4l6 4V6L8 10H4Z"/><path d="M18 9a4 4 0 0 1 0 6"/></svg>`,
  contacts:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6M16.5 20a5 5 0 0 0-3-4.6"/></svg>`,
  plug:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v5"/></svg>`,
  bill:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>`,
  gear:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
  cat:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  help:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7M12 17h.01"/></svg>`,
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>`,
  back:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`,
  backThin:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>`,
  send:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>`,
  upload:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>`,
  edit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>`,
  eye:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  dots:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  share:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
  swap:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10H3l4-4M3 10l4 4M17 14h4l-4 4M21 14l-4-4"/></svg>`,
  truck:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>`,
  box:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8"/></svg>`,
  spark:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/></svg>`,
  coin:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9h4a1.7 1.7 0 0 1 0 3.4H10a1.7 1.7 0 0 0 0 3.4h4"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13h10l1-13"/></svg>`,
  arrow:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>`,
  zoom:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3M11 8v6M8 11h6"/></svg>`,
  bulb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/></svg>`,
  viewGrid:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>`,
  viewRows:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="6" rx="1"/><rect x="4" y="13" width="16" height="6" rx="1"/></svg>`,
};

/* product silhouettes (inline svg) */
const PG = {
  tee:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M22 10l-12 7 5 8 5-3v28h28V22l5 3 5-8-12-7-7 5-10 0-7-5Z"/></svg>`,
  hoodie:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M20 12l-10 7 4 9 6-3v25h24V25l6 3 4-9-10-7c-2 5-6 7-12 7s-10-2-12-7Z"/></svg>`,
  bottle:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M27 8h10v6l3 5v33a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2V19l3-5V8Z"/></svg>`,
  mug:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M16 18h28v24a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V18Z"/><path d="M44 24h6a5 5 0 0 1 0 12h-6"/></svg>`,
  bag:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M16 22h32l-3 32H19l-3-32Z"/><path d="M24 22v-4a8 8 0 0 1 16 0v4"/></svg>`,
  cap:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><path d="M12 40c0-14 9-22 20-22s20 8 20 22M12 40h44a3 3 0 0 1 0 6H12a3 3 0 0 1 0-6Z"/></svg>`,
  pack:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><rect x="18" y="14" width="28" height="38" rx="6"/><path d="M26 14v-3a6 6 0 0 1 12 0v3M24 26h16"/></svg>`,
  power:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><rect x="20" y="12" width="24" height="40" rx="4"/><path d="M28 20h8M28 44h8"/></svg>`,
  pillow:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><rect x="12" y="18" width="40" height="28" rx="10"/></svg>`,
  note:`<svg viewBox="0 0 64 64" fill="none" stroke="#9aa39c" stroke-width="2.2"><rect x="18" y="12" width="28" height="40" rx="3"/><path d="M24 22h16M24 30h16M24 38h10"/></svg>`,
};
const LOGO_DECO=`<svg viewBox="0 0 48 48" fill="#15784C"><path d="M24 6c2 5 7 8 13 8-3 5-3 11 0 16-6 0-11 3-13 8-2-5-7-8-13-8 3-5 3-11 0-16 6 0 11-3 13-8Z" opacity=".9"/><circle cx="24" cy="24" r="6" fill="#0E5536"/></svg>`;

/* ---------- money / points ---------- */
const PT = 2;                       // 1 point = ₹2
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const inr2 = n => '₹' + n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const pts = n => (Math.round(n*100)/100).toLocaleString('en-IN') + ' Pts';
const USD_INR = 83;                 // demo conversion rate
const cmoney = (cur,n)=> cur==='USD' ? '$'+Math.round(n).toLocaleString('en-US') : inr(n);
const esc = s => (''+s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function backLink(label,act,arg,opts={}){
  const mb=opts.mb!==undefined?opts.mb:'14px';
  const light=opts.light?' back-link-light':'';
  const argAttr=arg!==undefined&&arg!==null&&arg!==''?` data-arg="${esc(arg)}"`:'';
  const mbStyle=mb?` style="margin-bottom:${mb}"`:'';
  return `<span class="back-link${light}"${mbStyle} data-act="${act}"${argAttr}>${I.backThin}<span>${esc(label)}</span></span>`;
}

/* ---------- state ---------- */
const defaultState = {
  authed:false, view:'login', nav:'orders', loading:false,
  account:'Rubix', user:{name:'Chandra Sekhar', initials:'CS', email:'hr@rubix.net'},
  catalogProducts:[], catalogTotal:0, campaigns:[], primaryEntityId:null,
  flow:{}, // ephemeral wizard state
  logoUploads:[], // recent shop logo uploads in this session
  artUploads:[], // recent artwork uploads in this session
  wallets:[
    {id:'w1', name:'Chakram Wallet', cur:'INR', balance:415000, unalloc:90000, alloc:325000, owner:'Jonna Madhavi', email:'jonnaml2015@gmail.com',
      activity:[
        {t:'Allocated', who:'12 recipients · Diwali 2026', amt:-120000, on:'02 Jun 2026'},
        {t:'Funds added', who:'Razorpay · UPI', amt:200000, on:'28 May 2026'},
        {t:'Transfer in', who:'from Sales Wallet', amt:90000, on:'21 May 2026'},
        {t:'Order paid', who:'New Hire Kit · 20 recipients', amt:-84000, on:'13 May 2026'},
      ]},
    {id:'w2', name:'Sales Wallet', cur:'INR', balance:142000, unalloc:142000, alloc:0, owner:'Chandra Sekhar', email:'konetibaba@gmail.com',
      activity:[{t:'Funds added', who:'Purchase order #PO-3391', amt:142000, on:'30 May 2026'}]},
    {id:'w3', name:'Global Wallet', cur:'USD', balance:6200, unalloc:6200, alloc:0, owner:'Jonna Madhavi', email:'jonnaml2015@gmail.com',
      activity:[{t:'Funds added', who:'Stripe · card', amt:6200, on:'18 May 2026'}]},
  ],
  shops:[
    {id:'s1', name:'Rubix Dubai', currency:'Points', live:true, categories:['Food & Beverages','Work Essentials','Merch'], collections:['c1']},
  ],
  collections:[
    {id:'c1', code:'C343955972', name:'New employee Swag', created:'28 May 2026', by:'Jonna Madhavi', status:'ready', shopId:'s1',preferredColors:['Black','White'],
     products:[{g:'pack',brand:'Mercer+Mettle',nm:'Mercer+Mettle Pack'},{g:'hoodie',brand:'Bella + Canvas',nm:'Bella + Canvas Youth Sponge Fleece'},{g:'mug',brand:'',nm:'Black Glossy Mug 11oz'},{g:'bottle',brand:'',nm:'The Standard Bottle'}]},
  ],
  kits:[
    {id:'k1', name:'Welcome', items:4, status:'live', sent:false},
    {id:'k2', name:'New hire', items:5, status:'live', sent:false},
  ],
  contacts:[
    {id:'p1', email:'jonnaml2015@gmail.com', name:'Jonna Madhavi', role:'Owner', address:'', loc:''},
    {id:'p2', email:'konetibaba@gmail.com', name:'Chandra Sekhar', role:'Sender', address:'Flat No 1004, Tower-9, Eipl Corner Stone', loc:'Hyderabad, Telangana, IN'},
  ],
  departments:[
    {id:'d1', walletId:'w1', name:'Engineering', code:'CC-ENG', budget:120000, spent:64000, manager:'Chandra Sekhar', managerEmail:'konetibaba@gmail.com'},
    {id:'d2', walletId:'w1', name:'Sales', code:'CC-SAL', budget:90000, spent:38000, manager:'Jonna Madhavi', managerEmail:'jonnaml2015@gmail.com'},
    {id:'d3', walletId:'w1', name:'Marketing', code:'CC-MKT', budget:75000, spent:12000, manager:'Chandra Sekhar', managerEmail:'konetibaba@gmail.com'},
    {id:'d4', walletId:'w1', name:'People & HR', code:'CC-HR', budget:40000, spent:40000, manager:'Jonna Madhavi', managerEmail:'jonnaml2015@gmail.com'},
  ],
  orders:[
    {id:'o1', date:'01/05/2026', name:'Welcome Kit', status:'Shipped', amount:30000, track:'D43KJ3PPP', items:[['Welcome Tee','25'],['Steel Bottle','25'],['Logo Mug','25']]},
    {id:'o2', date:'01/05/2026', name:'New Hire Kit', status:'Delivered', amount:30000, track:'D43KJ3PPP', delivered:'13-05-2026', items:[['Hoodie','20'],['Notebook','20'],['Tote Bag','20']]},
    {id:'o3', date:'24/04/2026', name:'Diwali Hamper', status:'Processing', amount:184500, track:'', items:[['Gift Box','60'],['Sweets Pack','60']]},
  ],
  uid:100,
  org:{
    step:1, done:false, active:true, inWizard:false,
    wallet:{ name:'FY2026 Merchandise Budget', amount:1000000, start:'2026-04-01', end:'2027-03-31', funding:'upload', docType:'Purchase Order', docNumber:'PO-RUBIX-2026-0417', uploaded:false, pay:'card' },
    seq:6,
    departments:[
      {id:1,name:'Marketing',desc:'Events, conferences, swag campaigns and promotions.',users:25,allocated:300000,color:'#2563EB',mgr:{name:'Priya Sharma',email:'priya@rubix.net',mobile:'+91 98765 43210',role:'Marketing Manager',invite:true}},
      {id:2,name:'Sales',desc:'Client gifting, field sales kits and prospect merchandise.',users:40,allocated:200000,color:'#7C3AED',mgr:{name:'Ravi Kumar',email:'ravi@rubix.net',mobile:'+91 98220 11234',role:'Sales Manager',invite:true}},
      {id:3,name:'HR',desc:'Onboarding kits, employee rewards and recognition.',users:30,allocated:200000,color:'#0E9CB5',mgr:{name:'Anita Rao',email:'anita@rubix.net',mobile:'+91 99001 22789',role:'HR Manager',invite:true}},
      {id:4,name:'Admin',desc:'Office supplies, signage and facility merchandise.',users:12,allocated:150000,color:'#E08600',mgr:{name:'Karan Gupta',email:'karan@rubix.net',mobile:'+91 90040 55678',role:'Admin Manager',invite:true}},
      {id:5,name:'Customer Success',desc:'Customer welcome kits and loyalty merchandise.',users:18,allocated:150000,color:'#0A8F5B',mgr:{name:'Amit Singh',email:'amit@rubix.net',mobile:'+91 96320 99001',role:'Customer Success Manager',invite:true}},
    ],
  },
};
const S = (typeof window !== 'undefined' && window.__shelfMerchState)
  ? window.__shelfMerchState
  : { ...defaultState, org: { ...defaultState.org, departments: defaultState.org.departments.map(d=>({...d,mgr:{...d.mgr}})) },
      wallets: defaultState.wallets.map(w=>({...w,activity:[...w.activity]})),
      shops: defaultState.shops.map(s=>({...s})),
      collections: defaultState.collections.map(c=>({...c,products:[...c.products]})),
      kits: defaultState.kits.map(k=>({...k})),
      contacts: defaultState.contacts.map(c=>({...c})),
      departments: defaultState.departments.map(d=>({...d})),
      orders: defaultState.orders.map(o=>({...o,items:[...o.items]})),
    };
if (typeof window !== 'undefined') window.__shelfMerchState = S;
const nid = p => p+(++S.uid);

/* ---------- nav config ---------- */
const NAV = [
  ['orders','Orders',I.orders],['wallets','Wallets',I.wallet],['shops','Shops',I.shop],
  ['swag','Swag',I.swag],['kits','Kits',I.kit],['campaigns','Campaigns',I.camp],
  ['contacts','Contacts',I.contacts],['integrations','Integrations',I.plug],
  ['billing','Billing',I.bill],['settings','Settings',I.gear],['catalog','Catalog',I.cat],
];

/* ---------- router ---------- */
const APP = ()=>document.getElementById('app');
function markSessionActive(){
  bootState.sessionAt=Date.now();
}
function syncAuthState(){
  if(api.useMocks()) return;
  if(S.loading) return;
  if(api.isAuthenticated()){
    if(!S.authed) S.authed=true;
    return;
  }
  if(!S.authed) return;
  // Brief grace after login/hydrate — avoids racing boot or token refresh.
  if(Date.now()-bootState.sessionAt<8000) return;
  S.authed=false; S.view='login';
}
function go(view, opts={}){ S.view=view; if(opts.nav)S.nav=opts.nav; Object.assign(S.flow, opts.flow||{}); if(view==='contacts')S.flow.contactsSearch=''; window.scrollTo(0,0); render(); }
async function setNav(n){
  S.nav=n; S.view=n; closeLayer();
  if(n==='contacts'){ S.flow.contactsSearch=''; }
  render();
  if(n==='catalog'&&!api.useMocks()&&api.isAuthenticated()){
    const requestId=(S.flow.catalogRequestId||0)+1;
    S.flow.catalogRequestId=requestId;
    S.flow.catalogLoading=true;
    render();
    try{
      const selected=S.flow.catCat||'All Products';
      const catalog=await api.refreshCatalogProducts(selected==='All Products'?undefined:selected);
      if(S.flow.catalogRequestId!==requestId) return;
      S.catalogProducts=catalog.items;
      S.catalogTotal=catalog.total;
    }catch(_e){
      if(S.flow.catalogRequestId===requestId) toast('Could not load catalog products');
    }finally{
      if(S.flow.catalogRequestId===requestId){
        S.flow.catalogLoading=false;
        render();
      }
    }
  }
}

function render(){
  syncAuthState();
  if(S.loading){ APP().innerHTML = `<div class="auth"><div style="display:grid;place-items:center;min-height:60vh;color:var(--ink-2);font-size:15px">Loading…</div></div>`; return; }
  if(!S.authed){ APP().innerHTML = S.view==='signup'?ViewSignup():ViewLogin(); return; }
  // full-screen wizard flows render without shell
  const full = ['createShop','shopBuilder','swagName','swagCatalog','swagArtwork','sendPoints','createKit','editKit','sendItems'];
  if(full.includes(S.view)){ APP().innerHTML = Wizards[S.view](); afterRender(); return; }
  APP().innerHTML = Shell( ViewFor(S.view) );
  afterRender();
}
function afterRender(){
  // focus first autofocus
  const a=document.querySelector('[autofocus]'); if(a)a.focus();
  bindCreateShopNameInput();
  mountKonvaMockups();
}
function readCreateShopName(){
  const inp=document.getElementById('sh-name');
  if(inp) S.flow.shopName=inp.value;
}
function bindCreateShopNameInput(){
  if(S.view!=='createShop'||(S.flow.step|0)!==0) return;
  const inp=document.getElementById('sh-name');
  if(!inp) return;
  if(!inp.dataset.bound){
    inp.dataset.bound='1';
    inp.addEventListener('input',()=>{ S.flow.shopName=inp.value; });
  }
  if(S.flow.shopName!=null&&inp.value!==S.flow.shopName) inp.value=S.flow.shopName;
}
function getLogoUploadsList(){
  const seen=new Set();
  const out=[];
  const add=(entry)=>{
    const src=entry.preview||entry.logoUrl||'';
    if(!src) return;
    const key=src+'|'+(entry.name||'');
    if(seen.has(key)) return;
    seen.add(key);
    out.push({...entry,preview:src});
  };
  for(const u of S.logoUploads||[]) add(u);
  for(const s of S.shops||[]){
    if(s.logoUrl) add({name:(s.name||'Shop')+' logo',logoUrl:s.logoUrl,ext:'LOGO',size:0});
  }
  return out;
}
function ViewFor(v){
  const map={orders:ViewOrders,wallets:ViewWallets,shops:ViewShops,shopDetail:ViewShopDetail,
    swag:ViewSwag,productDetail:ViewProductDetail,kits:ViewKits,contacts:ViewContacts,campaigns:ViewCampaigns,
    integrations:ViewIntegrations,billing:()=>Stub('Billing','Manage invoices, GST details and payment methods.',I.bill),
    settings:ViewSettings,
    catalog:ViewCatalog};
  return (map[v]||ViewOrders)();
}

/* ---------- shell ---------- */
function Shell(inner){
  return `
  <div class="topbar">
    <div class="brandmark">${I.logo}<span style="font-family:var(--disp);font-weight:800;font-size:18px;letter-spacing:-.02em">Shelf Merch</span></div>
    <div class="acct" data-act="toast" data-arg="Switch workspace"><div><div class="k">Account</div><div class="v">${esc(S.account)}</div></div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#56655C" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div>
    <div class="spacer"></div>
    <button class="btn btn-dark" data-act="sendGift">${I.send}<span>Send Gift</span></button>
    <button class="iconbtn" data-act="toast" data-arg="Help & support">${I.help}</button>
    <div class="avatar" data-act="userMenu">${S.user.initials}</div>
  </div>
  <div class="body">
    <aside class="sidebar scroll">
      ${NAV.map(([k,l,ic])=>`<div class="nav-item ${S.nav===k?'on':''}" data-act="nav" data-arg="${k}">${ic}<span>${l}</span></div>`).join('')}
    </aside>
    <main class="main scroll"><div class="wrap fade-in">${inner}</div></main>
  </div>
  `;
}
function ViewSettings(){
  const tab=S.setTab||'workspace';
  const rail=`<div class="subrail">
    ${[['workspace','Workspace settings'],['sso','SSO']].map(([k,t])=>`<div class="item ${tab===k?'on':''}" data-act="setTab" data-arg="${k}">${t}</div>`).join('')}</div>`;
  const content = tab==='sso' ? ViewSSO() : ViewWorkspaceSettings();
  return `<div class="page-h"><div><h1>Settings</h1><div class="sub">Manage your workspace, ownership, currency and single sign-on.</div></div></div>
    <div style="display:flex;gap:22px">${rail}<div style="flex:1;max-width:780px">${content}</div></div>`;
}
function ViewWorkspaceSettings(){
  const name=S.account;
  return `<div class="card" style="padding:30px">
    <h2 style="font-size:23px;font-family:var(--disp);margin-bottom:22px">Workspace Settings</h2>
    <div class="field" style="max-width:440px"><label class="lbl">Workspace name</label><input class="inp" id="ws-name" value="${esc(name)}"></div>
    <div class="divider"></div>
    <div class="lbl">Workspace icon</div>
    <p class="muted" style="font-size:13px;margin:4px 0 12px">This will be used as the company icon for the workspace on all members' profiles.</p>
    <div class="row" style="gap:14px;align-items:center"><div class="logo-chip" style="width:50px;height:50px">${LOGO_DECO}</div><button class="btn btn-ghost btn-sm" data-act="toast" data-arg="Icon uploaded">Upload</button></div>
    <div class="divider"></div>
    <div class="lbl">Owner</div>
    <div class="row" style="gap:18px;align-items:center;margin-top:8px;flex-wrap:wrap"><div style="font-size:14px"><b>Jonna Madhavi</b> &nbsp;<span class="muted">jonnaml2015@gmail.com</span></div><span class="lnk" data-act="toast" data-arg="Transfer ownership flow">Transfer ownership ↗</span></div>
    <div class="divider"></div>
    <div class="lbl">Workspace currency</div>
    <p class="muted" style="font-size:13px;margin:4px 0 10px">This will be used as the default currency for the main workspace wallet or any refunds.</p>
    <div class="row" style="gap:14px;align-items:center"><b style="font-size:15px">INR</b><span class="lnk" data-act="toast" data-arg="Change currency">Change ↗</span></div>
    <div class="divider"></div>
    <div class="lbl">Workspace URL</div>
    <div class="row" style="gap:8px;align-items:center;margin-top:8px"><span class="muted" style="font-size:14px">app.shelfmerch.io/</span><input class="inp" id="ws-slug" value="${esc(name.toLowerCase())}" style="max-width:320px"></div>
    <div style="margin-top:24px"><button class="btn btn-brand" data-act="saveWorkspace">Save changes</button></div>
  </div>`;
}
function ViewSSO(){
  return `<div class="card" style="padding:30px">
    <h2 style="font-size:23px;font-family:var(--disp);margin-bottom:14px">SSO</h2>
    <p class="muted" style="font-size:14px;line-height:1.6;margin-bottom:20px">Enable SSO on Shelf Merch for a faster, more secure login. Available for enterprise packages or as an add-on. <span class="lnk" data-act="toast" data-arg="SSO docs opened">Learn more</span></p>
    <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:var(--ink)">
      <li style="margin-bottom:12px">Find our metadata at <a class="lnk" href="https://account.shelfmerch.io/saml/metadata" data-act="toast" data-arg="Opening metadata URL">https://account.shelfmerch.io/saml/metadata</a></li>
      <li style="margin-bottom:12px">Create a custom SSO app on your IdP (Okta, Azure, etc.) using the ACS URL, Entity ID, Certificate and Attributes listed in the metadata above.</li>
      <li style="margin-bottom:12px">Once the app setup is done, email <b>sso@shelfmerch.io</b> with the following details:
        <ul style="margin:8px 0 0;padding-left:20px;color:var(--ink-2)">
          <li>Single Sign-On URL</li>
          <li>Single Logout URL (optional)</li>
          <li>Entity ID</li>
          <li>Certificate</li></ul></li>
      <li>Leave everything else to us. After we receive the above details, we'll create a corresponding configuration in our backend to enable SSO. This process typically takes <b>4–6 business days</b> to configure and test. Once SSO is enabled for your email domain, all users on the same email domain will be redirected to your IdP immediately.</li>
    </ol>
    <p class="muted" style="font-size:13.5px;margin-top:20px">For any further queries, please <span class="lnk" data-act="toast" data-arg="Support contacted">contact us</span>.</p>
  </div>`;
}
function setTab(a){ S.setTab=a; render(); }
function saveWorkspace(){ const n=document.getElementById('ws-name'); if(n)S.account=n.value||S.account; toast('Workspace settings saved'); render(); }

function Stub(title,sub,icon){
  return `<div class="page-h"><div><h1>${title}</h1><div class="sub">${sub}</div></div></div>
  <div class="card empty"><div class="ic">${icon.replace('width="24"','').replace('currentColor','#15784C')}</div>
  <h3>${title} is coming together</h3><p>This module is part of the Shelf Merch roadmap. Hook it up to your data to go live.</p>
  <button class="btn btn-soft" style="margin-top:16px" data-act="toast" data-arg="Request early access — noted!">Request early access</button></div>`;
}

/* ---------- layers: modal / drawer / toast ---------- */
function openModal(html){ document.getElementById('layer').innerHTML=`<div class="scrim" data-scrim><div class="modal scroll">${html}</div></div>`; }
function openDrawer(html){ document.getElementById('layer').innerHTML=`<div class="drawer-scrim" data-scrim></div><div class="drawer">${html}</div>`; }
function closeLayer(){ document.getElementById('layer').innerHTML=''; }
let _toastHide=null;
function toast(msg,ok=true){
  const host=document.getElementById('toast');
  if(!host) return;
  clearTimeout(_toastHide);
  host.innerHTML='';
  const e=document.createElement('div');
  e.className='toast '+(ok?'ok':'err');
  e.setAttribute('role','status');
  e.innerHTML=(ok?I.check.replace('<svg ','<svg width="18" height="18" '):'')+`<span>${esc(msg)}</span>`;
  host.appendChild(e);
  _toastHide=setTimeout(()=>{
    e.classList.add('toast-out');
    setTimeout(()=>{ if(e.parentNode) e.remove(); },250);
  },3200);
}

/* ---------- auth screens ---------- */
function AuthArt(){
  return `<div class="auth-art dotted">
    <div class="brandmark">${I.logo}<span style="font-family:var(--disp);font-weight:800;font-size:20px;color:#fff">Shelf Merch</span></div>
    <div>
      <div class="big">Corporate swag &amp; gifting, on autopilot.</div>
      <div class="sub">Build branded stores, load wallets, design swag and send points to your team — all in one workspace, billed in ₹ with GST &amp; Razorpay.</div>
      <div class="chiprow">
        <span class="chip">Branded shops</span><span class="chip">Points wallets</span>
        <span class="chip">Swag designer</span><span class="chip">Kits at scale</span><span class="chip">HRIS sync</span>
      </div>
    </div>
    <div style="opacity:.7;font-size:12.5px">Trusted by people teams · Made in India 🇮🇳</div>
  </div>`;
}
function ViewSignup(){
  return `<div class="auth">${AuthArt()}
  <div class="auth-form"><div class="inner stagger">
    <div class="eyebrow">Get started</div>
    <h1 style="font-size:30px;margin-bottom:6px">Create your account</h1>
    <p class="muted" style="margin-bottom:22px">Set up your Shelf Merch workspace in minutes.</p>
    <div class="field"><label class="lbl">Work email</label><input class="inp" id="su-email" autofocus placeholder="you@company.com"></div>
    <div class="field"><label class="lbl">Password</label><input class="inp" id="su-password" type="password" placeholder="At least 8 characters"></div>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">Name</label><input class="inp" id="su-name" placeholder="Your name"></div>
    <div class="field" style="flex:1"><label class="lbl">Company</label><input class="inp" id="su-company" placeholder="Company name"></div></div>
    <p class="mut3" style="font-size:11.5px;line-height:1.5;margin:6px 0 16px">By creating an account, I agree to Shelf Merch’s <a>Terms of Use</a>, the use of my personal data per the <a>Privacy Notice</a>, and to receive product emails from Shelf Merch.</p>
    <button class="btn btn-brand btn-lg btn-block" data-act="auth">Create account</button>
    <p class="muted" style="text-align:center;margin-top:16px;font-size:13px">Already have an account? <span class="lnk" data-act="go" data-arg="login">Log in</span></p>
  </div></div></div>`;
}
function ViewLogin(){
  return `<div class="auth">${AuthArt()}
  <div class="auth-form"><div class="inner stagger">
    <div class="eyebrow">Welcome back</div>
    <h1 style="font-size:30px;margin-bottom:6px">Log in to Shelf Merch</h1>
    <p class="muted" style="margin-bottom:22px">Pick up where your people team left off.</p>
    <div class="field"><label class="lbl">Work email</label><input class="inp" autofocus value="hr@rubix.net"></div>
    <div class="field"><label class="lbl">Password</label><input class="inp" type="password" value="demo1234"></div>
    <div style="text-align:right;margin-bottom:18px"><span class="lnk-muted" data-act="toast" data-arg="Reset link sent">Forgot password?</span></div>
    <button class="btn btn-brand btn-lg btn-block" data-act="auth">Log in</button>
    <p class="muted" style="text-align:center;margin-top:16px;font-size:13px">New here? <span class="lnk" data-act="go" data-arg="signup">Create an account</span></p>
  </div></div></div>`;
}

/* ---------- WIZARD REGISTRY ---------- */
const Wizards={};

/* ---------- CREATE KIT ---------- */
const KIT_STEPS=['Name','Products','Branding','Packaging'];
function ktFlowStep(f){ const n=Number(f?.step); return Number.isFinite(n)?Math.max(0,Math.min(3,Math.floor(n))):0; }
function createKitStart(){ S.flow={exitTo:'kits',step:0,kitName:'Welcome Kit',picked:[0,2,3],logoFile:null,notes:'',pkg:'box'}; go('createKit'); }
Wizards.createKit=function(){
  const f=S.flow; const step=ktFlowStep(f); if(f.step!==step)f.step=step;
  let body='';
  if(step===0){
    body=`<div style="max-width:620px;margin:0 auto"><h1 style="font-size:26px;margin-bottom:6px">Name your kit</h1><p class="muted" style="margin-bottom:20px">A kit is a reusable bundle of products you can send to recipients at any time.</p>
      <div class="field"><label class="lbl">Kit name</label><input class="inp" id="kt-name" value="${esc(f.kitName)}" autofocus></div>
      <div class="field"><label class="lbl">Internal description (optional)</label><textarea class="inp" rows="3" placeholder="e.g. Standard onboarding kit for new joiners">${''}</textarea></div></div>`;
  } else if(step===1){
    body=`<h1 style="font-size:24px;margin-bottom:4px">Choose products for "${esc(f.kitName)}"</h1><p class="muted" style="margin-bottom:18px">Select the items to include. You can brand them in the next step.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${getCatalogList().map((p,i)=>{const on=f.picked.includes(i);return `<div class="pcard" style="${on?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-50)':''}" data-act="ktPick" data-arg="${i}"><div class="img">${productImg(p)}<div style="position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:50%;background:${on?'var(--brand)':'#fff'};color:${on?'#fff':'var(--brand)'};border:1px solid var(--brand);display:grid;place-items:center;font-weight:700">${on?'✓':'+'}</div></div><div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div><div class="pr">${p.price}</div></div></div>`;}).join('')}</div>`;
  } else if(step===2){
    body=kitBrandingPanel(f);
  } else {
    const pk=f.pkg;
    body=`<div style="max-width:680px;margin:0 auto"><h1 style="font-size:24px;margin-bottom:6px">Choose packaging</h1><p class="muted" style="margin-bottom:18px">How should "${esc(f.kitName)}" arrive? Premium packaging is charged per kit.</p>
      <div class="grid">
        <div class="optcard ${pk==='none'?'on':''}" data-act="ktPkg" data-arg="none"><div class="rd"></div><div style="flex:1"><h4>No packaging</h4><p>Items ship in standard protective mailers.</p></div><b>Free</b></div>
        <div class="optcard ${pk==='box'?'on':''}" data-act="ktPkg" data-arg="box"><div class="rd"></div><div style="flex:1"><h4>Premium shipping box</h4><p>Branded rigid box with crinkle-paper fill.</p></div><b>₹49 / kit</b></div></div>
      <div class="note" style="margin-top:18px">Once published, this kit is reusable — send it to new recipients any time without rebuilding.</div></div>`;
  }
  const back=step>0?backLink('Back','ktBack',null,{mb:'0'}):backLink('Cancel','wzExit',null,{mb:'0'});
  const next=step<3?`<button type="button" class="btn btn-dark" ${step===1&&!f.picked.length?'disabled':''} data-act="ktNext">Next</button>`:`<button type="button" class="btn btn-brand" data-act="kitPublish">Publish kit &amp; send</button>`;
  return wzChrome('Create a kit',KIT_STEPS,step,body,back+next);
};
function ktPick(el){ const i=+el.dataset.arg; const a=S.flow.picked; const k=a.indexOf(i); if(k<0)a.push(i); else a.splice(k,1); render(); }
function kitLogoImg(f){
  const url=f?.logoFile?.preview;
  if(url) return `<img src="${url}" alt="Kit logo" style="max-width:100%;max-height:100%;object-fit:contain;display:block">`;
  return '';
}
function kitBrandingPanel(f){
  const prods=f.picked.map(i=>getCatalogList()[i]).filter(Boolean);
  const hasLogo=!!f.logoFile?.preview;
  const lf=f.logoFile||{};
  const logoName=esc(lf.name||'logo');
  const logoMeta=esc(lf.ext&&lf.size?lf.ext+' · '+fmtFileSize(lf.size):lf.ext||'');
  const logoPicker=hasLogo
    ?`<div class="row" style="align-items:center;justify-content:space-between;border:1px solid var(--brand);border-radius:var(--r-sm);padding:10px 12px;background:var(--brand-50);margin-bottom:12px"><div class="row" style="gap:10px;align-items:center"><div class="logo-chip" style="width:36px;height:36px;overflow:hidden;padding:3px">${kitLogoImg(f)}</div><div><div style="font-weight:600;font-size:13px">${logoName}</div><div class="mut3" style="font-size:11px">${logoMeta}</div></div></div><button type="button" class="xbtn" data-act="ktLogoClear">✕</button></div>`
    :`<div id="kt-logo-drop" style="border:1.5px dashed var(--line);border-radius:var(--r);padding:24px;text-align:center;color:var(--ink-2);background:#fff;margin-bottom:12px;cursor:pointer" data-act="ktLogoUpload">${I.upload.replace('currentColor','#15784C')}<div style="margin-top:8px;font-weight:600">Upload logo</div><div class="mut3" style="font-size:11px;margin-top:6px">SVG, PNG, WEBP, JPEG · max 5 MB</div></div>`;
  return `<div style="display:grid;grid-template-columns:380px 1fr;gap:26px">
    <div><h1 style="font-size:22px;margin-bottom:6px">Brand your kit</h1><p class="muted" style="font-size:13px;margin-bottom:16px">Upload logos and leave notes for our design team. We'll mock up each item for approval.</p>
      ${logoPicker}
      <input type="file" id="kt-logo-inp" accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg" style="display:none">
      <button class="btn ${hasLogo?'btn-ghost':'btn-dark'} btn-block" data-act="ktLogoUpload">${hasLogo?'Replace logo':'Add logo'}</button>
      <div class="field" style="margin-top:16px"><label class="lbl">Notes to design team</label><textarea class="inp" id="kt-notes" rows="4" placeholder="e.g. White logo on the chest, full-colour on mugs">${esc(f.notes||'')}</textarea></div></div>
    <div><div class="${hasLogo?'banner info':'banner'}" style="margin-bottom:16px">${hasLogo?'<div>Branding applied. Our team will share proofs within 2 business days.</div>':'<div>Add a logo to preview branded mockups for each item.</div>'}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${prods.map((p,idx)=>hasLogo
        ? `<div class="pcard" data-act="noop">${swagMockupHost(enrichProduct(p),idx)}<div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div></div></div>`
        : pcard(p,{branded:hasLogo,artworkUrl:f.logoFile?.preview,act:'noop'})).join('')}</div></div></div>`;
}
function kitArtworkInput(f){
  if(!f.logoFile?.file) return undefined;
  return { file:f.logoFile.file, preview:f.logoFile.preview, name:f.logoFile.name };
}
function ktLogoSetFile(file){
  if(!LOGO_ACCEPT.test(file.name)){ toast('Accepted formats: SVG, PNG, WEBP, JPEG, JPG',false); return; }
  if(file.size>LOGO_MAX){ toast('File must be 5 MB or smaller',false); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const entry={name:file.name,size:file.size,ext:logoExt(file.name),preview:reader.result,file};
    S.flow.logoFile=entry;
    S.logoUploads=S.logoUploads||[];
    const dup=S.logoUploads.findIndex(u=>u.name===entry.name&&u.size===entry.size);
    if(dup>=0) S.logoUploads.splice(dup,1);
    S.logoUploads.unshift(entry);
    if(S.logoUploads.length>12) S.logoUploads.length=12;
    render();
  };
  reader.readAsDataURL(file);
}
function ktLogoUpload(){ document.getElementById('kt-logo-inp')?.click(); }
function ktLogoClear(){ S.flow.logoFile=null; render(); }
function ktPkg(el){ S.flow.pkg=el.dataset.arg; render(); }
function ktBack(){ S.flow.step=Math.max(ktFlowStep(S.flow)-1,0); render(); }
let _ktNextLock=0;
function ktNext(){
  const now=Date.now();
  if(now-_ktNextLock<280) return;
  _ktNextLock=now;
  const f=S.flow;
  const step=ktFlowStep(f);
  if(step===0) f.kitName=document.getElementById('kt-name')?.value||'New Kit';
  if(step===1&&!f.picked?.length){ toast('Select at least one product',false); return; }
  if(step===2) f.notes=(document.getElementById('kt-notes')||{}).value||'';
  f.step=Math.min(step+1,3);
  render();
}
async function kitPublish(){
  const f=S.flow;
  if(api.useMocks()){
    const catalog=getCatalogList();
    const productRefs=f.picked.map(i=>{const p=catalog[i]; return p?{catalogProductId:p.id||'',name:p.nm,brand:p.brand||'',group:p.g}:null;}).filter(Boolean);
    const k={id:nid('k'),name:f.kitName,items:f.picked.length,status:'live',sent:false,artworkUrl:f.logoFile?.preview||'',designNotes:f.notes||'',picked:f.picked.slice(),productRefs};
    S.kits.push(k);
    toast('Kit "'+k.name+'" published');
    sendItemsStartFor(k.id, f.picked.slice(), k.artworkUrl);
    return;
  }
  try{
    S.loading=true; render();
    const created=await api.createKitFlow({
      name:f.kitName||'New Kit',
      pickedIndices:f.picked,
      catalog:getCatalogList(),
      packaging:f.pkg||'box',
      designNotes:f.notes||'',
      artwork:kitArtworkInput(f),
    });
    const k={...created,artworkUrl:created.artworkUrl||f.logoFile?.preview||''};
    S.kits.push(k);
    S.loading=false;
    toast('Kit "'+k.name+'" saved to your workspace');
    sendItemsStartFor(k.id, f.picked.slice(), k.artworkUrl);
  }catch(err){
    S.loading=false; render();
    toast(err.message||'Failed to save kit');
  }
}

/* ---------- EDIT KIT ---------- */
function kitPickedIndices(kit){
  if(!kit) return [];
  const catalog=getCatalogList();
  if(Array.isArray(kit.picked)&&kit.picked.length) return kit.picked.slice();
  if(Array.isArray(kit.productRefs)&&kit.productRefs.length){
    const indices=[];
    for(const ref of kit.productRefs){
      let idx=catalog.findIndex(p=>p.id&&ref.catalogProductId&&p.id===ref.catalogProductId);
      if(idx<0&&ref.name) idx=catalog.findIndex(p=>p.nm===ref.name&&(p.brand||'')===(ref.brand||''));
      if(idx>=0&&!indices.includes(idx)) indices.push(idx);
    }
    if(indices.length) return indices;
  }
  return kit.items?[0,2,3].slice(0,kit.items):[];
}
function kitProductLabels(kit){
  const catalog=getCatalogList();
  return kitPickedIndices(kit).map(i=>catalog[i]).filter(Boolean);
}
function kitLogoFromKit(k){
  if(!k?.artworkUrl) return null;
  return { name:'Kit artwork', preview:k.artworkUrl, ext:'LOGO', existing:true };
}
function editKitStart(id){
  closeLayer();
  const k=S.kits.find(x=>x.id===id);
  if(!k){ toast('Kit not found'); return; }
  S.flow={exitTo:'kits',kitId:id,kitName:k.name,picked:kitPickedIndices(k),step:0,logoFile:kitLogoFromKit(k),notes:k.designNotes||''};
  go('editKit');
}
const EDIT_KIT_STEPS=['Products','Branding'];
Wizards.editKit=function(){
  const f=S.flow; const step=f.step|0;
  let body='';
  if(step===0){
    const selected=f.picked.map(i=>getCatalogList()[i]).filter(Boolean);
    const selectedCards=selected.length
      ?`<div style="margin-bottom:22px"><div class="lbl" style="margin-bottom:10px">Current items (${selected.length})</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">${selected.map((p,si)=>`<div class="pcard" style="position:relative"><div class="img">${productImg(p)}</div><div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div></div>
          <button type="button" class="xbtn" style="position:absolute;top:8px;right:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)" data-act="ekRemove" data-arg="${f.picked[si]}" title="Remove">✕</button></div>`).join('')}</div></div>`
      :`<div class="banner" style="margin-bottom:18px">No products in this kit yet. Add items from the catalog below.</div>`;
    body=`<div style="max-width:900px;margin:0 auto">
      <h1 style="font-size:26px;margin-bottom:6px">Edit kit</h1>
      <p class="muted" style="margin-bottom:20px">Update the kit name and choose which catalog products to include.</p>
      <div class="field" style="max-width:420px;margin-bottom:24px"><label class="lbl">Kit name</label><input class="inp" id="ek-name" value="${esc(f.kitName)}" autofocus></div>
      ${selectedCards}
      <div class="lbl" style="margin-bottom:10px">Add from catalog</div>
      <p class="muted" style="font-size:13px;margin-bottom:14px">Tap a product to add or remove it from this kit.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${getCatalogList().map((p,i)=>{const on=f.picked.includes(i);return `<div class="pcard" style="${on?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-50)':''}" data-act="ekPick" data-arg="${i}"><div class="img">${productImg(p)}<div style="position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:50%;background:${on?'var(--brand)':'#fff'};color:${on?'#fff':'var(--brand)'};border:1px solid var(--brand);display:grid;place-items:center;font-weight:700">${on?'✓':'+'}</div></div><div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div><div class="pr">${p.price}</div></div></div>`;}).join('')}</div></div>`;
  } else {
    body=kitBrandingPanel(f);
  }
  const back=step>0?backLink('Back','ekBack',null,{mb:'0'}):backLink('Cancel','wzExit',null,{mb:'0'});
  const next=step<1
    ?`<button class="btn btn-dark" ${!f.picked.length?'disabled':''} data-act="ekNext">Next</button>`
    :`<button class="btn btn-brand" data-act="kitSaveEdit">Save changes</button>`;
  return wzChrome('Edit kit',EDIT_KIT_STEPS,step,body,back+next);
};
function ekBack(){ S.flow.step--; render(); }
function ekNext(){
  const f=S.flow;
  if(f.step===0) f.kitName=(document.getElementById('ek-name')||{}).value||f.kitName;
  f.step++; render();
}
function ekPick(el){ const i=+el.dataset.arg; const a=S.flow.picked; const k=a.indexOf(i); if(k<0)a.push(i); else a.splice(k,1); render(); }
function ekRemove(el){ const i=+el.dataset.arg; const a=S.flow.picked; const k=a.indexOf(i); if(k>=0)a.splice(k,1); render(); }
async function kitSaveEdit(){
  const f=S.flow;
  if((f.step|0)===0) f.kitName=(document.getElementById('ek-name')||{}).value||f.kitName;
  else f.notes=(document.getElementById('kt-notes')||{}).value||'';
  if(!f.picked.length){ toast('Add at least one product to the kit',false); return; }
  const k=S.kits.find(x=>x.id===f.kitId);
  if(!k){ toast('Kit not found'); return; }
  if(api.useMocks()){
    const catalog=getCatalogList();
    k.name=f.kitName;
    k.items=f.picked.length;
    k.picked=f.picked.slice();
    k.productRefs=f.picked.map(i=>{const p=catalog[i]; return p?{catalogProductId:p.id||'',name:p.nm,brand:p.brand||'',group:p.g}:null;}).filter(Boolean);
    k.artworkUrl=f.logoFile?.preview||'';
    k.designNotes=f.notes||'';
    toast('Kit updated');
    go('kits');
    return;
  }
  try{
    S.loading=true; render();
    const updated=await api.updateKitFlow({
      id:String(f.kitId),
      name:f.kitName,
      pickedIndices:f.picked,
      catalog:getCatalogList(),
      designNotes:f.notes||'',
      artwork:kitArtworkInput(f),
    });
    Object.assign(k,{
      ...updated,
      artworkUrl:updated.artworkUrl||f.logoFile?.preview||k.artworkUrl||'',
    });
    S.loading=false;
    toast('Kit updated');
    go('kits');
  }catch(err){
    S.loading=false; render();
    toast(err.message||'Failed to update kit',false);
  }
}

/* ---------- SEND ITEMS ---------- */
const SI_STEPS=['Items','Recipients','Experience','Checkout'];
function sendItemsStart(el){ const id=el&&el.dataset?el.dataset.arg:null; closeLayer();
  const k=S.kits.find(x=>x.id===id);
  const picked=kitPickedIndices(k);
  if(!picked.length){ toast('This kit has no products — edit the kit to add items',false); return; }
  sendItemsStartFor(id, picked, k?.artworkUrl);
}
function sendItemsStartFor(kitId, picked, artworkUrl){
  const k=S.kits.find(x=>x.id===kitId);
  S.flow={exitTo:'kits',step:0,kitId,picked,artworkUrl:artworkUrl||k?.artworkUrl||'',selRecips:S.contacts.slice(0,2).map(c=>c.id),mode:'redeem',
    singleLocation:{name:'',email:'',phone:'',line1:'',line2:'',city:'',state:'',pincode:'',country:'IN'},
    note:'Welcome to the team — we are thrilled to have you!',pkg:'box',
    from:'People Team, '+S.account, when:'now',
    msg:"Your welcome kit is on its way! A little something from all of us — we're so glad you're here.",
    prevView:'landing'};
  go('sendItems');
}
function siFlowStep(f){ const n=Number(f?.step); return Number.isFinite(n)?Math.max(0,Math.min(3,Math.floor(n))):0; }
Wizards.sendItems=function(){
  const f=S.flow; const step=siFlowStep(f); if(f.step!==step)f.step=step;
  const k=S.kits.find(x=>x.id===f.kitId);
  let body='';
  if(step===0){
    const prods=f.picked.map(i=>getCatalogList()[i]);
    const artUrl=f.artworkUrl||'';
    const hasBrand=!!artUrl;
    body=`<h1 style="font-size:24px;margin-bottom:4px">Items in this send</h1><p class="muted" style="margin-bottom:18px">${k?'From kit "'+esc(k.name)+'". ':''}Confirm what goes out. Quantities scale to your recipient list.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${prods.map(p=>pcard(p,{branded:hasBrand,artworkUrl:artUrl,act:'noop'})).join('')}
        <div class="pcard" style="display:grid;place-items:center;border-style:dashed;cursor:pointer" data-act="siAddOpen"><div style="text-align:center;color:var(--brand)">${I.plus}<div style="font-weight:700;margin-top:6px">Add item</div></div></div></div>`;
  } else if(step===1){
    body=recipientPicker(f,"Who's receiving this?","Choose how recipients get their items, then pick people.",{modes:true});
    if(f.mode==='surprise'){ const missing=S.contacts.filter(c=>f.selRecips.includes(c.id)&&(!c.address||!c.city||!c.state||!c.pincode));
      if(missing.length) body+=`<div class="banner" style="margin-top:14px">${I.truck.replace('width="24" height="24"','width="16" height="16"')}<div><b>${missing.length} recipient(s) missing a shipping address.</b> Surprise sends need addresses up front. <span class="lnk" data-act="contactEdit" data-arg="${missing[0].id}">Fix recipient information</span></div></div>`; }
  } else if(step===2){
    body=recipientExperience(f,{kind:'items'})+`
      <div class="card" style="padding:20px;margin-top:18px;max-width:620px">
        <h3 style="font-size:15px;margin-bottom:6px">Printed card note</h3>
        <p class="muted" style="font-size:12.5px;margin-bottom:10px">Printed on a card tucked inside every kit.</p>
        <textarea class="inp" id="si-note" rows="3" data-act="reNote">${esc(f.note)}</textarea>
        <div class="card" style="padding:14px;background:var(--surface-2);margin-top:12px"><div class="mut3" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:6px">Card preview</div>
          <div style="font-family:var(--disp);font-style:italic;font-size:14px" id="si-prev">${esc(f.note)}</div><div class="muted" style="margin-top:8px;font-size:12px">— The ${esc(S.account)} team</div></div>
      </div>`;
  } else {
    const unit=4200, qty=f.selRecips.length, sub=unit*qty;
    const pkgCost=(f.pkg==='box'?49:0)*qty;
    const fee=sub*0.12; const ship=120*qty; const tax=(sub+fee+pkgCost+ship)*0.18; const total=sub+fee+pkgCost+ship+tax;
    body=`<h1 style="font-size:24px;margin-bottom:16px">Checkout</h1>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">${paymentPanel()}
        <div class="card" style="padding:22px;height:fit-content"><h3 style="font-size:18px;margin-bottom:12px">Order summary</h3>
          ${sumRow('Kit',esc(k?k.name:'Custom kit'))}
          ${sumRow('Items per recipient',f.picked.length)}
          ${sumRow('Recipients',qty)}
          ${sumRow('Items subtotal',inr(sub))}
          ${sumRow('Packaging',pkgCost?inr(pkgCost):'Free')}
          ${sumRow('Service fee (12%)',inr(fee))}
          ${sumRow('Shipping',inr(ship))}
          ${sumRow('Estimated GST (18%)',inr(tax))}
          <div class="divider"></div>
          <div class="row" style="justify-content:space-between;align-items:center"><b style="font-size:18px">You pay</b><b class="num" style="font-size:22px;font-family:var(--disp)">${inr(total)}</b></div>
          <button class="btn btn-brand btn-block btn-lg" style="margin-top:14px" data-act="sendItemsDo">Pay &amp; send</button></div></div>`;
  }
  const back=step>0?backLink('Back','siBack',null,{mb:'0'}):backLink('Save draft','wzExit',null,{mb:'0'});
  const next=step<3?`<button type="button" class="btn btn-dark" data-act="siNext">Next</button>`:'<span></span>';
  return wzChrome('Send Items',SI_STEPS,step,body,back+next);
};
function siBack(){ S.flow.step=Math.max(siFlowStep(S.flow)-1,0); render(); }
let _siNextLock=0;
function siNext(){
  const now=Date.now();
  if(now-_siNextLock<280) return;
  _siNextLock=now;
  const f=S.flow;
  const step=siFlowStep(f);
  if(step===1&&!f.selRecips?.length){ toast('Select at least one recipient',false); return; }
  if(step===1&&f.mode==='surprise'){
    const missing=S.contacts.filter(c=>f.selRecips.includes(c.id)&&(!c.address||!c.city||!c.state||!c.pincode));
    if(missing.length){ toast('Complete the shipping address for all surprise recipients',false); return; }
  }
  if(step===1&&f.mode==='single'){
    const loc=f.singleLocation||(f.singleLocation={});
    loc.name=(document.getElementById('sl-name')?.value||'').trim();
    loc.email=(document.getElementById('sl-email')?.value||'').trim();
    loc.phone=(document.getElementById('sl-phone')?.value||'').trim();
    loc.line1=(document.getElementById('sl-line1')?.value||'').trim();
    loc.line2=(document.getElementById('sl-line2')?.value||'').trim();
    loc.city=(document.getElementById('sl-city')?.value||'').trim();
    loc.state=(document.getElementById('sl-state')?.value||'').trim();
    loc.pincode=(document.getElementById('sl-pincode')?.value||'').trim();
    loc.country=document.getElementById('sl-country')?.value||'IN';
    if(!loc.name||!loc.email.includes('@')||!loc.line1||!loc.city||!loc.state||!loc.pincode){
      toast('Enter the location contact, email, and complete shipping address',false); return;
    }
  }
  if(step===2){
    const n=document.getElementById('si-note'); if(n)f.note=n.value;
    const fr=document.getElementById('re-from'); if(fr)f.from=fr.value;
    const m=document.getElementById('re-msg'); if(m)f.msg=m.value;
  }
  f.step=Math.min(step+1,3);
  render();
}
function siAddOpen(){
  const catalog=getCatalogList();
  if(!catalog.length){ toast('No products in catalog'); return; }
  const cards=catalog.map((p,i)=>{
    const on=S.flow.picked.includes(i);
    return `<div class="pcard" style="${on?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-50)':''}" data-act="siPick" data-arg="${i}"><div class="img">${productImg(p)}<div style="position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:50%;background:${on?'var(--brand)':'#fff'};color:${on?'#fff':'var(--brand)'};border:1px solid var(--brand);display:grid;place-items:center;font-weight:700">${on?'✓':'+'}</div></div><div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div><div class="pr">${p.price}</div></div></div>`;
  }).join('');
  openModal(`<div class="modal-pad" style="max-width:900px"><div class="modal-h"><div><h3>Add products</h3><p class="muted" style="font-size:13px;margin-top:4px">Tap products to add or remove them from this send.</p></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));max-height:58vh;overflow:auto;padding:2px">${cards}</div>
    <div class="row" style="margin-top:20px;justify-content:space-between;align-items:center">
      <span class="tag tag-soft" style="background:var(--brand-50);color:var(--brand-d)">${S.flow.picked.length} item${S.flow.picked.length===1?'':'s'} selected</span>
      <button class="btn btn-dark" data-act="siAddDone">Done</button>
    </div></div>`);
}
function siPick(el){
  const i=+el.dataset.arg;
  const a=S.flow.picked;
  const k=a.indexOf(i);
  if(k<0)a.push(i); else a.splice(k,1);
  const card=el.closest('.pcard');
  if(card){
    const on=a.includes(i);
    card.style.borderColor=on?'var(--brand)':'';
    card.style.boxShadow=on?'0 0 0 2px var(--brand-50)':'';
    const badge=card.querySelector('.img > div');
    if(badge){
      badge.style.background=on?'var(--brand)':'#fff';
      badge.style.color=on?'#fff':'var(--brand)';
      badge.textContent=on?'✓':'+';
    }
    const countEl=document.querySelector('#layer .tag-soft');
    if(countEl) countEl.textContent=`${a.length} item${a.length===1?'':'s'} selected`;
    return;
  }
  render();
}
function siAddDone(){ closeLayer(); render(); }
function siScheduleFromFlow(f){
  if(f.when==='self') return {mode:'self'};
  if(f.when==='sched'){
    const s=f.sched||{};
    const date=s.date||new Date(Date.now()+86400000).toISOString().slice(0,10);
    const time=s.time||'10:00';
    const tz=(s.tz||'Asia/Kolkata (IST)').split(' ')[0];
    return {mode:'scheduled',sendAt:`${date}T${time}:00`,timezone:tz};
  }
  return {mode:'now'};
}
async function sendItemsDo(){
  const f=S.flow;
  const k=S.kits.find(x=>x.id===f.kitId);
  const finishUi=()=>{
    if(k)k.sent=true;
    go('orders',{nav:'orders'});
    toast('Order placed for '+f.selRecips.length+' recipients! 📦');
  };
  if(api.useMocks()){
    S.orders.unshift({id:nid('o'),date:new Date().toLocaleDateString('en-GB'),name:(k?k.name:'Custom kit'),status:'Processing',amount:4200*f.selRecips.length,track:'',items:f.picked.map(i=>[DEMO_PRODUCTS[i].nm,String(f.selRecips.length)])});
    finishUi();
    render();
    return;
  }
  const entityId=S.primaryEntityId||(S.org.departments[0]&&S.org.departments[0].id);
  if(!entityId){ toast('No department budget found — complete wallet setup first'); return; }
  if(!f.kitId){ toast('Kit not found — reload and try again'); return; }
  if(!f.selRecips.length){ toast('Select at least one recipient'); return; }
  try{
    S.loading=true; render();
    const campaign=await api.launchKitCampaignFlow({
      entityId:String(entityId),
      kitId:String(f.kitId),
      name:k?k.name:'Kit send',
      fulfillmentMode:f.mode==='surprise'?'surprise':f.mode==='single'?'single':'redeem',
      singleLocation:f.mode==='single'?f.singleLocation:undefined,
      message:{from:f.from||'',body:f.msg||''},
      schedule:siScheduleFromFlow(f),
      contactIds:f.selRecips,
      contacts:S.contacts,
    });
    S.campaigns=(S.campaigns||[]);
    S.campaigns.unshift(campaign);
    await hydrateFromApi();
    S.loading=false;
    finishUi();
    render();
  }catch(err){
    S.loading=false; render();
    toast(err.message||'Failed to send kit');
  }
}


/* ---------- SWAG DESIGNER ---------- */
function swagDesignerStart(el){
  closeLayer();
  const shopId=(el&&el.dataset&&el.dataset.arg)||S.flow.shopId||(S.shops[0]&&S.shops[0].id);
  S.flow={exitTo:shopId?'shopDetail':'swag', shopId, colName:'New employee Swag', picked:[], artwork:false, exitToNav:shopId?'shops':'swag'};
  go('swagName');
}
Wizards.swagName=function(){
  const f=S.flow;
  const body=`<div style="max-width:640px;margin:0 auto"><h1 style="font-size:26px;margin-bottom:6px">Name your collection</h1><p class="muted" style="margin-bottom:20px">Choose a name for your branded product collection.</p>
    <div class="field"><label class="lbl">Collection name</label><input class="inp" id="sw-name" value="${esc(f.colName)}" autofocus></div></div>`;
  const foot=`${backLink('Back to my swag','wzExit',null,{mb:'0'})}<button class="btn btn-dark" data-act="swNameNext">Next</button>`;
  return wzChrome('Design swag',['Collection','Products','Artwork'],0,body,foot);
};
async function swNameNext(){
  S.flow.colName=document.getElementById('sw-name').value||'New Collection';
  if(!api.useMocks()&&api.isAuthenticated()){
    try{
      const catalog=await api.refreshCatalogProducts();
      S.catalogProducts=catalog.items;
      S.catalogTotal=catalog.total;
    }catch(_e){/* keep cached list */}
  }
  go('swagCatalog');
}

Wizards.swagCatalog=function(){
  const f=S.flow; const cats=['All Products','Apparel','Bags','Drinkware','Technology','Office'];
  const catalog=getCatalogList();
  const entries=catalog.map((p,i)=>({p,i}));
  const body=`<h1 style="font-size:24px;margin-bottom:4px">Add products to your collection</h1><p class="muted" style="margin-bottom:16px">${catalog.length} products · pick the items you want to brand.</p>
    <div class="tabs" style="margin-bottom:18px">${cats.map((c,i)=>`<button class="${i===0?'on':''}" data-act="noop">${c}</button>`).join('')}</div>
    ${!entries.length?`<div class="card empty" style="padding:40px"><h3>No products in catalog</h3><p>Check back later or contact support if you expected products here.</p></div>`
    :`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));padding-bottom:90px">${entries.map(({p,i})=>{const on=f.picked.includes(i);const ep=enrichProduct(p);const sw=productColorNames(ep).slice(0,4).map(c=>`<span class="sw" style="background:${productColorHex(ep,c)}" title="${esc(c)}"></span>`).join('');return `<div class="pcard" style="${on?'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-50)':''}" data-act="swPick" data-arg="${i}"><div class="img">${productImg(p)}<div style="position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:50%;background:${on?'var(--brand)':'#fff'};color:${on?'#fff':'var(--brand)'};border:1px solid var(--brand);display:grid;place-items:center;font-weight:700">${on?'✓':'+'}</div></div><div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div><div class="pr">${p.price}</div>${sw?`<div class="swatches">${sw}</div>`:''}</div></div>`;}).join('')}</div>`}`;
  const foot='';
  const bar=`<div style="position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:14px 34px;display:flex;align-items:center;justify-content:space-between;z-index:30">
    <div class="row" style="gap:10px;align-items:center"><b>${esc(f.colName)}</b><span class="tag tag-soft" style="background:var(--brand-50);color:var(--brand-d)">${f.picked.length} item${f.picked.length===1?'':'s'}</span></div>
    <div class="row" style="gap:10px">${backLink('Back','go','swagName',{mb:'0'})}<button class="btn btn-dark" ${f.picked.length?'':'disabled'} data-act="go" data-arg="swagArtwork">Add artwork ${I.send.replace('width="24" height="24"','width="14" height="14"')}</button></div></div>`;
  return wzChrome('Design swag',['Collection','Products','Artwork'],1,body+bar,foot);
};
function swPick(el){ const i=+el.dataset.arg; const a=S.flow.picked; const k=a.indexOf(i); if(k<0)a.push(i); else a.splice(k,1); S.flow.pickedProducts=S.flow.picked.map(idx=>getCatalogList()[idx]).filter(Boolean); render(); }

Wizards.swagArtwork=function(){
  const f=S.flow;
  const catalog=getCatalogList();
  f.pickedProducts=f.picked.map(i=>catalog[i]).filter(Boolean);
  const prods=f.pickedProducts;
  const atab=f.artTab||'device';
  let pickerBody;
  if(atab==='device'){
    if(f.artwork&&f.artFile){
      const af=f.artFile;
      const artName=esc(af.name||'artwork');
      const artMeta=esc(af.ext&&af.size?af.ext+' · '+fmtFileSize(af.size):af.ext||'');
      pickerBody=`<div class="row" style="align-items:center;justify-content:space-between;border:1px solid var(--brand);border-radius:var(--r-sm);padding:11px 13px;background:var(--brand-50)"><div class="row" style="gap:10px;align-items:center"><div class="logo-chip" style="width:36px;height:36px;overflow:hidden;padding:3px">${swArtImg(f)}</div><div><div style="font-weight:600;font-size:13px">${artName}</div><div class="mut3" style="font-size:11px">${artMeta}</div></div></div><button class="xbtn" data-act="swArtClear">✕</button></div>`;
    } else {
      pickerBody=`<div id="sw-art-drop" style="border:1.5px dashed var(--line);border-radius:var(--r-sm);padding:22px;text-align:center;color:var(--ink-2);background:#fff;cursor:pointer" data-act="swArtUpload">
        <input type="file" id="sw-art-inp" accept=".svg,.png,.jpg,.jpeg,.ai,image/svg+xml,image/png,image/jpeg" style="display:none">
        <div style="font-weight:600;font-size:13px">Drag and drop file</div>
        <div class="mut3" style="font-size:11px;margin:6px 0">SVG, PNG, JPG, AI · 300 DPI+</div>
        <button type="button" class="btn btn-soft btn-sm" data-act="swArtUpload">Search local device</button></div>`;
    }
  } else {
    const prev=S.artUploads||[];
    pickerBody=prev.length
      ? `<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">${prev.map((u,i)=>artPrevThumb(i,u,f.artSel===i)).join('')}</div>`
      : `<div style="border:1.5px dashed var(--line);border-radius:var(--r-sm);padding:22px;text-align:center;color:var(--ink-2);background:#fff"><div style="font-weight:600;font-size:13px">No previous uploads yet</div><div class="mut3" style="font-size:11px;margin-top:6px">Upload artwork from your device — it will appear here for reuse.</div></div>`;
  }
  const summary=f.artwork?`<div class="card" style="padding:16px;margin-top:14px">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:6px">Design summary</div>
      ${swSummaryRow('Products',prods.length+(prods.length===1?' item':' items'))}
      ${swSummaryRow('Decoration','DTF transfer')}
      ${swSummaryRow('Colour variants','All included')}
      ${swSummaryRow('Artwork',esc(f.artFile?.name||'—'))}
    </div>`:'';
  const left=`<div class="sw-art-rail">
    <div class="sw-eyebrow">Step 3 of 3 · Artwork</div>
    <h1 style="font-size:22px;margin-bottom:6px">Add artwork to your products</h1>
    <p class="muted" style="font-size:13px;margin-bottom:16px">Upload your artwork, then position it on each product. Edit your design any time. Items are created using DTF decoration.</p>
    <div class="card" style="padding:16px">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:10px">Add new artwork</div>
      <div class="tabs" style="max-width:300px;margin-bottom:14px">
        <button class="${atab==='device'?'on':''}" data-act="artTab" data-arg="device">Upload from device</button>
        <button class="${atab==='prev'?'on':''}" data-act="artTab" data-arg="prev">Previous uploads</button></div>
      ${pickerBody}
      <div class="note" style="margin-top:12px">Use a high-quality file with a transparent background (300 DPI+) to prevent production delays. <span class="lnk" data-act="toast" data-arg="Guidelines opened">Learn more</span></div>
      <button class="btn btn-dark btn-block" style="margin-top:14px" ${atab==='device'&&!f.artwork?'':'disabled'} data-act="swArtUpload">Add artwork</button>
    </div>
    ${summary}
    <button class="btn btn-dark btn-block btn-lg" style="margin-top:14px" ${f.artwork?'':'disabled'} data-act="swGenerate">Generate designs</button>
    ${f.artwork?'<button class="btn btn-ghost btn-block btn-sm" style="margin-top:8px" data-act="swResetArt">Reset placement on all products</button>':''}</div>`;
  const header=f.artwork
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:6px;flex-wrap:wrap">
        <div><div style="font-size:16px;font-weight:700">Your mockups</div>
          <div class="mut3" style="font-size:12px;margin-top:2px">Drag to move · corner handles to scale · top handle to rotate. Each product keeps its own placement.</div></div>
        <div class="row" style="gap:8px;align-items:center;font-size:12px;color:#1A6E45;background:var(--brand-50);border:1px solid var(--brand-100,#cfe9da);border-radius:999px;padding:5px 12px;font-weight:600">${I.check.replace('<svg ','<svg width="14" height="14" ')}Applied to all ${prods.length} products · all colour variants</div>
      </div>`
    : `<div class="banner" style="margin-bottom:16px;background:#eaf1fb;color:#1c2a52;border:none">Add your artwork on the left to preview it on every product — all colour variants are included.</div>`;
  const right=`<div>${header}
    <div class="sw-mockups">${prods.map((p,idx)=>{const ep=enrichProduct(p);const mock=productHasPrintArea(ep);const inner=f.artwork
        ? swagMockupHost(ep,idx)
        : `<div class="img${mock?' img-mockup':''}">${productImg(ep,{...(mock?{width:'100%',height:'100%'}:{}),url:designImgUrl(ep)})}</div>`;
      const badge=f.artwork?`<div class="mockup-badge">${I.spark.replace('<svg ','<svg width="11" height="11" ')}Editable</div>`:'';
      return `<div class="pcard mockup-card" style="position:relative">${f.artwork?'':'<div class="dots-btn">'+I.dots+'</div>'}${badge}${inner}<div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div></div></div>`;}).join('')}</div></div>`;
  const body=`<div class="sw-art-layout">${left}${right}</div>`;
  return wzChrome('Design swag',['Collection','Products','Artwork'],2,body,'');
};
function swSummaryRow(k,v){
  return `<div class="sw-summary-row"><span class="k">${esc(k)}</span><span class="v" title="${esc(v)}">${esc(v)}</span></div>`;
}
const ART_ACCEPT=/\.(svg|png|jpe?g|ai)$/i;
const ART_MAX=5*1024*1024;
function swArtImg(f,opts={}){
  const url=f?.artFile?.preview;
  if(url) return `<img src="${url}" alt="Artwork" style="max-width:100%;${opts.maxH?`max-height:${opts.maxH};`:''}object-fit:contain;display:block">`;
  return opts.fallback===false?'':LOGO_DECO;
}
function swArtSetFile(file){
  if(!ART_ACCEPT.test(file.name)){ toast('Accepted formats: SVG, PNG, JPG, AI',false); return; }
  if(file.size>ART_MAX){ toast('File must be 5 MB or smaller',false); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const entry={name:file.name,size:file.size,ext:logoExt(file.name),preview:reader.result,file};
    S.flow.artwork=true;
    S.flow.artFile=entry;
    S.artUploads=S.artUploads||[];
    const dup=S.artUploads.findIndex(u=>u.name===entry.name&&u.size===entry.size);
    if(dup>=0) S.artUploads.splice(dup,1);
    S.artUploads.unshift(entry);
    if(S.artUploads.length>12) S.artUploads.length=12;
    render();
  };
  reader.readAsDataURL(file);
}
function swArtUpload(){ document.getElementById('sw-art-inp')?.click(); }
function swArtClear(){ S.flow.artwork=false; S.flow.artFile=null; S.flow.artSel=null; S.flow.artPlacements={}; render(); }
function swResetArt(){ S.flow.artPlacements={}; render(); }

/* ===================== KONVA MOCKUP CANVAS ===================== */
// Interactive POD mockups for the swag-artwork step: the uploaded artwork is a
// real Konva.Image the user can drag, scale and rotate on each product, inside
// the product's print area. Placement is stored per product (as % of the square
// stage, so it is resolution-independent) and reused when designs are generated.
let __konvaLib=null;
let __mockupStages=[];
async function loadKonva(){
  if(__konvaLib) return __konvaLib;
  __konvaLib=(await import('konva')).default;
  return __konvaLib;
}
function loadImageEl(src){
  // No crossOrigin: this canvas is display-only (never pixel-read or exported),
  // so a CORS-less remote product image should still render.
  return new Promise((resolve,reject)=>{
    if(!src){ reject(new Error('no src')); return; }
    const im=new Image();
    im.onload=()=>resolve(im);
    im.onerror=reject;
    im.src=src;
  });
}

/* ---- POD realism: bake warp + fabric texture + sheen into the artwork ----
 * The garment's own folds are blended live (multiply) on the Konva node; the
 * effects below are intrinsic to the print itself (placement-independent) so we
 * bake them once into an offscreen canvas built only from the artwork's own
 * data-URL — no garment pixels are read, so there is never a CORS taint. */
let __fabricTex=null;
function getFabricTexture(){
  if(__fabricTex) return __fabricTex;
  const c=document.createElement('canvas'); c.width=c.height=128;
  const x=c.getContext('2d');
  const img=x.createImageData(128,128);
  for(let i=0;i<img.data.length;i+=4){
    const n=128+(Math.random()*44-22);           // soft grey grain
    img.data[i]=img.data[i+1]=img.data[i+2]=n; img.data[i+3]=255;
  }
  x.putImageData(img,0,0);
  x.globalAlpha=0.05; x.strokeStyle='#000';        // faint horizontal weave
  for(let i=0;i<128;i+=3){ x.beginPath(); x.moveTo(0,i+0.5); x.lineTo(128,i+0.5); x.stroke(); }
  x.globalAlpha=1;
  __fabricTex=c; return c;
}
// Surface curvature by product family — cylindrical items curve the most.
function warpAmountFor(g){
  if(g==='mug'||g==='bottle'||g==='flask') return 1;
  if(g==='cap'||g==='beanie') return 0.5;
  return 0.3; // tee / hoodie / pillow / flat
}
// Cylinder mapping: source u in [0,1] -> destination u in [0,1]. Monotonic, so
// adjacent strips stay edge-to-edge (seamless); edges compress as on a cylinder.
function cylMapX(u,k){
  const maxAng=k*0.85;
  if(maxAng<1e-3) return u;
  return 0.5+Math.sin((u-0.5)*2*maxAng)/Math.sin(maxAng)*0.5;
}
function buildRealisticArtwork(artImg,group){
  try{
    const maxDim=1100;
    const nw=artImg.naturalWidth||artImg.width||0, nh=artImg.naturalHeight||artImg.height||0;
    if(nw<2||nh<2) return artImg; // e.g. an SVG with no intrinsic size — skip baking
    const s=Math.min(1,maxDim/Math.max(nw,nh));
    const w=Math.max(1,Math.round(nw*s)), h=Math.max(1,Math.round(nh*s));
    const base=document.createElement('canvas'); base.width=w; base.height=h;
    const b=base.getContext('2d');

    // 1) Warp — seamless cylinder curvature: the sides compress as the surface
    //    curves away, plus a faint vertical drape. Monotonic mapping ⇒ no seams.
    const k=warpAmountFor(group);
    const amp=h*0.045*k;
    if(k>0.05){
      const strips=80;
      for(let i=0;i<strips;i++){
        const u0=i/strips, u1=(i+1)/strips, um=(i+0.5)/strips;
        const dx0=cylMapX(u0,k)*w, dx1=cylMapX(u1,k)*w;
        const bow=Math.sin(Math.PI*um);            // 0 at edges, 1 in the centre
        const dy=amp*bow*0.5, dh=h-amp*bow;
        b.drawImage(artImg, u0*nw,0,(u1-u0)*nw,nh, dx0-0.5,dy,(dx1-dx0)+1,dh);
      }
    } else {
      b.drawImage(artImg,0,0,w,h);
    }

    // 2) Fabric texture — masked to the print, overlay-blended for a woven grain.
    const tex=getFabricTexture();
    const tc=document.createElement('canvas'); tc.width=w; tc.height=h;
    const tx=tc.getContext('2d');
    const pat=tx.createPattern(tex,'repeat'); tx.fillStyle=pat; tx.fillRect(0,0,w,h);
    tx.globalCompositeOperation='destination-in'; tx.drawImage(base,0,0);
    b.save(); b.globalCompositeOperation='overlay'; b.globalAlpha=0.18; b.drawImage(tc,0,0); b.restore();

    // 3) Sheen — soft diagonal light + opposite shade, masked to the print, for
    //    a printed-on-a-curved-surface highlight.
    const lc=document.createElement('canvas'); lc.width=w; lc.height=h;
    const lx=lc.getContext('2d');
    const grad=lx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,'rgba(255,255,255,0.40)');
    grad.addColorStop(0.5,'rgba(255,255,255,0)');
    grad.addColorStop(1,'rgba(0,0,0,0.26)');
    lx.fillStyle=grad; lx.fillRect(0,0,w,h);
    lx.globalCompositeOperation='destination-in'; lx.drawImage(base,0,0);
    b.save(); b.globalCompositeOperation='overlay'; b.globalAlpha=0.5; b.drawImage(lc,0,0); b.restore();

    return base;
  }catch{
    return artImg; // any failure → fall back to the flat artwork
  }
}
function swagMockupHost(ep,idx){
  // Keep the production mask as a normal DOM image. Konva mounts only the
  // artwork/controls above it, so an async canvas render cannot replace the
  // mask with the Shopify marketing image.
  const maskSrc=resolveMediaSrc(designImgUrl(ep));
  return `<div class="img img-mockup" style="position:relative;display:block;background:#fff;touch-action:none">
    ${productImg(ep,{width:'100%',height:'100%',url:maskSrc})}
    <div data-konva-mockup data-kidx="${idx}" style="position:absolute;inset:0"></div>
  </div>`;
}
function destroyMockupStages(){
  for(const s of __mockupStages){ try{ s.destroy(); }catch{} }
  __mockupStages=[];
}
// Resolve which products + artwork the live mockups should show for the
// current view. Swag artwork and kit branding share the same interactive canvas.
function mockupContext(){
  const f=S.flow;
  if(S.view==='swagArtwork'){
    if(!f.artwork||!f.artFile?.preview) return null;
    return { products:f.pickedProducts||[], artUrl:f.artFile.preview, store:(f.artPlacements=f.artPlacements||{}) };
  }
  if(S.view==='createKit'||S.view==='editKit'){
    if(!f.logoFile?.preview) return null;
    const catalog=getCatalogList();
    const products=(f.picked||[]).map((i)=>catalog[i]).filter(Boolean);
    return { products, artUrl:f.logoFile.preview, store:(f.kitPlacements=f.kitPlacements||{}) };
  }
  return null;
}
function mountKonvaMockups(){
  // Always tear down previous stages (the DOM hosts are gone after a re-render).
  destroyMockupStages();
  const ctx=mockupContext();
  if(!ctx) return;
  document.querySelectorAll('[data-konva-mockup]').forEach((host)=>{
    const idx=Number(host.dataset.kidx);
    const prod=ctx.products[idx];
    if(!prod) return;
    mountOneMockup(host,enrichProduct(prod),idx,ctx).catch(()=>{
      if(!host.isConnected) return;
      // The mask is already rendered by the parent; fall back to static guides.
      const ep=enrichProduct(prod);
      host.innerHTML=`${printAreaGuide(ep)}${productArtOverlay(ep,ctx.artUrl)}`;
    });
  });
}
function mockupPlacementKey(prod,idx){ return prod?.id||('idx'+idx); }
async function mountOneMockup(host,prod,idx,ctx){
  const Konva=await loadKonva();
  if(!host.isConnected) return;
  const size=host.clientWidth||host.offsetWidth;
  if(!size){
    // Host not laid out yet — retry once on the next frame, but never loop.
    const tries=Number(host.dataset.kretry||0);
    if(tries<3){ host.dataset.kretry=String(tries+1); requestAnimationFrame(()=>mountKonvaMockups()); }
    return;
  }
  const artImg=await loadImageEl(ctx.artUrl);

  if(!host.isConnected) return;
  host.innerHTML='';
  const stage=new Konva.Stage({container:host,width:size,height:size});
  const layer=new Konva.Layer();
  stage.add(layer);
  __mockupStages.push(stage);

  // Print area guide.
  const area=pickPrintArea(prod);
  const box=(area&&area.box&&area.box.widthPct)?area.box:{xPct:33,yPct:30,widthPct:34,heightPct:38};
  const bx=box.xPct/100*size, by=box.yPct/100*size;
  const bw=box.widthPct/100*size, bh=box.heightPct/100*size;
  layer.add(new Konva.Rect({x:bx,y:by,width:bw,height:bh,stroke:'rgba(21,120,76,.55)',strokeWidth:1.5,dash:[5,4],listening:false}));

  // Artwork node — origin at its centre so rotation pivots around the middle.
  const aspect=(artImg.naturalHeight||1)/(artImg.naturalWidth||1);
  const key=mockupPlacementKey(prod,idx);
  let pl=ctx.store[key];
  if(!pl){
    const fitW=Math.min(bw*0.92,(bh*0.92)/aspect);
    pl={xPct:(box.xPct+box.widthPct/2),yPct:(box.yPct+box.heightPct/2),wPct:(fitW/size*100),rot:0};
    ctx.store[key]=pl;
  }
  const w0=pl.wPct/100*size, h0=w0*aspect;
  // Bake warp + fabric texture + sheen into the print, then blend it onto the
  // garment with `multiply` so the garment's folds and shadows show through —
  // turning a flat sticker into ink that sits on the cloth.
  const realArt=buildRealisticArtwork(artImg,prod?.g);
  const node=new Konva.Image({
    image:realArt,
    x:pl.xPct/100*size, y:pl.yPct/100*size,
    width:w0, height:h0,
    offsetX:w0/2, offsetY:h0/2,
    rotation:pl.rot||0,
    draggable:true,
    globalCompositeOperation:'multiply',
    opacity:0.96,
  });
  layer.add(node);

  const tr=new Konva.Transformer({
    nodes:[node],
    rotateEnabled:true,
    keepRatio:true,
    enabledAnchors:['top-left','top-right','bottom-left','bottom-right'],
    rotationSnaps:[0,45,90,135,180,225,270,315],
    anchorSize:9,
    anchorStroke:'#15784C',
    borderStroke:'#15784C',
    boundBoxFunc:(o,n)=>(n.width<16||n.height<16?o:n),
  });
  layer.add(tr);

  function commit(){
    const nw=Math.max(16,node.width()*node.scaleX());
    const nh=Math.max(16,node.height()*node.scaleY());
    node.scaleX(1); node.scaleY(1);
    node.width(nw); node.height(nh);
    node.offsetX(nw/2); node.offsetY(nh/2);
    ctx.store[key]={
      xPct:node.x()/size*100,
      yPct:node.y()/size*100,
      wPct:nw/size*100,
      rot:Math.round(node.rotation()),
    };
    tr.forceUpdate();
    layer.batchDraw();
  }
  node.on('transformend',commit);
  node.on('dragend',commit);
  // Click empty stage to detach handles (visual only).
  stage.on('mousedown touchstart',(e)=>{ if(e.target===stage) tr.nodes([]); else tr.nodes([node]); layer.batchDraw(); });
  layer.draw();
}
function resolveMediaSrc(url){
  if(!url) return '';
  if(/^(https?:|data:|blob:)/i.test(url)) return url;
  return url.startsWith('/')?url:`/${url}`;
}
// Flatten mask + placed artwork (with the realistic warp/texture/sheen + the
// garment-fold multiply) into ONE PNG data URL, so a saved design is a single
// image we fetch as-is instead of re-compositing the mockup on every render.
async function bakeMockup(ep, artUrl, placement, size=1000){
  if(!artUrl) return '';
  try{
    const maskUrl=resolveMediaSrc(designImgUrl(ep));
    const [maskImg, artImg]=await Promise.all([
      maskUrl?loadImageEl(maskUrl).catch(()=>null):Promise.resolve(null),
      loadImageEl(artUrl),
    ]);
    const canvas=document.createElement('canvas'); canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext('2d');
    if(maskImg){
      const s=Math.min(size/maskImg.naturalWidth, size/maskImg.naturalHeight);
      const w=maskImg.naturalWidth*s, h=maskImg.naturalHeight*s;
      ctx.drawImage(maskImg,(size-w)/2,(size-h)/2,w,h);
    }
    const area=pickPrintArea(ep);
    const box=(area&&area.box&&area.box.widthPct)?area.box:{xPct:33,yPct:30,widthPct:34,heightPct:38};
    const aspect=(artImg.naturalHeight||1)/(artImg.naturalWidth||1);
    let pl=placement;
    if(!pl){
      const bw=box.widthPct/100*size, bh=box.heightPct/100*size;
      const fitW=Math.min(bw*0.92,(bh*0.92)/aspect);
      pl={xPct:box.xPct+box.widthPct/2, yPct:box.yPct+box.heightPct/2, wPct:fitW/size*100, rot:0};
    }
    const realArt=buildRealisticArtwork(artImg, ep?.g);
    const w0=pl.wPct/100*size, h0=w0*aspect;
    ctx.save();
    ctx.globalCompositeOperation='multiply';
    ctx.globalAlpha=0.96;
    ctx.translate(pl.xPct/100*size, pl.yPct/100*size);
    ctx.rotate((pl.rot||0)*Math.PI/180);
    ctx.drawImage(realArt, -w0/2, -h0/2, w0, h0);
    ctx.restore();
    return canvas.toDataURL('image/png');
  }catch{
    // Tainted canvas (CORS mask) or a load failure — fall back to live overlay.
    return '';
  }
}
async function swGenerate(){
  const f=S.flow;
  const catalog=getCatalogList();
  const placements=f.artPlacements||{};
  const artUrl=f.artFile?.preview||'';
  // Bake each designed product to a single flattened mockup once, up front.
  const baked=await Promise.all(f.picked.map((i,idx)=>{
    const cp=catalog[i];
    return bakeMockup(enrichProduct(cp), artUrl, placements[cp?.id||('idx'+idx)]||null);
  }));
  if(api.useMocks()){
    const col={id:nid('c'),code:'C'+(100000000+Math.floor(Math.random()*899999999)),name:f.colName,created:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),by:S.user.name,status:'ready',shopId:'',preferredColors:[],artworkUrl:artUrl,artPlacements:placements,products:f.picked.map((i,idx)=>{const cp=catalog[i];return{id:cp?.id,g:cp?.g||'tee',brand:cp?.brand||'',nm:cp?.nm||'Product',printAreas:cp?.printAreas,imgUrl:cp?.imgUrl,maskImageUrl:cp?.maskImageUrl,placement:placements[cp?.id||('idx'+idx)]||null,mockupUrl:baked[idx]||''};})};
    S.collections.push(col);
    go('swag');
    toast('Collection "'+col.name+'" is design-ready!');
    return;
  }
  try{
    S.loading=true; render();
    const mockups=f.picked.map((i,idx)=>({catalogProductId:String(catalog[i]?.id||''),dataUrl:baked[idx]||''})).filter(m=>m.catalogProductId&&m.dataUrl);
    const col=await api.createCollectionFlow({
      name:f.colName||'New collection',
      pickedIndices:f.picked,
      catalog,
      artwork:f.artFile?{file:f.artFile.file,preview:f.artFile.preview,name:f.artFile.name}:undefined,
      mockups,
    });
    col.by=S.user.name;
    // Show the freshly-baked mockups immediately even if a persist upload lagged.
    if(Array.isArray(col.products)) col.products.forEach((p,idx)=>{ if(!p.mockupUrl&&baked[idx]) p.mockupUrl=baked[idx]; });
    S.collections.push(col);
    S.loading=false;
    go('swag');
    toast('Collection "'+col.name+'" saved — use Add to shop when you\'re ready');
  }catch(err){
    S.loading=false; render();
    toast(err.message||'Failed to save collection');
  }
}

/* ---------- SEND POINTS ---------- */
function sendPointsStart(el){
  const returnState={view:S.view,nav:S.nav,flow:{...S.flow}};
  closeLayer();
  const shopId=(el&&el.dataset&&el.dataset.arg)||S.flow.shopId||(S.shops[0]&&S.shops[0].id);
  const defaultRecips=S.contacts.slice(0,2).map(c=>c.id);
  S.flow={exitTo:shopId?'shopDetail':'shops', exitToNav:'shops',returnState,shopId,step:0,ppr:1500,recips:100,orderName:'Order R'+(200000000+Math.floor(Math.random()*99999999)),selRecips:defaultRecips,from:'People Team, '+S.account,msg:'Appreciate your turnaround completing the key project, which is critical to company revenue.',when:'now',prevView:'landing'};
  go('sendPoints');
}
const SP_STEPS=['Budget','Recipients','Message','Checkout'];
Wizards.sendPoints=function(){
  const f=S.flow; const step=f.step;
  let body='';
  if(step===0){
    const points=(f.ppr/PT);
    body=`<div class="card" style="padding:24px;max-width:880px">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h1 style="font-size:24px">Send Points</h1><p class="muted">Points let recipients redeem items from your shop.</p></div><span class="tag tag-ready">₹2 = 1 Pt</span></div>
      <div class="divider"></div>
      <div class="row" style="gap:20px"><div class="field" style="flex:1"><label class="lbl">Name your order (internal)</label><input class="inp" id="sp-name" value="${esc(f.orderName)}"></div>
      <div class="field" style="flex:1"><label class="lbl">Number of recipients</label><input class="inp num" id="sp-recips" value="${f.recips}" data-act="spRecalc"></div></div>
      <label class="lbl">Budget per recipient (₹2 = 1 Pt)</label>
      <div class="row" style="align-items:center;gap:14px"><div class="inp-wrap" style="flex:1"><input class="inp num" id="sp-ppr" value="${f.ppr}" data-act="spRecalc"><span class="inp-suffix">INR</span></div>
        <div style="color:var(--ink-3)">${I.swap}</div>
        <div class="inp-wrap" style="flex:1"><input class="inp num" id="sp-pts" value="${(points).toFixed(2)}" readonly style="background:var(--surface-2)"><span class="inp-suffix">POINTS</span></div></div>
      <p class="mut3" style="font-size:12px;margin-top:8px">No minimum budget. Shipping included.</p></div>`;
  } else if(step===1){
    body=recipientPicker(f,'Add recipients',"Don't have all emails? You can add recipients later from the shop dashboard.");
  } else if(step===2){
    body=recipientExperience(f,{kind:'points'});
  } else {
    const sub=(f.ppr/PT)*f.recips*PT; const fee=sub*0.15; const tax=(sub+fee)*0.18; const total=sub+fee+tax;
    body=`<h1 style="font-size:24px;margin-bottom:16px">Checkout</h1>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        ${paymentPanel()}
        <div class="card" style="padding:22px;height:fit-content"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="font-size:18px">Order summary</h3><span class="tag tag-ready">₹2 = 1 Pt</span></div>
          ${sumRow('No. of recipients',f.recips)}
          ${sumRow('Points per recipient',(f.ppr/PT).toFixed(2)+' Pts')}
          ${sumRow('Total points purchased',((f.ppr/PT)*f.recips).toLocaleString('en-IN')+' Pts ('+inr(sub)+')')}
          ${sumRow('Service fee (15%)',inr(fee))}
          ${sumRow('Estimated GST (18%)',inr(tax))}
          <div class="lnk" style="font-size:12.5px;margin:8px 0" data-act="toast" data-arg="Promo applied">Apply promo code</div>
          <div class="divider"></div>
          <div class="row" style="justify-content:space-between;align-items:center"><b style="font-size:18px">You pay</b><b class="num" style="font-size:22px;font-family:var(--disp)">${inr(total)}</b></div>
          <button class="btn btn-brand btn-block btn-lg" style="margin-top:14px" data-act="sendPointsDo">Pay now</button></div></div>`;
  }
  const back = step>0?backLink('Back','spBack',null,{mb:'0'}):'<span></span>';
  const next = step<3?`<button class="btn btn-dark" data-act="spNext">Next</button>`:'<span></span>';
  return wzChrome('Send Points',SP_STEPS,step,body,back+next,{headerLabel:'Back',headerAction:'spExit'});
};
function spRecalc(){ const ppr=+document.getElementById('sp-ppr').value||0; document.getElementById('sp-pts').value=(ppr/PT).toFixed(2);
  S.flow.ppr=ppr; S.flow.recips=+document.getElementById('sp-recips').value||0; }
function spMsg(e){ S.flow.msg=e.target?e.target.value:''; const p=document.getElementById('sp-prev'); if(p)p.textContent=S.flow.msg; }
function spWhen(el){ S.flow.when=el.dataset.arg; render(); }
function spBack(){ if(S.flow.step===0){wzExit();return;} S.flow.step--; render(); }
function spExit(){
  const prev=S.flow.returnState;
  if(!prev){ wzExit(); return; }
  S.flow=prev.flow||{};
  go(prev.view||'shops',{nav:prev.nav||S.nav});
}
function spNext(){ const f=S.flow;
  if(f.step===0){ f.ppr=+document.getElementById('sp-ppr').value||0; f.recips=+document.getElementById('sp-recips').value||0; f.orderName=document.getElementById('sp-name').value; }
  if(f.step===2){ const fr=document.getElementById('re-from'); if(fr)f.from=fr.value; const m=document.getElementById('re-msg'); if(m)f.msg=m.value; }
  f.step++; render();
}
async function sendPointsDo(){
  const f=S.flow;
  const finishUi=(g)=>{
    S.flow.sentGifts=(S.flow.sentGifts||[]);
    go('shopDetail',{flow:{shopId:f.shopId,shopTab:'Sent Gifts',sentGifts:[g]},nav:'shops'});
    toast('Points sent to '+f.selRecips.length+' recipients! 🎉');
  };
  if(api.useMocks()){
    finishUi({name:f.orderName,by:S.user.name,ppr:(f.ppr/PT),recips:f.selRecips.length});
    return;
  }
  const entityId=S.primaryEntityId||(S.org.departments[0]&&S.org.departments[0].id);
  if(!entityId){ toast('No department budget found — complete wallet setup first'); return; }
  if(!f.shopId){ toast('Select a shop for this campaign'); return; }
  try{
    S.loading=true; render();
    const campaign=await api.launchPointsCampaignFlow({
      entityId:String(entityId),
      shopId:String(f.shopId),
      name:f.orderName||'Points campaign',
      creditsPerRecipient:f.ppr,
      message:{from:f.from||'',body:f.msg||''},
      contactIds:f.selRecips,
      contacts:S.contacts,
    });
    S.campaigns=(S.campaigns||[]);
    S.campaigns.unshift(campaign);
    await hydrateFromApi();
    S.loading=false;
    finishUi({name:f.orderName,by:S.user.name,ppr:(f.ppr/PT),recips:f.selRecips.length});
  }catch(err){
    S.loading=false; render();
    toast(err.message||'Failed to launch campaign');
  }
}

/* shared checkout bits */
function sumRow(k,v){ return `<div class="row" style="justify-content:space-between;padding:7px 0"><span class="muted" style="font-size:13px">${k}</span><span class="num" style="font-weight:600;font-size:13px">${v}</span></div>`; }
function paymentPanel(){
  const w=S.wallets[0]; const bal=w?w.balance:0; const sel=S.flow.pay||'wallet';
  const opt=(k,title,sub,extra)=>`<div class="pay-opt ${sel===k?'on':''}" data-act="payPick" data-arg="${k}"><div class="rd"></div><div style="flex:1"><div style="font-weight:600;font-size:13.5px">${title}</div><div class="mut3" style="font-size:11.5px">${sub}</div></div>${extra||''}</div>`;
  return `<div class="card" style="padding:22px">
    <h3 style="font-size:16px;margin-bottom:4px">Payment method</h3>
    <p class="muted" style="font-size:12.5px;margin-bottom:16px">Pay from your wallet balance, or add a new payment method.</p>
    ${opt('wallet',esc(w?w.name:'Wallet')+' balance',inr(bal)+' available',`<span class="tag tag-live"><span class="dot"></span>Ready</span>`)}
    ${opt('upi','UPI / Netbanking','Pay instantly via any UPI app or bank')}
    ${opt('card','Debit / credit card','Visa, Mastercard, RuPay, Amex')}
    ${sel==='card'?`<div class="field" style="margin-top:6px"><input class="inp" placeholder="Name on card"></div><div class="field"><input class="inp" placeholder="Card number"></div>`:''}
    <div class="field" style="margin-top:14px"><label class="lbl">Billing</label><div class="card" style="padding:11px 13px;font-size:12.5px;color:var(--ink-2)">Hyderabad, Telangana, IN · GSTIN 36AAAAA0000A1Z5 <span class="lnk" data-act="toast" data-arg="Edit billing in Settings">Edit</span></div></div>
  </div>`;
}
function payPick(el){ S.flow.pay=el.dataset.arg; render(); }

/* shared recipient picker (used by Send Points + Send Items) */
function recipientPicker(f,title,sub,opts={}){
  const rows=S.contacts.map(c=>{const on=f.selRecips.includes(c.id);return `<tr><td><div data-act="recToggle" data-arg="${c.id}" style="width:18px;height:18px;border:2px solid ${on?'var(--brand)':'#c4ccc6'};border-radius:4px;display:grid;place-items:center;background:${on?'var(--brand)':'#fff'};cursor:pointer">${on?'<span style="color:#fff;font-size:11px">✓</span>':''}</div></td>
    <td class="muted">${esc(c.email)}</td><td style="font-weight:600">${esc(c.name)}</td><td class="muted">${c.loc?esc(c.loc):'—'}</td></tr>`;}).join('');
  const modes = opts.modes? `<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      ${[['redeem','Recipients redeem','Recipients choose size, colour & shipping address from a private link.'],['surprise','Surprise recipients','Enter recipient details up front so gifts ship without input.'],['single','Single location','Ship all units to one office, event venue or address.']].map(([k,t,d])=>`<div class="optcard ${(f.mode||'redeem')===k?'on':''}" data-act="recMode" data-arg="${k}"><div class="rd"></div><div><h4>${t}</h4><p>${d}</p></div></div>`).join('')}</div>`:'';
  const loc=f.singleLocation||{};
  const singleForm=f.mode==='single'?`<div class="card" style="padding:20px;margin-bottom:18px">
      <h3 style="font-size:16px;margin-bottom:5px">Single delivery location</h3>
      <p class="muted" style="font-size:12.5px;margin-bottom:16px">All selected recipients' gifts will ship together to this address. A notification will be sent to the email below.</p>
      <div class="row"><div class="field" style="flex:1"><label class="lbl">Contact name</label><input class="inp" id="sl-name" data-act="singleLocLive" data-k="name" value="${esc(loc.name||'')}"></div>
      <div class="field" style="flex:1"><label class="lbl">Notification email</label><input class="inp" id="sl-email" type="email" data-act="singleLocLive" data-k="email" value="${esc(loc.email||'')}"></div>
      <div class="field" style="flex:1"><label class="lbl">Phone (optional)</label><input class="inp" id="sl-phone" data-act="singleLocLive" data-k="phone" value="${esc(loc.phone||'')}"></div></div>
      <div class="field"><label class="lbl">Address</label><input class="inp" id="sl-line1" data-act="singleLocLive" data-k="line1" value="${esc(loc.line1||'')}"></div>
      <div class="field"><label class="lbl">Address line 2 (optional)</label><input class="inp" id="sl-line2" data-act="singleLocLive" data-k="line2" value="${esc(loc.line2||'')}"></div>
      <div class="row"><div class="field" style="flex:1"><label class="lbl">City</label><input class="inp" id="sl-city" data-act="singleLocLive" data-k="city" value="${esc(loc.city||'')}"></div>
      <div class="field" style="flex:1"><label class="lbl">State</label><input class="inp" id="sl-state" data-act="singleLocLive" data-k="state" value="${esc(loc.state||'')}"></div>
      <div class="field" style="flex:1"><label class="lbl">PIN / Postal code</label><input class="inp" id="sl-pincode" data-act="singleLocLive" data-k="pincode" value="${esc(loc.pincode||'')}"></div>
      <div class="field" style="flex:1"><label class="lbl">Country</label><select class="inp" id="sl-country" data-act="singleLocLive" data-k="country"><option value="IN" ${(loc.country||'IN')==='IN'?'selected':''}>India</option><option value="AE" ${loc.country==='AE'?'selected':''}>UAE</option><option value="US" ${loc.country==='US'?'selected':''}>USA</option></select></div></div>
    </div>`:'';
  return `<h1 style="font-size:24px;margin-bottom:4px">${title}</h1><p class="muted" style="margin-bottom:18px">${sub}</p>
    ${modes}
    ${singleForm}
    <div class="card" style="padding:16px">
      <div class="row" style="gap:8px;margin-bottom:12px;align-items:center"><span class="tag tag-soft" style="background:var(--brand-50);color:var(--brand-d)">${f.selRecips.length} selected</span>
        <button class="btn btn-ghost btn-sm" data-act="recDeselect">Deselect all</button>
        <button class="btn btn-ghost btn-sm" data-act="toast" data-arg="Paste emails">Input emails</button><button class="btn btn-ghost btn-sm" data-act="toast" data-arg="Upload CSV">Add by CSV</button>
        <div class="search" style="flex:1">${I.search}<input style="height:36px" placeholder="Search by name or email" data-act="noop"></div></div>
      <table class="tbl"><thead><tr><th></th><th>Email</th><th>Name</th><th>Home address</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function recToggle(el){ const id=el.dataset.arg; const a=S.flow.selRecips; const i=a.indexOf(id); if(i<0)a.push(id); else a.splice(i,1); render(); }
function recDeselect(){ S.flow.selRecips=[]; render(); }
function recMode(el){ S.flow.mode=el.dataset.arg; render(); }
function singleLocLive(el){ S.flow.singleLocation=S.flow.singleLocation||{}; S.flow.singleLocation[el.dataset.k]=el.value; }

/* shared recipient-experience step: message editor + landing/email previews + scheduler */
function recipientExperience(f,opts={}){
  const shop=(S.shops.find(s=>s.id===f.shopId)||{}).name||'Rubix';
  const pv=f.prevView||'landing';
  const isPoints=opts.kind==='points';
  const mode=f.mode||'redeem';
  const shipMode = !isPoints && mode!=='redeem';   // surprise / single-location item sends ship directly
  const from=esc(f.from||'Your team');
  const msg=esc(f.msg||'');
  // ship-mode helpers
  const track='SM'+(740000000+Math.floor(Math.random()*9999999));
  const eta=new Date(Date.now()+5*86400000).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  const items=(f.picked?f.picked.length:3);
  const headline=isPoints?`You've been gifted ${(f.ppr/PT).toFixed(0)} Pts to ${esc(shop)}!`
    : shipMode?`Your gift from ${from} is on its way!`
    : `${from} sent you a gift!`;
  const cta=isPoints?'Redeem your points':shipMode?'Track your shipment':'Choose your gift';
  // tab labels + captions adapt to mode
  const tab1 = shipMode?'Tracking page':'Landing page';
  const tab2 = shipMode?'Shipping email':'Invitation email';
  const cap1 = shipMode?'Mobile tracking page recipients open to follow their parcel.':'Mobile-first redeem page recipients open from any device.';
  const cap2 = shipMode?'The shipping confirmation that lands in their inbox.':'The branded email that lands in their inbox.';
  const msgCaption = shipMode?'included in the shipping email & on the printed card':'shown on landing page & email';
  // tomorrow @ 10:00 default
  const tmrw=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const sched=f.sched||{date:tmrw,time:'10:00',tz:'Asia/Kolkata (IST)'};
  const shipBlock=`<div style="display:flex;justify-content:center;gap:8px;margin:10px 0"><span class="tag tag-live"><span class="dot"></span>Shipped</span><span class="tag tag-draft">ETA ${eta}</span></div>
      <div class="mut3" style="font-size:10px;font-weight:700">TRACKING ${track} · ${items} item${items>1?'s':''}</div>`;
  const landing = shipMode
    ? `<div class="phone"><div class="bar"><i></i></div>
        <div class="shopbanner dotted" style="height:96px;border-radius:0;display:grid;place-items:center"><div style="width:46px;height:46px;background:#fff;border-radius:10px;display:grid;place-items:center">${LOGO_DECO}</div></div>
        <div style="padding:18px;text-align:center">
          <div class="mut3" style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">A gift from ${from}</div>
          <h3 style="font-size:16px;margin:8px 0;line-height:1.25">${headline}</h3>
          ${shipBlock}
          <p class="muted" style="font-size:11.5px;margin-top:8px" id="re-prev-l">${msg}</p>
          <div class="btn btn-brand btn-block btn-sm" style="margin-top:12px;pointer-events:none">${cta}</div>
          <div class="mut3" style="font-size:9px;margin-top:8px">Powered by Shelf Merch</div></div></div>`
    : `<div class="phone"><div class="bar"><i></i></div>
        <div class="shopbanner dotted" style="height:96px;border-radius:0;display:grid;place-items:center"><div style="width:46px;height:46px;background:#fff;border-radius:10px;display:grid;place-items:center">${LOGO_DECO}</div></div>
        <div style="padding:18px;text-align:center">
          <div class="mut3" style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">${from} created a gift for you</div>
          <h3 style="font-size:16px;margin:8px 0;line-height:1.25">${headline}</h3>
          <p class="muted" style="font-size:11.5px" id="re-prev-l">${msg}</p>
          <div style="height:3px;border-radius:3px;margin:12px 0;background:linear-gradient(90deg,#7a3fb0,#2b54d6,#f5d000,#d33b30,#15784c)"></div>
          <div class="btn btn-brand btn-block btn-sm" style="pointer-events:none">${cta}</div>
          <div class="mut3" style="font-size:9px;margin-top:8px">Powered by Shelf Merch</div></div></div>`;
  const email=`<div class="email-frame"><div class="topline"><i></i><i></i><i></i><span class="mut3" style="font-size:10px;margin-left:6px">inbox · ${esc(shop)} ${shipMode?'shipping':'gift'}</span></div>
    <div class="shopbanner dotted" style="height:96px;border-radius:0;display:grid;place-items:center"><div style="width:46px;height:46px;background:#fff;border-radius:10px;display:grid;place-items:center">${LOGO_DECO}</div></div>
    <div style="padding:20px;text-align:center">
      <div class="mut3" style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">${shipMode?`${from} · shipping update`:`${from} sent you something`}</div>
      <h3 style="font-size:17px;margin:8px 0">${headline}</h3>
      ${shipMode?shipBlock:''}
      <div style="border:1px solid var(--line);border-radius:var(--r-sm);padding:14px;margin-top:6px"><p class="muted" style="font-size:12px" id="re-prev-e">${msg}</p>
        <div style="height:3px;border-radius:3px;margin:12px 0;background:linear-gradient(90deg,#7a3fb0,#2b54d6,#f5d000,#d33b30,#15784c)"></div>
        <div class="mut3" style="font-size:10px;font-weight:700">FROM ${esc((f.from||'').toUpperCase())}</div></div>
      <div class="btn btn-dark btn-block btn-sm" style="margin-top:12px;pointer-events:none">${cta}</div></div></div>`;
  return `<h1 style="font-size:24px;margin-bottom:4px">Recipient experience</h1>
    <p class="muted" style="margin-bottom:18px">${shipMode?'These gifts ship directly to recipients. Preview the tracking page and shipping email they receive.':'Craft the message and see exactly what recipients get — on the landing page and in their invitation email.'}</p>
    <div style="display:grid;grid-template-columns:420px 1fr;gap:28px">
      <div>
        <div class="card" style="padding:20px">
          <h3 style="font-size:15px;margin-bottom:10px">Your message</h3>
          <div class="field"><label class="lbl">From</label><input class="inp" id="re-from" value="${esc(f.from||'')}"></div>
          <div class="field"><label class="lbl">Message <span class="mut3" style="font-weight:400;text-transform:none;letter-spacing:0">${msgCaption}</span></label>
            <textarea class="inp" id="re-msg" rows="4" data-act="reMsg">${msg}</textarea></div>
        </div>
        <div class="card" style="padding:20px;margin-top:16px">
          <h3 style="font-size:15px;margin-bottom:10px">When should we send?</h3>
          <div class="optcard ${f.when==='now'?'on':''}" data-act="spWhen" data-arg="now"><div class="rd"></div><div><h4>${shipMode?'Ship immediately after payment':'Immediately after payment'}</h4></div></div>
          <div class="optcard ${f.when==='sched'?'on':''}" style="margin-top:10px" data-act="spWhen" data-arg="sched"><div class="rd"></div><div><h4>Schedule for later</h4><p>Pick a date, time & time zone</p></div></div>
          ${f.when==='sched'?`<div class="sched-grid">
            <div><label class="lbl">Date</label><input type="date" class="inp" value="${sched.date}" data-act="schedSet" data-k="date"></div>
            <div><label class="lbl">Time</label><input type="time" class="inp" value="${sched.time}" data-act="schedSet" data-k="time"></div>
            <div><label class="lbl">Time zone</label><select class="inp" data-act="schedSet" data-k="tz">${['Asia/Kolkata (IST)','Asia/Dubai (GST)','Europe/London (BST)','America/New_York (EDT)','Asia/Singapore (SGT)'].map(z=>`<option ${sched.tz===z?'selected':''}>${z}</option>`).join('')}</select></div></div>`:''}
          ${shipMode?'':`<div class="optcard ${f.when==='self'?'on':''}" style="margin-top:10px" data-act="spWhen" data-arg="self"><div class="rd"></div><div><h4>I'll share the invite link myself</h4></div></div>`}
        </div>
      </div>
      <div>
        <div class="row" style="justify-content:center;margin-bottom:16px"><div class="prevtabs">
          <button class="${pv==='landing'?'on':''}" data-act="prevTab" data-arg="landing">${tab1}</button>
          <button class="${pv==='email'?'on':''}" data-act="prevTab" data-arg="email">${tab2}</button></div></div>
        ${pv==='landing'?`<div style="max-width:300px;margin:0 auto">${landing}</div>`:`<div style="max-width:440px;margin:0 auto">${email}</div>`}
        <p class="mut3" style="text-align:center;font-size:11.5px;margin-top:14px">${pv==='landing'?cap1:cap2}</p>
      </div>
    </div>`;
}
function reMsg(e){ S.flow.msg=e.target?e.target.value:''; const l=document.getElementById('re-prev-l'), em=document.getElementById('re-prev-e'); if(l)l.textContent=S.flow.msg; if(em)em.textContent=S.flow.msg; }
function reNote(e){ S.flow.note=e.target?e.target.value:''; const p=document.getElementById('si-prev'); if(p)p.textContent=S.flow.note; }


/* catalog list — live API data only (no demo fallback when connected to API) */
function getCatalogList(){ return api.useMocks() ? DEMO_PRODUCTS : (S.catalogProducts || []); }

const SWAG_COLORS=[['Black','#1c1c1c'],['Blue','#2b54d6'],['Brown','#7a4a25'],['Green','#15784c'],['Gray','#9a9a9a'],['Navy','#1c2a52'],['Orange','#f59e0b'],['Pink','#f4aacb'],['Purple','#7a3fb0'],['Red','#d33b30'],['White','#ffffff'],['Yellow','#f5d000']];
const SWAG_COLOR_HEX=Object.fromEntries(SWAG_COLORS);
const DEFAULT_PRODUCT_COLOR_NAMES={
  hoodie:['Black','Navy','Blue','Green','Gray','Red'],
  tee:['Black','White','Navy','Blue','Red','Green','Gray','Yellow'],
  mug:['Black','White'],
  bottle:['Black','Blue','Green','Gray','Navy'],
  pack:['Black','Navy','Blue','Gray'],
  cap:['Black','Navy','Blue','Gray','Red'],
  note:['Black','Blue','Red','Green'],
  power:['Black','Blue','Gray'],
  pillow:['Black','Gray','Blue','Navy'],
  bag:['Black','Brown','Green','Navy'],
  default:['Black','White','Navy','Gray'],
};
function swagColorHex(name){ return SWAG_COLOR_HEX[name]||'#9a9a9a'; }
function isHexColor(s){ return /^#[0-9a-f]{6}$/i.test(String(s||'')); }
function productColorHex(p,name){
  if(p?.colorHexByName?.[name]) return p.colorHexByName[name];
  if(isHexColor(name)) return name;
  return swagColorHex(name);
}
function sortWhiteFirst(names){
  const i=names.findIndex(n=>String(n).toLowerCase()==='white');
  if(i<=0) return names;
  const out=[...names];
  const [w]=out.splice(i,1);
  return [w,...out];
}
function ensureWhitePrimaryNames(names){
  if(names.some(n=>String(n).toLowerCase()==='white')) return sortWhiteFirst(names);
  return ['White',...names];
}
function productColorNames(p){
  const ep=enrichProduct(p);
  if(ep?.colors?.length) return ep.colors;
  const names=DEFAULT_PRODUCT_COLOR_NAMES[ep?.g]||DEFAULT_PRODUCT_COLOR_NAMES.default;
  return ensureWhitePrimaryNames(names);
}
function collectionProductColorNames(col,p){
  const prefs=col?.preferredColors||[];
  const available=productColorNames(p);
  const names=prefs.length?prefs.filter(c=>!available.length||available.includes(c)):available;
  return names.length?names:available;
}
function primaryColorSel(){ return 0; }
function collectionProductSwatches(col,p){
  const ep=enrichProduct(p);
  const names=collectionProductColorNames(col,ep);
  const hexes=names.map(n=>productColorHex(ep,n));
  if(hexes.length) return hexes;
  return PRODUCT_COLOR_PALETTES[ep?.g]||PRODUCT_COLOR_PALETTES.default;
}

const PRODUCT_CATEGORIES={tee:'Apparel',hoodie:'Apparel',cap:'Apparel',bag:'Bags',bottle:'Drinkware',mug:'Drinkware',pack:'Bags',power:'Technology',pillow:'Health & Wellness',note:'Office'};
const PRODUCT_COLOR_PALETTES={
  hoodie:['#1c1c1c','#2d4a2d','#1c2a52','#6ba3c7','#6b7a4a','#1a3d2a','#3d3d3d','#2a6b6b','#4a5a7a'],
  tee:['#1c1c1c','#2b4a8b','#9a9a9a','#7a4a25','#15784c','#f4f4f4','#d33b30'],
  default:['#1c1c1c','#2b4a8b','#9a9a9a','#7a4a25','#15784c'],
};
const PRODUCT_DESCRIPTIONS={
  hoodie:'A comfortable fleece hoodie built for everyday wear. Features a soft interior, adjustable drawstring hood, and kangaroo pocket. Durable construction holds up wash after wash — ideal for corporate gifting, team swag, and employee recognition.',
  tee:'A premium cotton tee with a relaxed fit and smooth hand-feel. Reinforced shoulders and tear-away label make it perfect for branded decoration and bulk gifting programs.',
  bottle:'Insulated stainless steel bottle keeps drinks cold for 24 hours or hot for 12. Leak-proof lid and powder-coated finish stand up to daily use.',
  mug:'Glossy ceramic mug with a comfortable C-handle. Microwave and dishwasher safe — a classic choice for desk-side branding.',
  pack:'Structured backpack with padded straps and multiple compartments. Built for commuters and everyday carry with room for a laptop.',
  cap:'Structured twill cap with adjustable closure. Pre-curved visor and breathable panels for all-day comfort.',
  note:'Hard-cover notebook with rounded corners and elastic closure. Acid-free pages ready for notes, sketches, or meeting prep.',
  power:'Compact power bank with fast-charge USB-C output. Slim profile slips into a pocket or laptop sleeve.',
  pillow:'Memory foam neck pillow with washable cover. Lightweight and travel-ready for road warriors and remote teams.',
  bag:'Organic canvas tote with reinforced handles. Spacious main compartment for groceries, events, or conference swag.',
};
function productCategory(p){ return PRODUCT_CATEGORIES[p.g]||'Merch'; }
function productDescription(p){ return PRODUCT_DESCRIPTIONS[p.g]||'Premium branded merchandise ready for your collection. High-quality materials and professional decoration.'; }
function productUniqueId(col,pIdx){ const base=(col.code||'').replace(/\D/g,'').slice(-6)||'100000'; return base+String(pIdx+1).padStart(2,'0'); }
function resolveSavedProduct(colId,pIdx){
  const col=S.collections.find(c=>c.id===colId);
  if(!col) return null;
  const p=col.products[pIdx];
  if(!p) return null;
  return {col,p,pIdx};
}
function resolveProductDetail(){
  if(S.flow.productSource==='catalog'){
    const catalog=getCatalogList();
    const p=S.flow.catalogProductId
      ?catalog.find(item=>item.id===S.flow.catalogProductId)
      :catalog[S.flow.catalogProductIndex];
    if(!p) return null;
    return {col:null,p,pIdx:Math.max(0,catalog.indexOf(p)),isCatalog:true};
  }
  const saved=resolveSavedProduct(S.flow.colId,S.flow.pIdx);
  return saved?{...saved,isCatalog:false}:null;
}

const DEMO_PRODUCTS=[
  {g:'tee',brand:'Port & Company',nm:'Youth Core Cotton Tee',price:'as low as ₹180',sw:35,colors:['Black','White','Navy','Blue','Red','Green','Gray']},
  {g:'hoodie',brand:'Bella + Canvas',nm:'Sponge Fleece Pullover Hoodie',price:'as low as ₹1,150',sw:6,colors:['Black','Navy','Blue','Green','Gray','Red']},
  {g:'bottle',brand:'',nm:'The Standard Bottle',price:'₹890',sw:4,colors:['Black','Blue','Green','Gray','Navy']},
  {g:'mug',brand:'',nm:'Black Glossy Mug 11oz',price:'₹420',sw:3,colors:['Black','White']},
  {g:'pack',brand:'Mercer+Mettle',nm:'Commuter Backpack',price:'₹3,400',sw:4,colors:['Black','Navy','Blue','Gray']},
  {g:'cap',brand:'Decathlon',nm:'Structured Twill Cap',price:'₹640',sw:8,colors:['Black','Navy','Blue','Gray','Red']},
  {g:'note',brand:'Moleskine',nm:'Classic Hard Notebook',price:'₹1,120',sw:5,colors:['Black','Blue','Red','Green']},
  {g:'power',brand:'Ambrane',nm:'Xtreme-10 Power Bank',price:'as low as ₹1,426',sw:2,colors:['Black','Blue','Gray']},
  {g:'pillow',brand:'',nm:'Travel Neck Pillow',price:'₹540',sw:6,colors:['Black','Gray','Blue','Navy']},
  {g:'bag',brand:'ChangeBag',nm:'Organic Canvas Tote',price:'₹360',sw:7,colors:['Black','Brown','Green','Navy']},
  {g:'tee',brand:'Comfort Colors',nm:'Garment-Dyed Heavyweight Tee',price:'₹1,640',sw:61,colors:['Black','White','Navy','Blue','Red','Green','Gray','Yellow']},
  {g:'bottle',brand:'DeskMate',nm:'Steel Bottle 750ml',price:'₹689',sw:5,colors:['Black','Blue','Green','Gray','Navy']},
];

/* wizard chrome */
function wzChrome(title, steps, idx, body, foot, opts={}){
  return `<div style="height:100%;display:flex;flex-direction:column;background:var(--bg)">
    <div class="wzbar"><div class="title">${title}</div>
      <div class="wzsteps">${steps.map((s,i)=>`<div class="wzstep ${i<idx?'done':''} ${i===idx?'on':''}"><span class="b">${i<idx?'✓':i+1}</span>${s}</div>`).join('')}</div>
      ${backLink(opts.headerLabel||'Save and exit',opts.headerAction||'wzExit',null,{mb:'0'})}</div>
    <div class="main scroll" style="flex:1"><div style="max-width:1080px;margin:0 auto;padding:34px" class="fade-in">${body}</div></div>
    ${foot?`<div class="wzfoot">${foot}</div>`:''}</div>`;
}
function wzExit(){ go(S.flow.exitTo||'shops'); }

/* split overlay (create shop steps) */
function shopOverlay(rightHtml){
  return `<div style="height:100%;display:flex;flex-direction:column;background:#0E1E16">
    ${Shell('')==''?'':''}
    <div style="flex:1;display:grid;place-items:center;padding:24px">
      <div class="card" style="width:100%;max-width:980px;display:grid;grid-template-columns:1fr 1fr;overflow:hidden;box-shadow:var(--sh-3)">
        <div style="padding:48px 40px;display:flex;flex-direction:column;justify-content:center">
          <h1 style="font-size:40px;color:var(--brand);line-height:1.05">Let's create<br>your shop</h1>
          <p class="muted" style="margin-top:20px;max-width:34ch;line-height:1.55">Create a shop for gifting recipients and beyond. Total control over branding, banner and products.</p>
        </div>
        <div style="padding:40px 38px;background:var(--surface-2);border-left:1px solid var(--line)">${rightHtml}</div>
      </div></div></div>`;
}

/* ---------- CREATE WALLET ---------- */



/* ---------- CREATE SHOP (3 steps in split overlay) ---------- */
Wizards.createShop=function(){
  const f=S.flow; const step=(f.step|0)||0;
  if(step===0){
    const cur=f.shopCur||'Points';
    const opt=(k,t,d)=>`<button type="button" class="optcard ${cur===k?'on':''}" data-act="shopCur" data-arg="${k}" style="margin-bottom:10px;width:100%;text-align:left"><div class="rd"></div><div><h4>${t}</h4><p>${d}</p></div></button>`;
    const right=`<h3 style="font-size:19px;margin-bottom:16px">Shop details</h3>
      <div class="field"><label class="lbl">Shop name *</label><input class="inp" id="sh-name" value="${esc(f.shopName ?? '')}" placeholder="Enter shop name" autofocus></div>
      <div class="lbl">Choose currency</div>
      ${opt('Points','Points','₹2 = 1 Pt. Recipients redeem with points.')}
      ${opt('INR','Indian Rupee (₹)','Prices shown in rupees, GST inclusive.')}
      ${opt('Priceless','Priceless','Hide prices. Choose how many items recipients can redeem.')}
      <p class="mut3" style="font-size:11.5px;margin:6px 0 16px;line-height:1.5">Currency &amp; shop name can be edited from your dashboard. Currency can't change once an order starts.</p>
      <button type="button" class="btn btn-dark btn-block btn-lg" data-act="shopNext">Next</button>`;
    return shopOverlay(right);
  }
  // step 1: logo
  const uploaded=f.logo; const ltab=f.logoTab||'device';
  const tabs=`<div class="tabs" style="max-width:340px;margin:6px 0 16px">
    <button type="button" class="${ltab==='device'?'on':''}" data-act="shopLogoTab" data-arg="device">Upload from device</button>
    <button type="button" class="${ltab==='prev'?'on':''}" data-act="shopLogoTab" data-arg="prev">Previous uploads</button></div>`;
  let picker;
  if(ltab==='prev'){
    const prev=getLogoUploadsList();
    picker=prev.length
      ? `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:10px">${prev.map((u,i)=>shopPrevThumb(i,u,f.logoSel===i)).join('')}</div>`
      : `<div style="border:1.5px dashed var(--line);border-radius:var(--r);padding:30px;text-align:center;color:var(--ink-2);background:#fff"><div style="font-weight:600">No previous uploads yet</div><div class="mut3" style="font-size:11.5px;margin-top:8px">Upload a logo from your device — it will appear here for reuse.</div></div>`;
  } else if(uploaded){
    const lf=f.logoFile||{};
    const logoName=esc(lf.name||'logo');
    const logoMeta=esc(lf.sizeLabel||(lf.ext&&lf.size?lf.ext+' · '+fmtFileSize(lf.size):lf.ext||''));
    picker=`<div class="row" style="align-items:center;justify-content:space-between;border:1px solid var(--brand);border-radius:var(--r-sm);padding:12px 14px;background:var(--brand-50)"><div class="row" style="gap:10px;align-items:center"><div class="logo-chip" style="width:38px;height:38px;overflow:hidden;padding:4px">${shopLogoImg(f)}</div><div><div style="font-weight:600">${logoName}</div><div class="mut3" style="font-size:11px">${logoMeta}</div></div></div><button type="button" class="xbtn" data-act="shopLogoClear">✕</button></div>
      <label class="row" style="gap:9px;align-items:center;margin-top:14px;font-size:13px"><input type="checkbox" checked> I am authorised to use this logo *</label>`;
  } else {
    picker=`<div id="sh-logo-drop" style="border:1.5px dashed var(--line);border-radius:var(--r);padding:30px;text-align:center;color:var(--ink-2);background:#fff;cursor:pointer" data-act="shopLogoUpload">
      <input type="file" id="sh-logo-inp" accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg" style="display:none">
      <div style="font-weight:600">Drag and drop file</div>
      <div class="mut3" style="font-size:11.5px;margin:8px 0 4px">Accepted: SVG, PNG, WEBP, JPEG, JPG · Recommended 20px × 14px · Max 5 MB</div>
      <button type="button" class="btn btn-soft btn-sm" style="margin-top:12px" data-act="shopLogoUpload">Search local device</button></div>`;
  }
  const right=`<div style="margin-bottom:14px">${backLink('Back','shopCreateBack',null,{mb:'0'})}</div>
    <h3 style="font-size:22px;font-family:var(--disp)">Add your logo</h3><p class="muted" style="font-size:13px;margin:4px 0 6px">We'll use your logo to generate assets for your shop.</p>
    ${tabs}${picker}
    <div class="note" style="margin-top:14px">${I.help?'':''}Upload a high-quality, transparent-background logo (300 DPI+) to prevent production delays. <span class="lnk" data-act="toast" data-arg="Guidelines opened">Learn more</span></div>
    <div class="row" style="margin-top:18px"><button type="button" class="btn btn-ghost btn-block" data-act="shopBuildGo">Skip for now</button>
      <button type="button" class="btn btn-dark btn-block" ${uploaded?'':'disabled'} data-act="shopBuildGo">Create shop</button></div>`;
  return shopOverlay(right);
};
function createShopStart(){ S.flow={exitTo:'shops',step:0,shopCur:'Points',shopName:''}; go('createShop'); }
function shopCur(el){
  readCreateShopName();
  S.flow.shopCur=el.dataset.arg;
  S.flow.step=0;
  render();
}
function shopCreateBack(){
  readCreateShopName();
  S.flow.step=0;
  render();
}
function shopNext(){
  readCreateShopName();
  const name=(S.flow.shopName||'').trim();
  if(!name){ toast('Enter a shop name',false); return; }
  S.flow.shopName=name;
  S.flow.step=1;
  render();
}
const LOGO_ACCEPT=/\.(svg|png|webp|jpe?g)$/i;
const LOGO_MAX=5*1024*1024;
function fmtFileSize(b){ if(b<1024)return b+' B'; if(b<1024*1024)return (b/1024).toFixed(1)+' KB'; return (b/(1024*1024)).toFixed(1)+' MB'; }
function logoExt(name){ return (name.split('.').pop()||'').toUpperCase(); }
function shopLogoSetFile(file){
  if(!LOGO_ACCEPT.test(file.name)){ toast('Accepted formats: SVG, PNG, WEBP, JPEG, JPG',false); return; }
  if(file.size>LOGO_MAX){ toast('File must be 5 MB or smaller',false); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const entry={name:file.name,size:file.size,ext:logoExt(file.name),preview:reader.result};
    S.flow.logo=true;
    S.flow.logoFile=entry;
    S.logoUploads=S.logoUploads||[];
    const dup=S.logoUploads.findIndex(u=>u.name===entry.name&&u.size===entry.size);
    if(dup>=0) S.logoUploads.splice(dup,1);
    S.logoUploads.unshift(entry);
    if(S.logoUploads.length>12) S.logoUploads.length=12;
    render();
  };
  reader.readAsDataURL(file);
}
function shopLogoUpload(){ document.getElementById('sh-logo-inp')?.click(); }
function shopLogoClear(){ S.flow.logo=false; S.flow.logoFile=null; render(); }
function shopBuildGo(){ go('shopBuilder'); }

const BANNER_THEMES={
  light:{bg:'#FBFCFB',text:'#0E1E16',dots:false},
  brand:{bg:'linear-gradient(135deg,#15784C,#0E5536)',text:'#fff',dots:true},
  dark:{bg:'#0E1E16',text:'#fff',dots:true},
  blue:{bg:'linear-gradient(135deg,#2563C9,#1e40af)',text:'#fff',dots:true},
  purple:{bg:'linear-gradient(135deg,#7a3fb0,#5b21b6)',text:'#fff',dots:true},
};
function shopBannerBase(t){ return t.bg.startsWith('linear-gradient')?t.bg:`linear-gradient(${t.bg},${t.bg})`; }
function shopBannerStyle(f){
  const t=shopBannerCfg(f);
  if(t.dots) return `background-image:radial-gradient(rgba(255,255,255,.18) 1.4px,transparent 1.4px),${shopBannerBase(t)};background-size:14px 14px,auto;`;
  return `background:${t.bg};`;
}
function shopLogoImg(src){
  const url=src?.logoFile?.preview||src?.logoUrl;
  if(url) return `<img src="${url}" alt="Shop logo" style="max-width:100%;max-height:100%;object-fit:contain;display:block">`;
  return LOGO_DECO;
}
function shopThemeKey(src){ return src?.bannerTheme||src?.bannerConfig?.theme||'light'; }
function shopBannerCfg(src){ return BANNER_THEMES[shopThemeKey(src)]||BANNER_THEMES.light; }
function shopBannerClasses(src){ const t=shopBannerCfg(src); return 'shopbanner'+(t.dots?' shopbanner-merch':''); }
function shopBannerHtml(src,opts={}){
  const h=opts.height||96, logo=opts.logoSize||48, layout=opts.layout||'left', r=opts.radius??0;
  const logoPos=layout==='center'
    ?'left:50%;top:50%;transform:translate(-50%,-50%)'
    :'left:18px;top:50%;transform:translateY(-50%)';
  const extra=opts.extraStyle||'';
  return `<div class="${shopBannerClasses(src)}" style="height:${h}px;border-radius:${r}px;${shopBannerStyle(src)}${extra}">
    <div style="position:absolute;${logoPos};width:${logo}px;height:${logo}px;background:#fff;border-radius:12px;display:grid;place-items:center;overflow:hidden;padding:4px;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.12)">${shopLogoImg(src)}</div>
    ${opts.menu&&opts.shopId?`<button type="button" class="shopbanner-menu" data-act="shopEditOpen" data-arg="${opts.shopId}">${I.dots}</button>`:opts.menu?`<button type="button" class="shopbanner-menu" data-act="shopEditOpen">${I.dots}</button>`:''}
  </div>`;
}
function bannerThemePicker(cur,act){
  return Object.keys(BANNER_THEMES).map(k=>{ const t=BANNER_THEMES[k];
    const sw=t.dots?`background-image:radial-gradient(rgba(255,255,255,.18) 1.4px,transparent 1.4px),${shopBannerBase(t)};background-size:14px 14px,auto;`:`background:${t.bg};`;
    return `<button type="button" class="optcard ${cur===k?'on':''}" data-act="${act}" data-arg="${k}" style="padding:12px;text-align:center">
      <div style="height:40px;border-radius:8px;${sw}"></div>
      <div style="font-size:12px;margin-top:8px;font-weight:600;text-transform:capitalize">${k}</div></button>`; }).join('');
}
function shopEditPreview(ed){
  const s=S.shops.find(x=>x.id===ed.shopId)||{};
  return shopBannerHtml({...s,bannerConfig:{theme:ed.bannerTheme||'light'},logoUrl:ed.logoFile?.preview||ed.logoUrl||''},{height:108,layout:'center',logoSize:48,radius:10});
}
function shopEditOpen(el,shopId){
  const s=S.shops.find(x=>x.id===shopId);
  if(!s) return;
  S.flow.shopEdit={
    shopId,
    bannerTheme:shopThemeKey(s),
    logoUrl:s.logoUrl||'',
    logoFile:s.logoUrl?{preview:s.logoUrl,name:'logo'}:null,
  };
  renderShopEditModal();
}
function renderShopEditModal(){
  const ed=S.flow.shopEdit; if(!ed) return;
  const s=S.shops.find(x=>x.id===ed.shopId); if(!s) return;
  const cur=ed.bannerTheme||'light';
  const hasLogo=!!(ed.logoFile?.preview||ed.logoUrl);
  const logoPicker=hasLogo
    ?`<div class="row" style="align-items:center;justify-content:space-between;border:1px solid var(--brand);border-radius:var(--r-sm);padding:12px 14px;background:var(--brand-50)"><div class="row" style="gap:10px;align-items:center"><div class="logo-chip" style="width:42px;height:42px;overflow:hidden;padding:4px">${shopLogoImg({logoUrl:ed.logoFile?.preview||ed.logoUrl})}</div><div><div style="font-weight:600;font-size:13px">${esc(ed.logoFile?.name||'Shop logo')}</div><div class="mut3" style="font-size:11px">PNG, SVG, WEBP or JPEG · max 5 MB</div></div></div><button type="button" class="xbtn" data-act="shopEditLogoClear">✕</button></div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="shopEditLogoUpload">${I.upload}Replace logo</button>`
    :`<div id="shop-edit-logo-drop" style="border:1.5px dashed var(--line);border-radius:var(--r-sm);padding:24px;text-align:center;color:var(--ink-2);background:#fff;cursor:pointer" data-act="shopEditLogoUpload">
      <input type="file" id="shop-edit-logo-inp" accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg" style="display:none">
      <div style="font-weight:600">Upload shop logo</div>
      <div class="mut3" style="font-size:11.5px;margin:8px 0 12px">SVG, PNG, WEBP, JPEG · max 5 MB</div>
      <button type="button" class="btn btn-soft btn-sm" data-act="shopEditLogoUpload">Search local device</button></div>`;
  openModal(`<div class="modal-pad" style="max-width:560px"><div class="modal-h"><div><h3>Edit shop look</h3><p class="muted" style="font-size:13px;margin-top:4px">Update the banner and logo for <b>${esc(s.name)}</b>.</p></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <div style="margin:16px 0 20px;border-radius:var(--r);overflow:hidden;border:1px solid var(--line)">${shopEditPreview(ed)}</div>
    <div class="lbl">Banner theme</div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px">${bannerThemePicker(cur,'shopEditBannerTheme')}</div>
    <div class="lbl" style="margin-top:18px">Shop logo</div>
    <div style="margin-top:8px">${logoPicker}</div>
    ${hasLogo?'<input type="file" id="shop-edit-logo-inp" accept=".svg,.png,.webp,.jpeg,.jpg,image/svg+xml,image/png,image/webp,image/jpeg" style="display:none">':''}
    <div class="row" style="margin-top:22px"><button class="btn btn-ghost btn-block" data-act="closeLayer">Cancel</button><button class="btn btn-brand btn-block" data-act="shopEditSave">Save changes</button></div></div>`);
}
function shopEditBannerTheme(el,a){ if(!S.flow.shopEdit) return; S.flow.shopEdit.bannerTheme=a; renderShopEditModal(); }
function shopEditLogoUpload(){ document.getElementById('shop-edit-logo-inp')?.click(); }
function shopEditSetLogoFile(file){
  if(!S.flow.shopEdit) return;
  if(!LOGO_ACCEPT.test(file.name)){ toast('Accepted formats: SVG, PNG, WEBP, JPEG, JPG',false); return; }
  if(file.size>LOGO_MAX){ toast('File must be 5 MB or smaller',false); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const entry={name:file.name,size:file.size,ext:logoExt(file.name),preview:reader.result};
    S.flow.shopEdit.logoFile=entry;
    S.flow.shopEdit.logoUrl=entry.preview;
    S.logoUploads=S.logoUploads||[];
    S.logoUploads.unshift(entry);
    if(S.logoUploads.length>12) S.logoUploads.length=12;
    renderShopEditModal();
  };
  reader.readAsDataURL(file);
}
function shopEditLogoClear(){ if(!S.flow.shopEdit) return; S.flow.shopEdit.logoFile=null; S.flow.shopEdit.logoUrl=''; renderShopEditModal(); }
async function shopEditSave(){
  const ed=S.flow.shopEdit; if(!ed) return;
  const idx=S.shops.findIndex(x=>x.id===ed.shopId);
  if(idx<0){ closeLayer(); return; }
  const logoUrl=ed.logoFile?.preview||ed.logoUrl||'';
  const bannerConfig={theme:ed.bannerTheme||'light'};
  if(api.useMocks()){
    Object.assign(S.shops[idx],{logoUrl,bannerConfig});
  }else{
    try{
      const updated=await api.updateShopFlow(ed.shopId,{logoUrl,bannerConfig});
      S.shops[idx]={...S.shops[idx],...updated,logoUrl,bannerConfig};
    }catch(err){
      toast(err.message||'Failed to save shop changes',false);
      return;
    }
  }
  delete S.flow.shopEdit;
  closeLayer();
  toast('Shop look updated');
  render();
}
function shopCardMeta(s){
  const created=s.createdAt
    ?new Date(s.createdAt).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'})
    :new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const by=esc(s.createdBy||S.user.name);
  return `<div class="shop-card-meta"><span>Created: ${created}</span><span class="shop-card-sep">|</span><span>${by}</span><span class="shop-card-sep">|</span><span>${esc(s.currency)}</span></div>`;
}
function shopBannerEdit(){
  const cur=S.flow.bannerTheme||'light';
  openModal(`<div class="modal-pad"><div class="modal-h"><h3>Edit banner</h3><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:6px 0 16px">Choose a banner style for your shop.</p>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">${bannerThemePicker(cur,'shopBannerTheme')}</div></div>`);
}
function shopBannerTheme(el,a){ S.flow.bannerTheme=a; closeLayer(); render(); toast('Banner updated'); }

/* ---------- SHOP BUILDER ---------- */
Wizards.shopBuilder=function(){
  const f=S.flow;
  const bc=shopBannerCfg(f);
  const cats=[['Food & Beverages','mug'],['Work Essentials','note'],['Merch','tee'],['Life & Hobbies','cap'],['Wellness','bottle'],['Experiences','spark'],['Luxury','bag']];
  const sel=f.cats||['Food & Beverages','Work Essentials','Merch'];
  return `<div style="height:100%;display:flex;flex-direction:column;background:var(--bg)">
    <div style="height:60px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 22px;flex:none">
      ${backLink('Exit','wzExit',null,{mb:'0',light:true})}
      <span style="font-family:var(--disp);font-weight:800;font-size:18px;font-style:italic">Shelf Merch</span>
      <button class="btn btn-ghost btn-sm" data-act="shopPublish">Save &amp; publish</button></div>
    <div class="main scroll" style="flex:1">
      <div style="height:170px;border-radius:0;display:flex;align-items:center;justify-content:center;gap:24px;${shopBannerStyle(f)}">
        <div style="width:96px;height:96px;background:#fff;border-radius:16px;display:grid;place-items:center;overflow:hidden;padding:10px">${shopLogoImg(f)}</div>
        <div style="font-family:var(--disp);font-weight:800;font-size:40px;color:${bc.text}">${esc(f.shopName||'Your shop name')}</div>
        <button class="btn btn-soft btn-sm" data-act="shopBannerEdit">${I.edit}Edit banner</button></div>
      <div style="max-width:1000px;margin:0 auto;padding:30px 24px" class="fade-in">
        <h2 style="font-size:22px;margin-bottom:6px">Choose categories for your shop</h2>
        <p class="muted" style="margin-bottom:20px">Pick categories for recipients to shop from. After saving, you can enable/disable individual products.</p>
        <div class="grid" style="grid-template-columns:repeat(4,1fr)">${cats.map(([c,g])=>`<label class="optcard ${sel.includes(c)?'on':''}" data-act="catToggle" data-arg="${c}"><div style="width:18px;height:18px;border:2px solid ${sel.includes(c)?'var(--brand)':'#c4ccc6'};border-radius:4px;display:grid;place-items:center;background:${sel.includes(c)?'var(--brand)':'#fff'};flex:none">${sel.includes(c)?'<span style="color:#fff;font-size:12px">✓</span>':''}</div><div style="flex:1"><h4>${c}</h4></div><div style="width:40px;height:40px;border-radius:8px;background:var(--surface-2);display:grid;place-items:center;flex:none">${PG[g]||I.spark.replace('currentColor','#9aa39c')}</div></label>`).join('')}</div>
      </div></div></div>`;
};
function catToggle(el){ const c=el.dataset.arg; S.flow.cats=S.flow.cats||['Food & Beverages','Work Essentials','Merch'];
  const i=S.flow.cats.indexOf(c); if(i<0)S.flow.cats.push(c); else S.flow.cats.splice(i,1); render(); }
async function shopPublish(){
  const name=(S.flow.shopName||'').trim();
  if(!name){ toast('Enter a shop name',false); go('createShop',{flow:{step:0}}); return; }
  const currency=S.flow.shopCur||'Points', categories=S.flow.cats||['Food & Beverages','Work Essentials','Merch'];
  const logoUrl=S.flow.logoFile?.preview||'';
  const bannerConfig=S.flow.bannerTheme?{theme:S.flow.bannerTheme}:{};
  let s;
  if(api.useMocks()){
    s={id:nid('s'),name,currency,live:true,categories,collections:[],logoUrl,bannerConfig,createdAt:new Date().toISOString(),createdBy:S.user.name};
    S.shops.push(s);
  } else {
    try{
      S.loading=true; render();
      s=await api.createShopFlow({name,currency,categories,logoUrl,bannerConfig});
      S.shops.push(s);
    }catch(err){
      S.loading=false; render();
      toast(err.message||'Failed to publish shop');
      return;
    }
    S.loading=false;
  }
  go('shopDetail',{flow:{shopId:s.id,shopTab:'Branded Swag'},nav:'shops'});
  openModal(`<div class="modal-pad" style="text-align:center">
    ${shopBannerHtml(s,{height:130,layout:'center',logoSize:62,radius:14,extraStyle:'margin-bottom:18px;'})}
    <h3>Let's take a tour of your shop!</h3><p class="muted" style="margin-top:6px">Your "${esc(s.name)}" shop is live. Add branded swag, then send points.</p>
    <div class="row" style="margin-top:18px"><button class="btn btn-ghost btn-block" data-act="closeLayer">Done</button><button class="btn btn-dark btn-block" data-act="swagDesignerStart">Take a tour · Design swag</button></div></div>`);
}


/* shared renderers */
function catalogProductById(id){
  if(!id) return null;
  return getCatalogList().find(x=>x.id===id)||null;
}
function enrichProduct(p){
  if(!p) return p;
  const full=catalogProductById(p.id);
  if(!full) return p;
  return {
    ...p,
    printAreas:p.printAreas?.length?p.printAreas:full.printAreas,
    imgUrl:p.imgUrl||full.imgUrl,
    maskImageUrl:p.maskImageUrl||full.maskImageUrl,
    colors:p.colors?.length?p.colors:full.colors,
    colorHexByName:p.colorHexByName||full.colorHexByName,
    description:p.description||full.description,
    keyFeatures:p.keyFeatures||full.keyFeatures,
    sizeGuide:p.sizeGuide||full.sizeGuide,
  };
}
function normMediaPath(url){
  if(!url) return '';
  const path=String(url).replace(/^https?:\/\/[^/]+/i,'');
  return path.startsWith('/')?path:`/${path}`;
}
function pickPrintArea(p){
  const prod=enrichProduct(p);
  const areas=prod.printAreas;
  if(!areas?.length) return null;
  const full=catalogProductById(prod.id);
  const maskUrl=full?.maskImageUrl||prod.maskImageUrl;
  if(maskUrl){
    const maskNorm=normMediaPath(maskUrl);
    const maskArea=areas.find(a=>normMediaPath(a.mockupImageUrl)===maskNorm);
    if(maskArea) return maskArea;
  }
  const img=catalogImgUrl(prod);
  if(img){
    const imgNorm=normMediaPath(img);
    const match=areas.find(a=>normMediaPath(a.mockupImageUrl)===imgNorm);
    if(match) return match;
  }
  return areas.find(a=>a?.box?.widthPct>0)||areas[0];
}
function printAreaWrapStyle(box){
  const fit='box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;pointer-events:none';
  if(!box||!box.widthPct||!box.heightPct){
    return `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34%;height:34%;${fit}`;
  }
  return `position:absolute;left:${box.xPct}%;top:${box.yPct}%;width:${box.widthPct}%;height:${box.heightPct}%;${fit}`;
}
function printAreaGuide(p){
  const area=pickPrintArea(enrichProduct(p));
  if(!area?.box?.widthPct) return '';
  const b=area.box;
  return `<div style="position:absolute;left:${b.xPct}%;top:${b.yPct}%;width:${b.widthPct}%;height:${b.heightPct}%;border:1.5px dashed rgba(21,120,76,.55);border-radius:2px;pointer-events:none;box-sizing:border-box;z-index:1"></div>`;
}
function productArtOverlay(p,artworkUrl){
  const area=pickPrintArea(enrichProduct(p));
  const inner=collectionArtOverlay(artworkUrl);
  return `<div class="art-overlay" style="${printAreaWrapStyle(area?.box)}">${inner}</div>`;
}
function collectionArtOverlay(url){
  if(!url) return LOGO_DECO;
  return `<img class="art-overlay-img" src="${url}" alt="Artwork">`;
}
// A designed product renders as ONE baked image when available; otherwise it
// composites the mask base + artwork overlay live (fallback for un-baked data).
function designedMockupHtml(ep, artworkUrl, fill){
  if(ep?.mockupUrl) return `<img src="${esc(ep.mockupUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`;
  return `${productImg(ep,{...(fill?{width:'100%',height:'100%'}:{}),url:designImgUrl(ep)})}${productArtOverlay(ep,artworkUrl)}`;
}
function catalogImgUrl(p){
  if(p?.imgUrl) return p.imgUrl;
  if(p?.id) return getCatalogList().find(x=>x.id===p.id)?.imgUrl;
  return '';
}
function designImgUrl(p){
  if(p?.maskImageUrl) return p.maskImageUrl;
  if(p?.id){
    const full=getCatalogList().find(x=>x.id===p.id);
    if(full?.maskImageUrl) return full.maskImageUrl;
  }
  return '';
}
function productImg(p,opts={}){
  const url=opts.url||catalogImgUrl(p);
  const ph=PG[p?.g]||PG.tee;
  const size=opts.width?`width:${opts.width};height:${opts.height||opts.width};`:`width:${opts.width||'64%'};height:${opts.height||'64%'};`;
  if(!url) return ph;
  const src=String(url).replace(/"/g,'&quot;');
  const phHtml=ph.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  return `<img src="${src}" alt="" style="${size}object-fit:contain" onerror="this.onerror=null;this.outerHTML='${phHtml}'">`;
}
function productHasPrintArea(p){
  return Boolean(pickPrintArea(enrichProduct(p))?.box?.widthPct);
}
function pcard(p,opts={}){
  const sw = opts.swatches?`<div class="swatches">${['#1c1c1c','#2b4a8b','#9a9a9a','#7a4a25'].map(c=>`<span class="sw" style="background:${c}"></span>`).join('')}<span class="mut3" style="font-size:11px;align-self:center;margin-left:2px">+${opts.swatches}</span></div>`:'';
  const prod=enrichProduct(opts.product||p);
  const mockup=opts.branded||productHasPrintArea(prod);
  const inner=opts.branded?designedMockupHtml(prod,opts.artworkUrl,mockup):productImg(prod,mockup?{width:'100%',height:'100%'}:{});
  return `<div class="pcard" data-act="${opts.act||'noop'}" ${opts.arg?`data-arg="${opts.arg}"`:''}>
    <div class="img${mockup?' img-mockup':''}">${inner}</div>
    <div class="meta">${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div>${opts.price?`<div class="pr">${opts.price}</div>`:''}${sw}</div></div>`;
}

/* ===================== SHOPS ===================== */
function ViewShops(){
  if(!S.shops.length){
    return `<div class="page-h"><div><h1>Shops</h1><div class="sub">Branded storefronts your recipients shop from.</div></div>
      <button class="btn btn-brand" data-act="createShopStart">${I.plus}Create shop</button></div>
      <div class="card empty"><div class="ic">${I.shop.replace('currentColor','#cdd6cf')}</div><h3>No shops yet</h3><p>Create one to celebrate a moment.</p>
      <button class="btn btn-brand" style="margin-top:14px" data-act="createShopStart">Create your first shop</button></div>`;
  }
  const cards=S.shops.map(s=>`
    <div class="card shop-card" data-act="shopOpen" data-arg="${s.id}">
      ${shopBannerHtml(s,{height:132,layout:'center',menu:true,logoSize:52,shopId:s.id})}
      <div class="shop-card-body">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="font-size:17px">${esc(s.name)}</h3>
          ${s.live?'<span class="tag tag-live tag-live-outline"><span class="dot"></span>Live</span>':'<span class="tag tag-draft">Draft</span>'}
        </div>
        ${shopCardMeta(s)}
        <div style="margin-top:14px;text-align:right"><button class="btn btn-soft btn-sm" data-act="shopOpen" data-arg="${s.id}">Open</button></div>
      </div>
    </div>`).join('');
  return `<div class="page-h"><div><h1>Shops</h1><div class="sub">Branded storefronts your recipients redeem points in.</div></div>
    <div class="row" style="gap:8px"><button class="btn btn-ghost" data-act="toast" data-arg="Browse templates">Browse templates</button>
    <button class="btn btn-brand" data-act="createShopStart">${I.plus}Create shop</button></div></div>
    <div class="grid stagger" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${cards}</div>`;
}
const SHOP_TABS=['Branded Swag','Shop Catalog','Sent Gifts','Layout','Settings','Reports'];
function ViewShopDetail(){
  const s=S.shops.find(x=>x.id===S.flow.shopId)||S.shops[0];
  const tab=S.flow.shopTab||'Branded Swag';
  return `
  ${backLink('Back to shops','nav','shops')}
  <div class="row" style="align-items:center;gap:16px;margin-bottom:18px">
    <div style="width:160px;flex:none">${shopBannerHtml(s,{height:84,layout:'center',logoSize:46,radius:10})}</div>
    <div style="flex:1"><h1 style="font-size:26px">${esc(s.name)}</h1><div style="margin-top:6px">${s.live?'<span class="tag tag-live"><span class="dot"></span>Live</span>':''} ${s.live?`<span class="lnk" style="margin-left:8px" data-act="viewShop" data-arg="${s.id}">View shop</span>`:`<span class="mut3" style="margin-left:8px;font-size:13px">Publish to view shop</span>`}</div></div>
    <button class="btn btn-dark" data-act="sendPointsStart" data-arg="${s.id}">${I.coin}Send points</button>
  </div>
  <div class="tabs" style="margin-bottom:22px">${SHOP_TABS.map(t=>`<button class="${t===tab?'on':''}" data-act="shopTab" data-arg="${t}">${t}</button>`).join('')}</div>
  ${shopTabBody(s,tab)}`;
}
function shopTabBody(s,tab){
  if(tab==='Branded Swag'){
    const allCols=S.collections.filter(c=>collectionLinkedToShop(c,s.id));
    const activeCols=allCols.filter(c=>c.status!=='archived');
    const archivedCols=allCols.filter(c=>c.status==='archived');
    const sub=S.flow.swSub||'Saved Designs';
    const cols=sub==='Archived'?archivedCols:activeCols;
    const rail=`<div class="subrail">
      ${[['Saved Designs',activeCols.length],['Locker Inventory',''],['Archived',archivedCols.length]].map(([k,ct])=>`<div class="item ${sub===k?'on':''}" data-act="swSub" data-arg="${k}">${k}${ct!==''?`<span class="ct">${ct}</span>`:''}</div>`).join('')}</div>`;
    let content;
    if(sub==='Saved Designs'){
      const view=S.flow.swagView||'collection';
      content = !cols.length ? swagEmptyDesigner() : `<div class="card" style="padding:22px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:10px">
          <h3 style="font-size:17px">Your branded swag designs</h3>
          <div class="row" style="gap:8px;align-items:center">
            ${swagViewToggleHtml(view)}
            <button class="btn btn-ghost btn-sm" data-act="swagDesignerStart">${I.plus}Start designing</button>
          </div>
        </div>
        <p class="muted" style="font-size:13px;margin-bottom:18px">Add more logos to auto-generate additional collections for free. Toggle products with the eye icon, or request design tweaks from our team.</p>
        ${swagDesignsBody(cols,view)}</div>`;
    } else if(sub==='Locker Inventory'){
      const items=[['Mercer+Mettle Pack',42],['Bella + Canvas Hoodie',88],['Black Glossy Mug 11oz',120],['The Standard Bottle',64]];
      content=`<div class="card" style="padding:22px"><div class="row" style="justify-content:space-between;margin-bottom:14px"><h3 style="font-size:17px">Locker inventory</h3><button class="btn btn-ghost btn-sm" data-act="toast" data-arg="Reorder requested">Reorder low stock</button></div>
        <table class="tbl"><thead><tr><th>Item</th><th>In locker</th><th>Status</th><th></th></tr></thead><tbody>${items.map(([n,q])=>`<tr><td style="font-weight:600">${n}</td><td class="num">${q}</td><td>${q<50?'<span class="tag tag-warn"><span class="dot"></span>Low</span>':'<span class="tag tag-live"><span class="dot"></span>Healthy</span>'}</td><td style="text-align:right"><span class="lnk" data-act="toast" data-arg="Reorder requested">Reorder</span></td></tr>`).join('')}</tbody></table></div>`;
    } else {
      content=archivedCols.length
        ?`<div class="card" style="padding:22px">${swagCollectionView(archivedCols)}</div>`
        :`<div class="card empty"><div class="ic">${I.swag.replace('currentColor','#cdd6cf')}</div><h3>No archived designs</h3><p>Designs you archive will be stored here and can be restored any time.</p></div>`;
    }
    return `<div style="display:flex;gap:22px">${rail}<div style="flex:1">${content}</div></div>`;
  }
  if(tab==='Sent Gifts'){
    return `<div class="card" style="padding:22px">
      <div class="row" style="justify-content:space-between;margin-bottom:16px"><h3 style="font-size:17px">Sent gifts</h3>
        <div class="search" style="width:300px">${I.search}<input placeholder="Search by order name or number" data-act="noop"></div></div>
      <table class="tbl"><thead><tr><th>Gift name</th><th>Sent by</th><th>Budget/recipient</th><th>Status</th><th>Recipients</th><th></th></tr></thead>
      <tbody>${(S.flow.sentGifts||[]).length?S.flow.sentGifts.map(g=>`<tr><td style="font-weight:600">${esc(g.name)}</td><td class="muted">${esc(g.by)}</td><td class="num">${pts(g.ppr)}</td><td><span class="tag tag-live"><span class="dot"></span>Sent</span></td><td>${g.recips}</td><td style="text-align:right"><span class="lnk">View</span></td></tr>`).join('')
        :`<tr><td style="font-weight:600">Order R212828590</td><td class="muted">Jonna Madhavi</td><td class="num">742.21 Pts</td><td><span class="tag tag-warn"><span class="dot"></span>Incomplete</span></td><td>1 <span class="mut3">(99 seats left)</span></td><td style="text-align:right"><span class="lnk" data-act="sendPointsStart" data-arg="'+s.id+'">Finish sending</span></td></tr>`}</tbody></table>
      <div style="margin-top:14px"><span class="lnk-muted" style="color:var(--danger)" data-act="toast" data-arg="Incomplete order deleted">🗑 Delete incomplete order</span></div></div>`;
  }
  if(tab==='Shop Catalog'){
    const ps=getCatalogList().slice(0,8);
    return `<div class="banner" style="margin-bottom:16px">${I.spark.replace('width="24" height="24"','width="16" height="16"')}<div>These are the catalog products available to brand. Curate what your recipients see by creating designs in <b>Branded Swag → Start designing</b>.</div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${ps.map(p=>pcard(p,{price:p.price,swatches:p.sw})).join('')}</div>`;
  }
  if(tab==='Reports'){
    return `<div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
      ${[['Points sent','74,221'],['Points redeemed','38,540'],['Redemption rate','52%'],['Recipients','100']].map(([k,v])=>`<div class="card stat"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('')}</div>
      <div class="card" style="padding:22px"><h3 style="font-size:16px;margin-bottom:14px">Redemptions over time</h3>${miniChart()}</div>`;
  }
  return `<div class="card" style="padding:26px"><h3 style="font-size:17px;margin-bottom:8px">${tab}</h3><p class="muted">Configure ${tab.toLowerCase()} for ${esc(s.name)}. Banner, theme colours, custom domain and visibility live here.</p>
    <button class="btn btn-soft" style="margin-top:16px" data-act="toast" data-arg="${tab} saved">Edit ${tab.toLowerCase()}</button></div>`;
}
function swagEmptyDesigner(){
  const demo=[{g:'cap'},{g:'note'},{g:'pillow'},{g:'hoodie'},{g:'bag'},{g:'tee'},{g:'bottle'},{g:'mug'}];
  return `<div class="card" style="padding:26px">
    <div class="grid" style="grid-template-columns:repeat(8,1fr);margin-bottom:20px">${demo.map(p=>`<div style="aspect-ratio:1;border:1px solid var(--line);border-radius:var(--r-sm);display:grid;place-items:center;background:var(--surface-2)">${PG[p.g]}</div>`).join('')}</div>
    <div style="text-align:center"><h3 style="font-size:18px">Create swag collections instantly — no design skills required</h3>
    <p class="muted" style="margin:6px 0 16px">Choose your products, add your artwork, and build a branded collection that'll wow users.</p>
    <button class="btn btn-dark" data-act="swagDesignerStart">${I.plus}Start designing</button></div></div>`;
}
function swagViewToggleHtml(view){
  return `<div class="view-toggle">
    <button type="button" class="view-toggle-btn ${view==='product'?'on':''}" data-act="swagView" data-arg="product" title="View by product">${I.viewGrid}</button>
    <button type="button" class="view-toggle-btn ${view==='collection'?'on':''}" data-act="swagView" data-arg="collection" title="View by collection">${I.viewRows}</button>
  </div>`;
}
function collectionLinkedToShop(col, shopId){
  if(!col||!shopId) return false;
  const sid=String(shopId);
  const linked=(col.shopIds||[]).map(String);
  if(linked.length) return linked.includes(sid);
  return col.shopId===sid;
}
function swagDesignKey(col,p){
  return `${p.id||''}|${col.artworkUrl||''}|${p.nm}|${p.brand||''}`;
}
function shopHasDesign(shopId,col,p){
  const key=swagDesignKey(col,p);
  const cols=S.collections.filter(c=>collectionLinkedToShop(c,shopId));
  for(const shopCol of cols){
    for(const prod of shopCol.products||[]){
      if(swagDesignKey(shopCol,prod)===key) return true;
    }
  }
  return false;
}
function swagProductEntries(cols){
  const seen=new Set();
  const entries=[];
  for(const col of cols){
    for(let i=0;i<(col.products?.length||0);i++){
      const p=col.products[i];
      const key=swagDesignKey(col,p);
      if(seen.has(key)) continue;
      seen.add(key);
      entries.push({col,p,pIdx:i});
    }
  }
  return entries;
}
function swagCollectionsForTab(tab,shopId){
  let cols=S.collections.filter(c=>!shopId||collectionLinkedToShop(c,shopId));
  if(!shopId) cols=cols.filter(c=>!c.isShopSpecific);
  if(tab==='Archived') return cols.filter(c=>c.status==='archived');
  return cols.filter(c=>c.status!=='archived');
}
function swagProductCount(cols){ return swagProductEntries(cols).length; }
function swagProductRef(arg){
  const [colId,pIdxStr]=String(arg).split(':');
  const col=S.collections.find(c=>c.id===colId);
  const pIdx=+pIdxStr;
  const p=col?.products[pIdx];
  return col&&p?{col,p,pIdx,arg:`${colId}:${pIdx}`}:null;
}
function swagCardMenu(el,arg){
  const r=el.getBoundingClientRect();
  const left=Math.min(Math.max(8,r.right-210),window.innerWidth-218);
  const top=Math.min(r.bottom+6,window.innerHeight-140);
  document.getElementById('layer').innerHTML=`<div class="popover-scrim" data-scrim>
    <div class="card-menu" style="top:${top}px;left:${left}px">
      <button type="button" class="card-menu-item" data-act="swagCardEdit" data-arg="${arg}">Edit design <span class="tag tag-beta">Beta</span></button>
      <button type="button" class="card-menu-item" data-act="swagCardView" data-arg="${arg}">View product</button>
      <button type="button" class="card-menu-item" data-act="swagAddToShopOpen" data-arg="${arg}">Add to shop</button>
    </div></div>`;
}
function swagCardEdit(){
  closeLayer();
  toast('Design editor coming soon');
}
function swagCardView(el,arg){
  closeLayer();
  productOpen(arg);
}
function swagAddToShopOpen(el,arg){
  closeLayer();
  const ref=swagProductRef(arg);
  if(!ref) return;
  S.flow.addToShop={mode:'product',colId:ref.col.id,pIdx:ref.pIdx,shopId:null};
  renderAddToShopModal();
}
function collectionAddToShopOpen(el,colId){
  closeLayer();
  const col=S.collections.find(c=>c.id===colId);
  if(!col||col.status==='archived') return;
  if(!col.products?.length){
    toast('This collection has no products to add',false);
    return;
  }
  S.flow.addToShop={mode:'collection',colId:col.id,shopId:null};
  renderAddToShopModal();
}
function renderAddToShopModal(){
  const f=S.flow.addToShop;
  if(!f) return;
  const col=S.collections.find(c=>c.id===f.colId);
  const ref=f.mode==='collection'?null:swagProductRef(`${f.colId}:${f.pIdx}`);
  if(!col||f.mode!=='collection'&&!ref){ closeLayer(); return; }
  const shops=S.shops.filter(s=>s.live);
  const sel=f.shopId;
  const subject=f.mode==='collection'
    ?`all ${col.products.length} products from <b>${esc(col.name)}</b>`
    :`<b>${esc(ref.p.nm)}</b>`;
  const buttonLabel=f.mode==='collection'?'Add collection':'Add';
  const cards=shops.length?shops.map(s=>`
    <button type="button" class="shop-pick-card ${sel===s.id?'on':''}" data-act="swagAddToShopPick" data-arg="${s.id}">
      <div class="shop-pick-banner">${shopBannerHtml(s,{height:72,layout:'center',logoSize:34,radius:0,extraStyle:'border-radius:0;'})}</div>
      <div class="shop-pick-name">${esc(s.name)}</div>
    </button>`).join('')
    :`<div class="card empty" style="padding:30px;grid-column:1/-1"><p class="muted">No live shops yet. <span class="lnk" data-act="closeLayerToast" data-arg="Create a shop first">Create a shop</span> to add products.</p></div>`;
  openModal(`<div class="modal-pad"><div class="modal-h"><h3>Select your shop</h3><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:6px 0 18px">Choose a shop to add ${subject} to.</p>
    <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:12px">${cards}</div>
    <button class="btn btn-dark btn-block btn-lg" style="margin-top:22px" ${sel?'':'disabled'} data-act="swagAddToShopDo">${buttonLabel}</button></div>`);
}
function swagAddToShopPick(el,shopId){
  if(!S.flow.addToShop) return;
  S.flow.addToShop.shopId=shopId;
  const modal=el.closest('.modal');
  if(modal){
    modal.querySelectorAll('.shop-pick-card').forEach(c=>c.classList.toggle('on',c.dataset.arg===shopId));
    const addBtn=modal.querySelector('[data-act="swagAddToShopDo"]');
    if(addBtn) addBtn.disabled=false;
    return;
  }
  renderAddToShopModal();
}
function syncShopCollections(){
  for(const shop of S.shops){
    shop.collections=S.collections.filter(c=>collectionLinkedToShop(c,shop.id)).map(c=>c.id);
  }
}
function catalogIndexForProduct(p,catalog){
  if(p.id){ const i=catalog.findIndex(x=>x.id===p.id); if(i>=0) return i; }
  return catalog.findIndex(x=>x.g===p.g&&x.nm===p.nm&&(x.brand||'')===(p.brand||''));
}
async function swagAddToShopDo(){
  const f=S.flow.addToShop;
  if(!f?.shopId) return;
  const collectionMode=f.mode==='collection';
  const col=S.collections.find(c=>c.id===f.colId);
  const ref=collectionMode?null:swagProductRef(`${f.colId}:${f.pIdx}`);
  const shop=S.shops.find(s=>s.id===f.shopId);
  if(!col||!shop||!collectionMode&&!ref){ closeLayer(); return; }
  const p=ref?.p;
  const duplicate=collectionMode
    ?collectionLinkedToShop(col,shop.id)||col.products.some(product=>shopHasDesign(shop.id,col,product))
    :shopHasDesign(shop.id,col,p);
  if(duplicate){
    closeLayer();
    delete S.flow.addToShop;
    toast(collectionMode?'This collection or one of its products is already in this shop':'This product is already in this shop',false);
    render();
    return;
  }
  const linkCollection=collectionMode||col.products.length===1;
  try{
    if(api.useMocks()){
      if(linkCollection){
        col.shopIds=col.shopIds||[];
        if(col.shopId&&!col.shopIds.includes(col.shopId)) col.shopIds.push(col.shopId);
        if(!col.shopIds.includes(shop.id)) col.shopIds.push(shop.id);
        if(!col.shopId) col.shopId=shop.id;
      }else{
        S.collections.push({
          id:nid('c'),
          code:'C'+(100000000+Math.floor(Math.random()*899999999)),
          name:col.name,
          created:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),
          by:S.user.name,
          status:col.status||'ready',
          shopId:shop.id,
          shopIds:[shop.id],
          isShopSpecific:true,
          preferredColors:[...(col.preferredColors||[])],
          artworkUrl:col.artworkUrl||'',
          products:[{g:p.g,brand:p.brand||'',nm:p.nm,id:p.id}],
        });
      }
      syncShopCollections();
      closeLayer();
      delete S.flow.addToShop;
      toast(collectionMode?'Collection added to shop successfully!':'Product added to shop successfully!');
      render();
      return;
    }
    S.loading=true; render();
    const catalog=getCatalogList();
    if(linkCollection){
      const updated=await api.linkCollectionToShopFlow(col.id,shop.id);
      updated.by=col.by||S.user.name;
      const idx=S.collections.findIndex(c=>c.id===col.id);
      if(idx>=0) S.collections[idx]=updated;
      else S.collections.push(updated);
    }else{
      const created=await api.addProductToShopFlow({shopId:shop.id,collection:col,product:p,catalog});
      created.by=col.by||S.user.name;
      S.collections.push(created);
    }
    syncShopCollections();
    S.loading=false;
    closeLayer();
    delete S.flow.addToShop;
    toast(collectionMode?'Collection added to shop successfully!':'Product added to shop successfully!');
    render();
  }catch(err){
    S.loading=false;
    render();
    toast(err.message||(collectionMode?'Failed to add collection to shop':'Failed to add product to shop'),false);
  }
}
function swagDesignCard(col,p,pIdx){
  const ep=enrichProduct(p);
  const names=collectionProductColorNames(col,ep);
  const sw=names.slice(0,4).map(c=>`<span class="sw" style="background:${productColorHex(ep,c)}" title="${esc(c)}"></span>`).join('');
  const more=names.length>4?`<span class="mut3" style="font-size:10px;align-self:center">+${names.length-4}</span>`:'';
  const arg=`${col.id}:${pIdx}`;
  const mock=productHasPrintArea(ep);
  return `<div class="pcard swag-design-card" data-act="productOpen" data-arg="${arg}">
    <div class="img${mock?' img-mockup':''}">${designedMockupHtml(ep,col.artworkUrl,mock)}
      <div class="swag-card-actions">
        <button type="button" class="swag-card-menu" data-act="swagCardMenu" data-arg="${arg}">${I.dots}</button>
      </div>
    </div>
    <div class="meta">${(sw||more)?`<div class="swatches">${sw}${more}</div>`:''}${p.brand?`<div class="brand">${esc(p.brand)}</div>`:''}<div class="nm">${esc(p.nm)}</div></div>
  </div>`;
}
function swagProductGrid(cols){
  const entries=swagProductEntries(cols);
  if(!entries.length) return `<div class="card empty"><h3>No products yet</h3><p>Start designing to add branded products to your swag.</p></div>`;
  return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${entries.map(({col,p,pIdx})=>swagDesignCard(col,p,pIdx)).join('')}</div>`;
}
function swagCollectionView(cols){
  if(!cols.length) return `<div class="card empty"><h3>No collections yet</h3><p>Create a collection to group your branded products together.</p></div>`;
  return cols.map(c=>collectionBlock(c)).join('');
}
function swagDesignsBody(cols,view){
  return view==='product'?swagProductGrid(cols):swagCollectionView(cols);
}
function applyCollectionUpdate(updated){
  const idx=S.collections.findIndex(c=>c.id===updated.id);
  const prev=idx>=0?S.collections[idx]:null;
  const merged={...updated, by:updated.by||prev?.by||S.user.name};
  if(idx>=0) S.collections[idx]=merged;
  else S.collections.push(merged);
  syncShopCollections();
  render();
}
function removeCollection(colId){
  S.collections=S.collections.filter(c=>c.id!==colId);
  syncShopCollections();
  render();
}
function collectionMenu(el,colId){
  const col=S.collections.find(c=>c.id===colId);
  if(!col) return;
  const r=el.getBoundingClientRect();
  const left=Math.min(Math.max(8,r.right-210),window.innerWidth-218);
  const top=Math.min(r.bottom+6,window.innerHeight-180);
  const archived=col.status==='archived';
  const items=archived
    ?`<button type="button" class="card-menu-item" data-act="collectionRestore" data-arg="${colId}">Restore to saved designs</button>
      <button type="button" class="card-menu-item" data-act="collectionDelete" data-arg="${colId}" style="color:var(--danger)">Delete permanently</button>`
    :`<button type="button" class="card-menu-item" data-act="collectionAddToShopOpen" data-arg="${colId}">Add collection to shop</button>
      <button type="button" class="card-menu-item" data-act="collectionArchive" data-arg="${colId}">Archive collection</button>
      <button type="button" class="card-menu-item" data-act="collectionDelete" data-arg="${colId}" style="color:var(--danger)">Delete collection</button>`;
  document.getElementById('layer').innerHTML=`<div class="popover-scrim" data-scrim>
    <div class="card-menu" style="top:${top}px;left:${left}px">${items}</div></div>`;
}
async function collectionArchive(colId){
  closeLayer();
  const col=S.collections.find(c=>c.id===colId);
  if(!col) return;
  if(api.useMocks()){
    col.status='archived';
    syncShopCollections();
    render();
    toast('Collection archived');
    return;
  }
  try{
    const updated=await api.archiveCollectionFlow(colId);
    updated.by=col.by||S.user.name;
    applyCollectionUpdate(updated);
    toast('Collection archived');
  }catch(err){
    toast(err.message||'Failed to archive collection',false);
  }
}
async function collectionRestore(colId){
  closeLayer();
  const col=S.collections.find(c=>c.id===colId);
  if(!col) return;
  if(api.useMocks()){
    col.status=col.artworkUrl?'ready':'draft';
    syncShopCollections();
    render();
    toast('Collection restored');
    return;
  }
  try{
    const updated=await api.restoreCollectionFlow(colId);
    updated.by=col.by||S.user.name;
    applyCollectionUpdate(updated);
    toast('Collection restored');
  }catch(err){
    toast(err.message||'Failed to restore collection',false);
  }
}
async function collectionDelete(colId){
  closeLayer();
  const col=S.collections.find(c=>c.id===colId);
  if(!col) return;
  if(!confirm(`Delete "${col.name}"? This cannot be undone.`)) return;
  if(api.useMocks()){
    removeCollection(colId);
    toast('Collection deleted');
    return;
  }
  try{
    await api.deleteCollectionFlow(colId);
    removeCollection(colId);
    toast('Collection deleted');
  }catch(err){
    toast(err.message||'Failed to delete collection',false);
  }
}
function collectionBlock(c){
  const productLabel=c.products.length===1?'Product':'Products';
  const statusTag=c.status==='archived'
    ?'<span class="tag tag-draft">Archived</span>'
    :'<span class="tag tag-ready">Design ready</span>';
  return `<div class="swag-collection-block">
    <div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:12px">
      <div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
          <h3 style="font-size:17px">${esc(c.name)}</h3>
          <span class="mut3" style="font-size:12px">#${c.code}</span>
          <span class="pd-icon pd-icon-bulb" style="width:22px;height:22px" title="Design tip">${I.bulb}</span>
        </div>
        <div class="mut3" style="font-size:12px">Created on ${c.created} by ${esc(c.by)} · ${c.products.length} ${productLabel}</div>
      </div>
      <div class="row" style="gap:8px;align-items:center;flex:none">
        ${statusTag}
        <button type="button" class="iconbtn" style="width:30px;height:30px" data-act="toast" data-arg="Share link copied">${I.share}</button>
        <button type="button" class="iconbtn" style="width:30px;height:30px" data-act="collectionMenu" data-arg="${c.id}">${I.dots}</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${c.products.map((p,i)=>swagDesignCard(c,p,i)).join('')}</div>
  </div>`;
}

/* ===================== SWAG ===================== */
function ViewSwag(){
  const tab=S.flow.swagTab||'All Products';
  const view=S.flow.swagView||(tab==='All Products'?'product':'collection');
  const cols=swagCollectionsForTab(tab);
  const count=swagProductCount(cols);
  const tabLabels={ 'All Products':`All Products (${count})`, 'Saved Designs':'Saved Designs', 'Archived':'Archived' };
  const toolbar=`<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:22px;flex-wrap:wrap;gap:12px">
    <div class="tabs" style="flex:1;min-width:280px;max-width:520px">${['All Products','Saved Designs','Archived'].map(t=>`<button class="${t===tab?'on':''}" data-act="swagTab" data-arg="${t}">${tabLabels[t]}</button>`).join('')}</div>
    ${swagViewToggleHtml(view)}
  </div>`;
  const body=tab==='Archived'&&!cols.length
    ?`<div class="card empty"><div class="ic">${I.swag.replace('currentColor','#cdd6cf')}</div><h3>No archived designs</h3><p>Designs you archive will be stored here and can be restored any time.</p></div>`
    :swagDesignsBody(cols,view);
  return `<div class="page-h"><div><h1>Swag</h1><div class="sub">Your designed collections and the full catalog you can build from.</div></div>
    <div class="row" style="gap:8px"><button class="btn btn-ghost" data-act="swagDesignerStart">${I.plus}Start designing</button>
    <button class="btn btn-dark" data-act="nav" data-arg="catalog">Purchase swag</button></div></div>
    ${toolbar}${body}`;
}

/* ===================== PRODUCT DETAIL ===================== */
function ViewProductDetail(){
  const ctx=resolveProductDetail();
  if(!ctx){
    const missingCatalog=S.flow.productSource==='catalog';
    return `<div class="card empty"><h3>Product not found</h3><p>${missingCatalog?'This catalog product is no longer available.':'This design may have been removed from your collection.'}</p>
      <div style="margin-top:14px">${backLink(missingCatalog?'Back to catalog':'Back to saved designs','productBack',null,{mb:'0'})}</div></div>`;
  }
  const {col,p,pIdx,isCatalog}=ctx;
  const colorNames=isCatalog?productColorNames(p):collectionProductColorNames(col,p);
  const colors=isCatalog?colorNames.map(name=>productColorHex(p,name)):collectionProductSwatches(col,p);
  const sel=Math.min(S.flow.selColor||0,colors.length-1);
  const desc=isCatalog?String(p.description||''):productDescription(p);
  const short=desc.length>180&&!S.flow.descExpanded?desc.slice(0,180).trim()+'…':desc;
  const keyFeatures=isCatalog?String(p.keyFeatures||''):'';
  const sizeGuide=isCatalog?String(p.sizeGuide||''):'';
  const detailText=value=>esc(value).replace(/\n/g,'<br>');
  const detailTab=isCatalog?(S.flow.productDetailTab||'description'):'description';
  const detailRows=value=>String(value||'').split('\n').map(line=>{
    const split=line.indexOf(':');
    return split>0?[line.slice(0,split).trim(),line.slice(split+1).trim()]:[line.trim(),''];
  }).filter(([label,value])=>label||value);
  const featureRows=detailRows(keyFeatures);
  const sizeRows=detailRows(sizeGuide).filter(([label])=>!/^feature$/i.test(label));
  const detailTabs=isCatalog?`<div class="pd-detail-tabs" role="tablist" aria-label="Product information">
    ${[['description','Description'],['features','Key features'],['size','Size Guide']].map(([key,label])=>`<button type="button" class="${detailTab===key?'on':''}" role="tab" aria-selected="${detailTab===key?'true':'false'}" data-act="productDetailTab" data-arg="${key}">${label}</button>`).join('')}
  </div>`:'';
  const descriptionPanel=`<div class="pd-tab-panel pd-description-panel${detailTab==='description'?' on':''}" role="tabpanel" data-product-panel="description">
      <p>${detailText(short)}</p>
      ${desc.length>180?`<span class="lnk" data-act="productDescToggle">${S.flow.descExpanded?'See less':'See more'}</span>`:''}
    </div>`;
  const featuresPanel=`<div class="pd-tab-panel${detailTab==='features'?' on':''}" role="tabpanel" data-product-panel="features"><div class="pd-feature-card">
        ${featureRows.map(([label,value])=>`<div class="pd-feature-row"><div>${esc(label)}</div><div>${detailText(value)}</div></div>`).join('')}
      </div></div>`;
  const sizePanel=`<div class="pd-tab-panel${detailTab==='size'?' on':''}" role="tabpanel" data-product-panel="size"><div class="pd-size-table">
      <div class="pd-size-head"><div>Feature</div><div>Details</div></div>
      ${sizeRows.map(([label,value])=>`<div class="pd-size-row"><div>${esc(label)}</div><div>${detailText(value)}</div></div>`).join('')}
    </div></div>`;
  const detailPanels=`${descriptionPanel}${featuresPanel}${sizePanel}`;
  const title=p.brand?`${esc(p.brand)} ${esc(p.nm)}`:esc(p.nm);
  const ep=enrichProduct(p);
  const imgBg=colors[sel]||'#f4f6f4';
  const backLabel=isCatalog?'Back to catalog':S.flow.productBackView==='shopDetail'?'Back to shop':'Back to saved designs';
  const uniqueId=isCatalog?(p.id?String(p.id).slice(-8).toUpperCase():String(pIdx+1).padStart(8,'0')):productUniqueId(col,pIdx);
  const notes=isCatalog?'Ready to customize with your artwork':`Internal notes for ${esc(col.name)}`;
  return `<div class="pd-page fade-in">
    ${backLink(backLabel,'productBack',null,{mb:'22px'})}
    <div class="pd-header">
      <div class="pd-title-wrap">
        <h1 class="pd-title">${title}</h1>
        <div class="pd-title-icons">
          <span class="pd-icon pd-icon-bulb" title="Design tip">${I.bulb}</span>
          <span class="pd-icon" title="Ships from India">🇮🇳</span>
        </div>
      </div>
      <div class="pd-actions">
        <button class="iconbtn" data-act="toast" data-arg="Preview opened">${I.eye}</button>
        <button class="iconbtn" data-act="toast" data-arg="More options">${I.dots}</button>
        <button class="btn btn-ghost btn-sm" data-act="toast" data-arg="Design editor coming soon">${I.edit}Edit design <span class="tag tag-beta">Beta</span></button>
        <button class="btn-purchase" data-act="productPurchase">Purchase ${I.arrow}</button>
      </div>
    </div>
    <div class="pd-body">
      <div class="pd-gallery">
        <div class="pd-img" style="background:${imgBg}">
          <div class="pd-img-inner pd-img-mockup">${isCatalog?productImg(ep,{width:'100%',height:'100%'}):designedMockupHtml(ep,col.artworkUrl,true)}
          </div>
          <button class="pd-zoom" data-act="toast" data-arg="Image zoom coming soon">${I.zoom}</button>
        </div>
      </div>
      <div class="pd-info">
        <div class="pd-colors">
          <div class="lbl" style="margin-bottom:10px">Color</div>
          <div class="pd-swatches">${colors.map((c,i)=>`<button type="button" class="pd-sw ${i===sel?'on':''}" style="background:${c}" data-color="${c}" data-act="productColor" data-arg="${i}" title="${esc(colorNames[i]||'Colour '+(i+1))}" aria-pressed="${i===sel?'true':'false'}"></button>`).join('')}</div>
        </div>
        <table class="pd-meta">
          <tbody>
            <tr><th>Unique ID</th><td class="num">${uniqueId}</td></tr>
            <tr><th>Category</th><td>${productCategory(p)}</td></tr>
            <tr><th>Notes</th><td class="muted">${notes}</td></tr>
          </tbody>
        </table>
        ${isCatalog?`${detailTabs}${detailPanels}`:`<div class="pd-desc">
          <div class="lbl" style="margin-bottom:10px">Product description</div>
          <p>${detailText(short)}</p>
          ${desc.length>180?`<span class="lnk" data-act="productDescToggle">${S.flow.descExpanded?'See less':'See more'}</span>`:''}
        </div>`}
      </div>
    </div>
  </div>`;
}
function productOpen(arg){
  const [colId,pIdxStr]=String(arg).split(':');
  const pIdx=+pIdxStr;
  const col=S.collections.find(c=>c.id===colId);
  if(!col||!col.products[pIdx]){ toast('Product not found',false); return; }
  delete S.flow.productSource;
  delete S.flow.catalogProductId;
  delete S.flow.catalogProductIndex;
  const backView=S.view==='shopDetail'?'shopDetail':'swag';
  const backFlow=backView==='shopDetail'
    ?{shopId:S.flow.shopId,shopTab:'Branded Swag',swSub:'Saved Designs'}
    :{swagTab:'Saved Designs'};
  go('productDetail',{nav:S.nav,flow:{...S.flow,colId,pIdx,selColor:primaryColorSel(),descExpanded:false,productBackView:backView,productBackFlow:backFlow}});
}
function catalogProductOpen(arg){
  const index=Number(arg);
  const p=getCatalogList()[index];
  if(!p){ toast('Product not found',false); return; }
  delete S.flow.colId;
  delete S.flow.pIdx;
  go('productDetail',{nav:'catalog',flow:{...S.flow,productSource:'catalog',catalogProductId:p.id||null,catalogProductIndex:index,selColor:primaryColorSel(),descExpanded:false,productDetailTab:'description',productBackView:'catalog',productBackFlow:{catCat:S.flow.catCat||'All Products'}}});
}
function productBack(){
  const view=S.flow.productBackView||'swag';
  const extra=S.flow.productBackFlow||{};
  const flow={...S.flow,...extra};
  delete flow.colId; delete flow.pIdx; delete flow.selColor; delete flow.descExpanded; delete flow.productDetailTab;
  delete flow.productSource; delete flow.catalogProductId; delete flow.catalogProductIndex;
  delete flow.productBackView; delete flow.productBackFlow;
  go(view,{nav:S.nav,flow});
}
function productColor(el){
  const index=Number(el.dataset.arg);
  if(!Number.isFinite(index)) return;
  S.flow.selColor=index;
  document.querySelectorAll('.pd-swatches .pd-sw').forEach((sw)=>{
    const selected=sw===el;
    sw.classList.toggle('on',selected);
    sw.setAttribute('aria-pressed',selected?'true':'false');
  });
  const image=document.querySelector('.pd-img');
  if(image) image.style.background=el.dataset.color||el.style.backgroundColor||'#f4f6f4';
}
function productDescToggle(){ S.flow.descExpanded=!S.flow.descExpanded; render(); }
function productDetailTab(tab){
  if(!['description','features','size'].includes(tab)) return;
  S.flow.productDetailTab=tab;
  S.flow.descExpanded=false;
  document.querySelectorAll('.pd-detail-tabs button').forEach(button=>{
    const selected=button.dataset.arg===tab;
    button.classList.toggle('on',selected);
    button.setAttribute('aria-selected',selected?'true':'false');
  });
  document.querySelectorAll('[data-product-panel]').forEach(panel=>{
    panel.classList.toggle('on',panel.dataset.productPanel===tab);
  });
}
function productPurchase(){ toast('Checkout coming soon — payment will be available in a future update'); }

/* ===================== KITS ===================== */
function ViewKits(){
  const total=S.kits.length, live=S.kits.filter(k=>k.status==='live').length, sent=S.kits.filter(k=>k.sent).length;
  const rows=S.kits.map(k=>`<tr>
    <td><div style="font-weight:600">${esc(k.name)}</div><div class="mut3" style="font-size:11.5px">Reusable kit</div></td>
    <td class="num">${k.items}</td>
    <td>${k.status==='live'?'<span class="tag tag-live"><span class="dot"></span>Live</span>':'<span class="tag tag-draft">Draft</span>'}</td>
    <td class="muted">${k.sent?'Recently':'Not yet'}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-act="kitOpen" data-arg="${k.id}">Details</button> <button class="btn btn-dark btn-sm" data-act="sendItemsStart" data-arg="${k.id}">Send</button></td>
  </tr>`).join('');
  return `<div class="page-h"><div><h1>Kits &amp; Items</h1><div class="sub">Package catalog products into reusable gift kits, then send them at scale.</div></div>
    <button class="btn btn-brand" data-act="createKitStart">${I.plus}Create a kit</button></div>
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
      ${[['Total kits',total],['Live kits',live],['Kits sent',sent],['Recipients reached','45']].map(([k,v])=>`<div class="card stat"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('')}</div>
    <div class="card" style="padding:22px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="font-size:17px">Your kits</h3>
        <div class="search" style="max-width:260px">${I.search}<input style="height:36px" placeholder="Search kits" data-act="noop"></div></div>
      <table class="tbl"><thead><tr><th>Kit</th><th>Items</th><th>Status</th><th>Last sent</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}
function kitOpen(id){ const k=S.kits.find(x=>x.id===id);
  const prods=kitProductLabels(k);
  const hasBrand=!!k.artworkUrl;
  const prodList=prods.length?`<div style="margin:12px 0 16px"><div class="mut3" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:10px">Included products</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">${prods.map(p=>{const ep=enrichProduct(p);const mock=hasBrand||productHasPrintArea(ep);const inner=hasBrand?designedMockupHtml(ep,k.artworkUrl,mock):productImg(ep,mock?{width:'100%',height:'100%'}:{});return `<div class="pcard" data-act="noop"><div class="img${mock?' img-mockup':''}">${inner}</div></div>`;}).join('')}</div></div>`:'';
  const artBlock=k.artworkUrl?`<div style="margin:12px 0 16px"><div class="mut3" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:8px">Kit artwork</div>
    <div class="row" style="gap:12px;align-items:center"><div class="logo-chip" style="width:48px;height:48px;overflow:hidden;padding:4px"><img src="${esc(k.artworkUrl)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain"></div><span class="muted" style="font-size:13px">Branded across all items</span></div></div>`:'';
  openModal(`<div class="modal-pad" style="max-width:640px"><div class="modal-h"><div><div class="eyebrow">${k.status} · ${k.items} items</div><h3>${esc(k.name)}</h3></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="margin:8px 0 0">A reusable ${k.items}-item kit. Send it to new recipients any time without rebuilding.</p>
    ${artBlock}${prodList}
    <div class="row" style="margin-top:16px"><button class="btn btn-ghost btn-block" data-act="editKitStart" data-arg="${id}">Edit kit</button><button class="btn btn-brand btn-block" data-act="sendItemsStart" data-arg="${id}">Send this kit</button></div></div>`); }

/* ===================== CONTACTS ===================== */
function roleSel(c){ return `<select class="inp" style="height:34px;width:auto;padding:0 30px 0 12px;display:inline-block" data-act="noop">${['Owner','Admin','Sender','Member','Non-Member'].map(r=>`<option ${c.role===r?'selected':''}>${r}</option>`).join('')}</select>`; }
function ViewContacts(){
  const query = (S.flow.contactsSearch || '').trim().toLowerCase();
  const filtered = query
    ? S.contacts.filter(c => (c.name || '').toLowerCase().includes(query) || (c.email || '').toLowerCase().includes(query))
    : S.contacts;
  const rows=filtered.map(c=>`<tr>
    <td><input type="checkbox" ${c.role!=='Owner'?'':'disabled'}></td>
    <td class="muted">${esc(c.email)}</td>
    <td style="font-weight:600">${esc(c.name)}</td>
    <td>${c.role==='Owner'?'Owner':roleSel(c)}</td>
    <td class="muted">${c.loc?esc(c.loc):'—'}</td>
    <td style="text-align:right"><button class="iconbtn" style="width:30px;height:30px" data-act="contactEdit" data-arg="${c.id}">${I.edit}</button></td></tr>`).join('');
  return `<div class="page-h"><div><h1>Workspace Contacts</h1><div class="sub">People in your workspace, their roles, and gifting permissions.</div></div>
    <div class="row" style="gap:14px;align-items:center">
      <button class="btn btn-dark" data-act="addContacts">${I.plus}Add contacts</button></div></div>
  <div class="card" style="padding:18px">
    <div class="search" style="margin-bottom:14px">${I.search}<input placeholder="Search by name or email" data-act="contactsSearch" value="${esc(S.flow.contactsSearch || '')}"></div>
    <table class="tbl"><thead><tr><th></th><th>Email</th><th>Name</th><th>Role</th><th>Home address</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function addContacts(){
  S.flow.addTab='manual';
  S.flow.importFile=null;
  S.flow.importPreview=null;
  S.flow.importParsing=false;
  S.flow.importBusy=false;
  S.flow.importStage=null;
  S.flow.importResult=null;
  renderAddContacts();
}
function acUploadIcon(){
  return `<div class="ac-import-icon">${I.upload.replace('<svg ','<svg width="20" height="20" ')}</div>`;
}
function acImportCheckIcon(){
  return I.check.replace('<svg ','<svg width="16" height="16" ');
}
function acImportSpinner(){
  return '<span class="ac-import-spin" aria-hidden="true"></span>';
}
function acImportInstructions(){
  return `<p class="muted" style="font-size:13px;margin-bottom:12px">Download the template, fill in employee details, and upload a CSV or Excel file. <span class="lnk" data-act="acDownloadTemplate">Download template</span></p>`;
}
function acImportStatusRow(iconHtml,label,sub,busy){
  return `<div class="ac-import-status${busy?' is-busy':''}" style="margin-top:12px">
    <div class="row" style="gap:10px;align-items:center">${iconHtml}<div><div style="font-weight:600">${label}</div>${sub?`<div class="mut3" style="font-size:11px;margin-top:2px">${sub}</div>`:''}</div></div>
  </div>`;
}
function acImportFileExt(name){
  const m=String(name||'').match(/\.([^.]+)$/i);
  return m?m[1].toUpperCase():'FILE';
}
function acImportFileCard(file,preview,locked){
  const ext=acImportFileExt(file.name);
  const meta=preview?.sizeLabel||fmtFileSize(file.size);
  const rows=preview?.rowCount!=null?` · ${preview.rowCount} row${preview.rowCount===1?'':'s'}`:'';
  return `<div class="ac-import-file-card">
    <div class="row" style="align-items:center;justify-content:space-between;gap:10px">
      <div class="row" style="gap:10px;align-items:center;min-width:0">
        <div style="width:36px;height:36px;border-radius:8px;background:#fff;border:1px solid var(--line);display:grid;place-items:center;font-size:9px;font-weight:800;color:var(--brand-d);letter-spacing:.02em;flex:none">${esc(ext)}</div>
        <div style="min-width:0;text-align:left"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file.name)}</div><div class="mut3" style="font-size:11px">${esc(meta)}${rows}</div></div>
      </div>
      ${locked?'':`<button type="button" class="xbtn" data-act="acImportClear" aria-label="Remove file">✕</button>`}
    </div>
  </div>`;
}
function acImportProgressPanel(){
  const stage=S.flow.importStage||'uploading';
  const stageLabel=stage==='uploading'?'Uploading file…':stage==='queued'?'Queued for processing…':stage==='processing'?'Validating and importing contacts…':'Finishing up…';
  return `${acImportStatusRow(acImportSpinner(),stageLabel,'This usually takes a few seconds',true)}
    <div style="height:4px;border-radius:999px;background:var(--line);overflow:hidden;margin-top:10px"><div class="ac-import-bar"></div></div>`;
}
function renderAcImportPanel(){
  const importFile=S.flow.importFile;
  const preview=S.flow.importPreview;
  const parsing=S.flow.importParsing;
  const busy=S.flow.importBusy;
  const result=S.flow.importResult;
  const fileInput=`<input type="file" id="ac-import-inp" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none">`;

  if(busy&&importFile){
    return `${acImportInstructions()}${acImportFileCard(importFile,preview,true)}${acImportProgressPanel()}${fileInput}`;
  }
  if(importFile){
    let panel=`${acImportInstructions()}${acImportFileCard(importFile,preview||{sizeLabel:fmtFileSize(importFile.size)},false)}`;
    if(parsing){
      panel+=acImportStatusRow(acImportSpinner(),'Reading file…','Checking format and counting rows',true);
      return `${panel}${fileInput}`;
    }
    if(preview?.ready){
      if(preview.rowCount!=null){
        const warn=preview.hasEmail===false?'No email column found — import may fail':preview.hasName===false?'Name column missing — emails will be used as names':'';
        panel+=acImportStatusRow(acImportCheckIcon(),`${preview.rowCount} contact row${preview.rowCount===1?'':'s'} ready to import`,warn,false);
      }else if(preview.excel){
        panel+=acImportStatusRow(acImportCheckIcon(),'Excel file ready','Rows will be validated when you import',false);
      }
    }else if(preview?.error){
      panel+=`<div class="banner" style="margin-top:12px;font-size:12.5px">${esc(preview.error)}</div>`;
    }
    if(result){
      panel+=`<div class="card" style="padding:12px 14px;margin-top:14px;font-size:13px">
        <div style="font-weight:600;margin-bottom:6px">Import summary</div>
        <div class="muted">${result.validCount} imported · ${result.errorCount} skipped</div>
        ${result.errors?.length?`<div style="margin-top:8px;max-height:120px;overflow:auto;font-size:12px;color:var(--ink-2)">${result.errors.slice(0,5).map(e=>`Row ${e.row}: ${esc(e.message)}`).join('<br>')}${result.errors.length>5?`<br>…and ${result.errors.length-5} more`:''}</div>`:''}
      </div>`;
    }
    panel+=`<button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px" data-act="acImportPick">Replace file</button>`;
    return `${panel}${fileInput}`;
  }
  return `${acImportInstructions()}
    <div id="ac-import-drop" class="ac-import-zone" style="border:1.5px dashed var(--line);border-radius:var(--r-sm);padding:22px;text-align:center;color:var(--ink-2);background:#fff;cursor:pointer" data-act="acImportPick">
      ${acUploadIcon()}
      <div style="font-weight:600;font-size:13px">Drag and drop file</div>
      <div class="mut3" style="font-size:11px;margin:6px 0">CSV, XLSX, or XLS · max 5 MB</div>
      <button type="button" class="btn btn-soft btn-sm" data-act="acImportPick">Browse files</button>
    </div>${fileInput}`;
}
function renderAddContacts(){
  const tab=S.flow.addTab;
  const importFile=S.flow.importFile;
  const importReady=!!(importFile&&S.flow.importPreview?.ready&&!S.flow.importParsing);
  const body = tab==='manual'
    ? `<div class="row">
         <div class="field" style="flex:1"><label class="lbl">First name</label><input class="inp" id="ac-first" placeholder="e.g. Sushant"></div>
         <div class="field" style="flex:1"><label class="lbl">Last name</label><input class="inp" id="ac-last" placeholder="e.g. Praveen"></div>
       </div>
       <div class="row">
         <div class="field" style="flex:1"><label class="lbl">Email</label><input class="inp" type="email" id="ac-email" placeholder="e.g. name@domain.com"></div>
         <div class="field" style="flex:1"><label class="lbl">Phone</label><input class="inp" id="ac-phone" placeholder="e.g. +91 9876543210"></div>
       </div>
       <div class="row">
         <div class="field" style="flex:1"><label class="lbl">Role</label>
           <select class="inp" id="ac-role" style="height:40px"><option value="Non-Member">Non-Member</option><option value="Member" selected>Member</option><option value="Sender">Sender</option><option value="Admin">Admin</option></select>
         </div>
         <div class="field" style="flex:1"><label class="lbl">Department</label><input class="inp" id="ac-dept" placeholder="e.g. Engineering"></div>
       </div>
       <div class="row">
         <div class="field" style="flex:1"><label class="lbl">Employee Code</label><input class="inp" id="ac-emp-code" placeholder="e.g. EMP001"></div>
         <div class="field" style="flex:1"><label class="lbl">Country</label>
           <select class="inp" id="ac-country" style="height:40px"><option value="IN" selected>India</option><option value="AE">UAE</option><option value="US">USA</option></select>
         </div>
       </div>
       <div class="field"><label class="lbl">Address</label><input class="inp" id="ac-address" placeholder="e.g. N Convention Road Madhapur Hitech City"></div>
       <div class="row">
         <div class="field" style="flex:1"><label class="lbl">City</label><input class="inp" id="ac-city" placeholder="e.g. Hyderabad"></div>
         <div class="field" style="flex:1"><label class="lbl">State</label><input class="inp" id="ac-state" placeholder="e.g. Telangana"></div>
         <div class="field" style="flex:1"><label class="lbl">PIN Code</label><input class="inp" id="ac-pin" placeholder="e.g. 500081"></div>
       </div>`
    : renderAcImportPanel();
  const submitLabel=tab==='csv'?(S.flow.importBusy?'Importing…':S.flow.importParsing?'Reading file…':'Import contacts'):'Add contacts';
  const submitDisabled=tab==='csv'&&(S.flow.importBusy||S.flow.importParsing||!importReady);
  openModal(`<div class="modal-pad" style="max-width:640px"><div class="modal-h"><h3>Add contacts</h3><button class="xbtn" data-act="closeLayer">✕</button></div>
    <div class="tabs" style="max-width:280px;margin:12px 0 18px">${[['manual','Manually'],['csv','Upload file']].map(([k,l])=>`<button class="${tab===k?'on':''}" data-act="acTab" data-arg="${k}">${l}</button>`).join('')}</div>
    ${body}
    <div class="row" style="margin-top:20px"><button class="btn btn-ghost btn-block" data-act="closeLayer" ${S.flow.importBusy?'disabled':''}>Cancel</button><button class="btn btn-brand btn-block" data-act="addContactsDo" ${submitDisabled?'disabled':''}>${submitLabel}</button></div></div>`);
}
async function addContactsDo(){
  const tab=S.flow.addTab||'manual';
  if(tab==='csv') return addContactsImportDo();
  
  const firstName = document.getElementById('ac-first') ? document.getElementById('ac-first').value.trim() : '';
  const lastName = document.getElementById('ac-last') ? document.getElementById('ac-last').value.trim() : '';
  const email = document.getElementById('ac-email') ? document.getElementById('ac-email').value.trim() : '';
  const phone = document.getElementById('ac-phone') ? document.getElementById('ac-phone').value.trim() : '';
  const role = document.getElementById('ac-role') ? document.getElementById('ac-role').value : 'Member';
  const department = document.getElementById('ac-dept') ? document.getElementById('ac-dept').value.trim() : '';
  const employeeCode = document.getElementById('ac-emp-code') ? document.getElementById('ac-emp-code').value.trim() : '';
  const line1 = document.getElementById('ac-address') ? document.getElementById('ac-address').value.trim() : '';
  const city = document.getElementById('ac-city') ? document.getElementById('ac-city').value.trim() : '';
  const state = document.getElementById('ac-state') ? document.getElementById('ac-state').value.trim() : '';
  const pincode = document.getElementById('ac-pin') ? document.getElementById('ac-pin').value.trim() : '';
  const country = document.getElementById('ac-country') ? document.getElementById('ac-country').value : 'IN';

  const name = [firstName, lastName].filter(Boolean).join(' ');

  if (!email || !email.includes('@')) {
    toast('Please enter a valid email address', false);
    return;
  }
  if (!name) {
    toast('Please enter a name', false);
    return;
  }

  const payload = {
    name,
    email,
    phone,
    role,
    department,
    employeeCode,
    address: {
      line1,
      city,
      state,
      pincode,
      country
    }
  };

  if(api.useMocks()){
    const mockContact = {
      id: nid('p'),
      email,
      name,
      role,
      phone,
      department,
      employeeCode,
      address: line1,
      loc: [city, state, country].filter(Boolean).join(', '),
      city,
      state,
      pincode,
      country
    };
    S.contacts.push(mockContact);
    closeLayer(); toast('Added contact successfully'); render();
    return;
  }
  try{
    const created = await api.addContactFlow(payload);
    S.contacts.push(created);
    closeLayer(); toast('Added contact successfully'); render();
  }catch(err){ toast(err.message||'Failed to add contact'); }
}
function acImportPick(){ document.getElementById('ac-import-inp')?.click(); }
async function parseImportPreview(file){
  const ext=acImportFileExt(file.name);
  await new Promise(r=>setTimeout(r,320));
  if(/\.csv$/i.test(file.name)){
    const text=await file.text();
    const lines=text.split(/\r?\n/).filter(l=>l.trim());
    const rowCount=Math.max(0,lines.length-1);
    const headers=(lines[0]||'').toLowerCase();
    return {
      rowCount,
      ext,
      sizeLabel:fmtFileSize(file.size),
      hasEmail:/email/.test(headers),
      hasName:/\bname\b|full name/.test(headers),
      ready:true,
    };
  }
  return {
    rowCount:null,
    ext,
    sizeLabel:fmtFileSize(file.size),
    ready:true,
    excel:true,
  };
}
function acImportClear(){
  S.flow.importFile=null;
  S.flow.importPreview=null;
  S.flow.importParsing=false;
  S.flow.importResult=null;
  S.flow.importStage=null;
  renderAddContacts();
}
async function acImportSetFile(file){
  if(!file) return;
  const ok=/\.(csv|xlsx|xls)$/i.test(file.name);
  if(!ok){ toast('Only CSV and Excel files are accepted',false); return; }
  if(file.size>5*1024*1024){ toast('File must be 5 MB or smaller',false); return; }
  S.flow.importFile=file;
  S.flow.importPreview=null;
  S.flow.importResult=null;
  S.flow.importStage=null;
  S.flow.importParsing=true;
  renderAddContacts();
  try{
    S.flow.importPreview=await parseImportPreview(file);
  }catch(err){
    S.flow.importPreview={ready:false,error:err.message||'Could not read file'};
  }
  S.flow.importParsing=false;
  renderAddContacts();
}
function acDownloadTemplate(){
  const csv='name,email,phone,department,employeeCode,address,city,state,pincode,country\nJane Doe,jane@example.com,+91 98765 43210,Engineering,EMP001,"123 Main St",Bengaluru,Karnataka,560001,IN\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='contacts-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
async function addContactsImportDo(){
  const file=S.flow.importFile;
  if(!file||!S.flow.importPreview?.ready){ toast('Choose a CSV or Excel file to import',false); return; }
  S.flow.importBusy=true;
  S.flow.importStage='uploading';
  renderAddContacts();
  try{
    if(api.useMocks()){
      S.flow.importStage='processing';
      renderAddContacts();
      await new Promise(r=>setTimeout(r,500));
      const text=await file.text();
      const lines=text.split(/\r?\n/).filter(Boolean);
      const headers=lines[0].split(',').map(h=>h.trim().toLowerCase());
      const emailIdx=headers.findIndex(h=>h.includes('email'));
      const nameIdx=headers.findIndex(h=>h==='name'||h==='full name');
      let added=0;
      for(const line of lines.slice(1)){
        const cols=line.split(',');
        const email=(cols[emailIdx>=0?emailIdx:1]||'').trim();
        const name=(cols[nameIdx>=0?nameIdx:0]||email.split('@')[0]||'').trim();
        if(!email.includes('@')) continue;
        if(S.contacts.some(c=>c.email===email)) continue;
        S.contacts.push({id:nid('p'),email,name,role:'Member',address:'',loc:''});
        added+=1;
      }
      S.flow.importResult={validCount:added,errorCount:Math.max(0,lines.length-1-added),errors:[]};
      S.flow.importBusy=false;
      S.flow.importStage=null;
      renderAddContacts();
      toast(`Imported ${added} contact${added===1?'':'s'}`);
      return;
    }
    const result=await api.importContactsFlow(file,(status)=>{
      S.flow.importStage=status.status;
      renderAddContacts();
    });
    S.flow.importResult=result;
    S.flow.importBusy=false;
    S.flow.importStage=null;
    if(result.status==='failed'){
      renderAddContacts();
      toast(result.errors?.[0]?.message||'Import failed',false);
      return;
    }
    S.contacts=await api.refreshContactsFlow();
    closeLayer();
    S.flow.importFile=null;
    S.flow.importPreview=null;
    S.flow.importResult=null;
    const msg=`Imported ${result.validCount} contact${result.validCount===1?'':'s'}`;
    if(result.errorCount){
      toast(`${msg} (${result.errorCount} row${result.errorCount===1?'':'s'} skipped)`);
    }else{
      toast(msg);
    }
    render();
  }catch(err){
    S.flow.importBusy=false;
    S.flow.importStage=null;
    renderAddContacts();
    toast(err.message||'Import failed',false);
  }
}
function contactEdit(id){ const c=S.contacts.find(x=>x.id===id);
  openModal(`<div class="modal-pad" style="max-width:640px"><div class="modal-h"><h3>Fix recipient information</h3><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:6px 0 16px">Update this person's details so they can be added to orders. HRIS-synced fields will override manual entries.</p>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">First name</label><input class="inp" id="contact-first" value="${esc(c.name.split(' ')[0]||'')}"></div>
    <div class="field" style="flex:1"><label class="lbl">Last name</label><input class="inp" id="contact-last" value="${esc(c.name.split(' ').slice(1).join(' '))}"></div></div>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">Email</label><input class="inp" id="contact-email" value="${esc(c.email)}"></div>
    <div class="field" style="flex:1"><label class="lbl">Phone</label><input class="inp" id="contact-phone" value="${esc(c.phone||'')}"></div></div>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">Department</label><input class="inp" id="contact-dept" value="${esc(c.department||'')}"></div>
    <div class="field" style="flex:1"><label class="lbl">Employee Code</label><input class="inp" id="contact-emp-code" value="${esc(c.employeeCode||'')}"></div></div>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">Role</label>
      <select class="inp" id="contact-role">
        <option value="Owner" ${c.role==='Owner'?'selected':''}>Owner</option>
        <option value="Admin" ${c.role==='Admin'?'selected':''}>Admin</option>
        <option value="Sender" ${c.role==='Sender'?'selected':''}>Sender</option>
        <option value="Member" ${c.role==='Member'?'selected':''}>Member</option>
        <option value="Non-Member" ${c.role==='Non-Member'?'selected':''}>Non-Member</option>
      </select>
    </div>
    <div class="field" style="flex:1"><label class="lbl">Country</label><select class="inp" id="contact-country"><option value="IN" ${(c.country||'IN')==='IN'?'selected':''}>India</option><option value="AE" ${c.country==='AE'?'selected':''}>UAE</option><option value="US" ${c.country==='US'?'selected':''}>USA</option></select></div></div>
    <div class="field"><label class="lbl">Address</label><input class="inp" id="contact-address" value="${esc(c.address)}"></div>
    <div class="row"><div class="field" style="flex:1"><label class="lbl">City</label><input class="inp" id="contact-city" value="${esc(c.city||'')}"></div>
    <div class="field" style="flex:1"><label class="lbl">State</label><input class="inp" id="contact-state" value="${esc(c.state||'')}"></div>
    <div class="field" style="flex:1"><label class="lbl">PIN</label><input class="inp" id="contact-pin" value="${esc(c.pincode||'')}"></div></div>
    <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-block" data-act="closeLayer">Cancel</button><button class="btn btn-brand btn-block" data-act="contactSave" data-arg="${c.id}">Save</button></div></div>`); }
async function contactSave(id){
  const current=S.contacts.find(x=>x.id===id);
  if(!current) return;
  const address={
    line1:document.getElementById('contact-address').value.trim(),
    city:document.getElementById('contact-city').value.trim(),
    state:document.getElementById('contact-state').value.trim(),
    pincode:document.getElementById('contact-pin').value.trim(),
    country:document.getElementById('contact-country').value,
  };
  const payload={
    name:[document.getElementById('contact-first').value.trim(),document.getElementById('contact-last').value.trim()].filter(Boolean).join(' '),
    email:document.getElementById('contact-email').value.trim(),
    phone:document.getElementById('contact-phone').value.trim(),
    role:document.getElementById('contact-role').value,
    department:document.getElementById('contact-dept').value.trim(),
    employeeCode:document.getElementById('contact-emp-code').value.trim(),
    address,
  };
  try{
    const updated=api.useMocks()
      ? {...current,...payload,address:address.line1,loc:[address.city,address.state,address.country].filter(Boolean).join(', '),city:address.city,state:address.state,pincode:address.pincode,country:address.country}
      : await api.updateContactFlow(id,payload);
    S.contacts[S.contacts.findIndex(x=>x.id===id)]=updated;
    closeLayer(); toast('Recipient details saved'); render();
  }catch(err){ toast(err.message||'Failed to save recipient details'); }
}

/* ===================== INTEGRATIONS ===================== */
function ViewIntegrations(){
  const apps=[['Darwinbox','HRIS','Sync employees, birthdays & start dates',true],['Keka','HRIS','People data & org chart',false],['Razorpay','Payments','Collect funds via UPI, cards, netbanking',true],['Shiprocket','Logistics','Domestic & global fulfilment tracking',true],['Slack','Comms','Celebrate milestones in channels',false],['Google Workspace','Directory','Provision recipients from Google',false]];
  return `<div class="page-h"><div><h1>Integrations</h1><div class="sub">Connect HRIS, payments and logistics to automate gifting end-to-end.</div></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${apps.map(([n,t,d,on])=>`<div class="card" style="padding:18px">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div class="logo-chip" style="font-family:var(--disp);font-weight:800;color:var(--brand-d)">${n[0]}</div>${on?'<span class="tag tag-live"><span class="dot"></span>Connected</span>':''}</div>
    <h3 style="font-size:16px;margin-top:12px">${n}</h3><div class="mut3" style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:2px">${t}</div>
    <p class="muted" style="font-size:13px;margin-top:8px">${d}</p>
    <button class="btn ${on?'btn-ghost':'btn-soft'} btn-sm btn-block" style="margin-top:14px" data-act="toast" data-arg="${on?n+' settings':'Connecting '+n+'…'}">${on?'Manage':'Connect'}</button></div>`).join('')}</div>`;
}

/* ===================== CATALOG ===================== */
function ViewCatalog(){
  const cats=['All Products','Apparel','Bags','Drinkware','Technology','Office','Health & Wellness'];
  const t=S.flow.catCat||'All Products';
  const catalog=getCatalogList();
  const list=api.useMocks()&&t!=='All Products'?catalog.filter(p=>productCategory(p)===t):catalog;
  const count=api.useMocks()?list.length:(S.catalogTotal??list.length);
  const loading=S.flow.catalogLoading;
  return `<div class="page-h"><div><h1>Catalog</h1><div class="sub">${count} products from vetted suppliers, ready to brand and ship across India.</div></div></div>
  <div class="tabs" style="margin-bottom:20px">${cats.map(c=>`<button class="${c===t?'on':''}" data-act="catCat" data-arg="${c}">${c}</button>`).join('')}</div>
  ${loading?'<div class="muted" style="padding:24px 0">Loading products...</div>':`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${list.map(p=>pcard(p,{price:p.price,swatches:p.sw,act:'catalogProductOpen',arg:String(catalog.indexOf(p))})).join('')}</div>`}`;
}

function campaignStatusTag(status){
  const live=['launched','redemption_open'].includes(status);
  const closed=['redemption_closed','fulfilled'].includes(status);
  if(live) return '<span class="tag tag-live"><span class="dot"></span>Live</span>';
  if(closed) return '<span class="tag tag-draft">Closed</span>';
  return '<span class="tag tag-proc">Draft</span>';
}
function ViewCampaigns(){
  const list=S.campaigns||[];
  if(!list.length){
    return `<div class="page-h"><div><h1>Campaigns</h1><div class="sub">Launch points campaigns and track redemptions.</div></div>
      <button class="btn btn-dark" data-act="sendGift">${I.send}<span>Send Gift</span></button></div>
      <div class="card empty"><div class="ic">${I.camp.replace('currentColor','#cdd6cf')}</div><h3>No campaigns yet</h3><p>Create a campaign from a shop or entity budget to send redemption invites.</p>
        <button class="btn btn-brand" style="margin-top:14px" data-act="sendGift">${I.send} Send your first gift</button></div>`;
  }
  const rows=list.map(c=>`<tr>
    <td style="font-weight:600">${esc(c.name)}</td>
    <td class="muted">${esc(c.type)}</td>
    <td>${campaignStatusTag(c.status)}</td>
    <td class="num">${c.recipientCount}</td>
    <td class="num">${inr(c.totalBudget)}</td>
    <td class="num">${inr(c.creditsPerRecipient)}</td>
  </tr>`).join('');
  return `<div class="page-h"><div><h1>Campaigns</h1><div class="sub">Points campaigns, recipient invites and redemption tracking.</div></div>
    <button class="btn btn-dark" data-act="sendGift">${I.send}<span>Send Gift</span></button></div>
    <div class="card" style="padding:18px"><table class="tbl"><thead><tr><th>Campaign</th><th>Type</th><th>Status</th><th>Recipients</th><th>Total budget</th><th>Per recipient</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function miniChart(){
  const d=[20,38,30,55,48,70,62,84,76,92,80,88];
  const max=100,w=560,h=120,step=w/(d.length-1);
  const pts=d.map((v,i)=>`${i*step},${h-(v/max)*h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h+10}" style="width:100%;height:auto"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15784C" stop-opacity=".25"/><stop offset="1" stop-color="#15784C" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#g)"/><polyline points="${pts}" fill="none" stroke="#15784C" stroke-width="2.5"/>
    ${d.map((v,i)=>`<circle cx="${i*step}" cy="${h-(v/max)*h}" r="3" fill="#15784C"/>`).join('')}</svg>`;
}


/* ===================== ORDERS ===================== */
function statusTag(s){
  const m={Processing:'tag-proc',Shipped:'tag-ship',Delivered:'tag-deliv'};
  return `<span class="tag ${m[s]||'tag-proc'}">${s}</span>`;
}
function ViewOrders(){
  const list=S.orders||[];
  if(!list.length){
    return `<div class="page-h"><div><h1>Orders</h1><div class="sub">Track every swag, kit and points order across your workspace.</div></div></div>
      <div class="card empty"><div class="ic">${I.orders.replace('currentColor','#cdd6cf')}</div><h3>No orders yet</h3><p>Orders appear here when recipients redeem gifts or you send kits at scale.</p></div>`;
  }
  const rows = list.map(o=>`
    <tr data-act="orderOpen" data-arg="${o.id}" style="cursor:pointer">
      <td class="num">${o.date}</td>
      <td style="font-weight:600">${esc(o.name)}</td>
      <td>${statusTag(o.status)}</td>
      <td class="num" style="font-weight:600">${inr(o.amount)}</td>
      <td style="text-align:right"><span class="lnk">${o.track?'Tracking':'View'}</span></td>
    </tr>`).join('');
  return `<div class="page-h"><div><h1>Orders</h1><div class="sub">Track every swag, kit and points order across your workspace.</div></div></div>
  <div class="search" style="margin-bottom:18px">${I.search}<input placeholder="Search by order name or ID…" data-act="noop"></div>
  <div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Order details</th><th>Status</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function orderOpen(id){
  const o=S.orders.find(x=>x.id===id); if(!o)return;
  const deliv = o.status==='Delivered';
  const head = deliv
    ? `<div style="background:var(--brand-50);border-radius:var(--r-sm);padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-family:var(--disp);font-weight:800;font-size:22px;color:var(--brand-d)">DELIVERED</div>
        <div class="muted" style="margin-top:2px">On ${o.delivered}</div>
        <div style="margin-top:6px">Tracking ID: <a>${o.track}</a></div></div>`
    : o.status==='Shipped'
    ? `<div style="background:var(--info-50);border-radius:var(--r-sm);padding:16px;text-align:center;margin-bottom:14px">
        <div style="font-family:var(--disp);font-weight:800;font-size:22px;color:var(--info)">SHIPPED</div>
        <div style="margin-top:6px">Tracking ID: <a>${o.track}</a></div></div>`
    : `<div class="banner" style="margin-bottom:14px">${I.truck}<div>Your order is being prepared. Tracking will appear here once it ships.</div></div>`;
  const items = o.items.map(([n,q])=>`<div class="row" style="justify-content:space-between;border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 14px;margin-bottom:8px"><span style="font-weight:600">${esc(n)}</span><span class="muted">Qty ${q}</span></div>`).join('');
  openModal(`<div class="modal-pad">
    <div class="modal-h"><div><div class="eyebrow">${o.date} · ${inr(o.amount)} · ${esc(o.orderNumber||'')}</div><h3>${esc(o.name)}</h3></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <div style="margin-top:14px">${head}
      <div class="lbl" style="margin-bottom:8px">Items in shipment</div>${items}</div>
    <div class="row" style="margin-top:18px;gap:10px"><button class="btn btn-ghost btn-block" data-act="toast" data-arg="Invoice downloaded">Download invoice</button>${o.track?`<button class="btn btn-dark btn-block" data-act="toast" data-arg="Opening carrier tracking…">Track shipment</button>`:''}</div>
  </div>`);
}

/* ===================== WALLETS ===================== */
/* ===================== WALLETS · ORGANIZATION SETUP ===================== */
const ORG_ROLES=['Marketing Manager','Sales Manager','HR Manager','Admin Manager','Customer Success Manager','Operations Manager'];
const ORG_SUGG=['Marketing','Sales','HR','Admin','Customer Success','Engineering','Finance','Operations'];
const ORG_FALLBACK=['#DB2777','#0891B2','#65A30D','#9333EA','#EA580C','#0D9488'];
const ORG_CAN=['Create campaigns','Allocate credits','Upload recipients','Track orders','View department reports'];
const ORG_CANT=['Add funds','Transfer budgets','Access other departments'];
const ORG_STEPS=['Create Wallet','Departments','Allocate Budget','Assign Managers','Review & Finish'];
const parseAmt=s=>parseInt(String(s).replace(/[^\d]/g,'')||'0',10);
const fmtDate=iso=>{ if(!iso)return '—'; const d=new Date(iso+'T00:00'); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };
const orgTotalAlloc=()=>S.org.departments.reduce((s,d)=>s+(d.allocated||0),0);
function orgNextColor(){ const o=S.org; o._c=(o._c||0); const c=ORG_FALLBACK[o._c%ORG_FALLBACK.length]; o._c++; return c; }

function ViewWallets(){
  if(!S.org.inWizard && S.user.role==='entity_manager') return entityManagerDashboard();
  if(!S.org.inWizard) return orgDashboard();
  if(S.org.done) return orgDone();
  const n=S.org.step;
  const stepper=`<div class="org-stepper">${ORG_STEPS.map((lab,i)=>{const s=i+1;const cls=s<n?'done':s===n?'active':'';return `<div class="org-step ${cls}"><button class="sbtn" data-act="orgGo" data-arg="${s}"><div class="snum">${s<n?'✓':s}</div><div class="smeta"><span class="seye">Step ${s}</span><span class="slabel">${lab}</span></div></button>${s<5?'<div class="sline"></div>':''}</div>`;}).join('')}</div>`;
  const body=[orgStep1,orgStep2,orgStep3,orgStep4,orgStep5][n-1]();
  const over=n===3 && orgTotalAlloc()>S.org.wallet.amount;
  const nextLabel=n===5?'Finish setup':'Continue';
  const foot=`<div class="org-foot">
    <span style="${n===1?'visibility:hidden':''}">${backLink('Back','orgBack',null,{mb:'0'})}</span>
    <div class="note">Step ${n} of 5 · <b>${ORG_STEPS[n-1]}</b></div>
    <button class="btn btn-brand" id="org-next" data-act="orgNext" ${over?'disabled':''}>${nextLabel}${I.send.replace('width="24" height="24"','width="15" height="15"')}</button></div>`;
  return `<div class="page-h"><div>${backLink('Back to wallet dashboard','orgExit',null,{mb:'8px'})}<h1>${S.org.active?'Create another wallet':'Organization setup'}</h1><div class="sub">${esc(S.account)} · configure your merchandise budget, cost centers and managers.</div></div></div>
    ${stepper}${body}${foot}`;
}

/* ---- Entity manager: department budget view ---- */
function entityManagerDashboard(){
  const dept=(S.primaryEntityId&&orgDeptById(S.primaryEntityId))||S.org.departments[0];
  if(!dept){
    return `<div class="page-h"><div><h1>My department budget</h1><div class="sub">${esc(S.account)}</div></div></div>
      <div class="card empty" style="padding:50px"><div class="ic">${I.wallet.replace('currentColor','#cdd6cf')}</div>
        <h3>Budget not available yet</h3>
        <p>Your company admin must finish <b>organization setup</b> (step 5 — Review &amp; Finish) and allocate budget to your department. If you were invited by email, accept the invite link first.</p></div>`;
  }
  const alloc=dept.allocated||0, spent=dept.spent||0, rem=alloc-spent;
  const pendingNote=!alloc?`<div class="banner" style="margin-bottom:18px;background:var(--warn-tint,#fff8e6);color:var(--ink-2);border:none"><b>Budget not allocated yet.</b> Your admin assigned you as manager, but the department budget has not been saved. Ask them to open <b>Wallets → Re-allocate budget</b> and finish setup.</div>`:'';
  return `<div class="page-h"><div><h1>My department budget</h1><div class="sub">${esc(S.account)} · ${esc(dept.name)}</div></div></div>
    ${pendingNote}
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-bottom:18px">
      <div class="card" style="padding:22px">
        <div class="mut3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Allocated to you</div>
        <div class="num" style="font-family:var(--disp);font-weight:800;font-size:34px;margin:12px 0 4px">${inr(alloc)}</div>
        <div class="muted" style="font-size:13px">This is your department's merchandise budget for campaigns and orders.</div>
      </div>
      <div class="card row" style="padding:0">
        <div class="stat" style="flex:1"><div class="k">Spent</div><div class="v num">${inr(spent)}</div></div>
        <div style="width:1px;background:var(--line)"></div>
        <div class="stat" style="flex:1"><div class="k">Remaining</div><div class="v num" style="color:var(--brand-d)">${inr(rem)}</div></div>
      </div>
    </div>
    <div class="card" style="padding:18px 22px"><div class="mut3" style="font-size:12px">You can create campaigns and send gifts from this budget. Company-wide wallet settings are managed by your admin.</div></div>`;
}

/* ---- Organization dashboard (landing) ---- */
function orgDashboard(){
  if(!S.org.active && !(S.wallets&&S.wallets.length)){
    return `<div class="page-h"><div><h1>Wallets</h1><div class="sub">Set up a merchandise budget, split it into cost centers, and assign managers.</div></div></div>
      <div class="card empty" style="padding:50px"><div class="ic">${I.wallet.replace('currentColor','#cdd6cf')}</div><h3>No merchandise wallet yet</h3><p>Create your organization's merchandise budget wallet to start funding department campaigns.</p>
        <button class="btn btn-brand" style="margin-top:16px" data-act="orgStart">${I.plus}Create wallet</button></div>`;
  }
  const o=S.org.wallet, total=o.amount, alloc=orgTotalAlloc(), rem=total-alloc;
  const walletLive=o.status==='active';
  const statusTag=walletLive?'<span class="tag tag-live"><span class="dot"></span>Active</span>':'<span class="tag tag-draft">Setup in progress</span>';
  const setupBanner=walletLive?'':`<div class="banner" style="margin-bottom:18px">${I.wallet.replace('width="24" height="24"','width="16" height="16"')}<div><b>Wallet setup is not finished.</b> Complete allocation and manager invites, then activate from the review step. <span class="lnk" data-act="orgStart">Continue setup</span></div></div>`;
  const depts=S.org.departments, invited=depts.filter(d=>d.mgr.invite&&d.mgr.email).length;
  const allocTot=alloc||1; let acc=0;
  const stops=depts.map(d=>{ const pct=(d.allocated/allocTot*100); const seg=`${d.color} ${acc}% ${acc+pct}%`; acc+=pct; return seg; }).join(',')||'var(--surface-2) 0% 100%';
  const rows=depts.map(d=>`<tr>
    <td><div class="row" style="gap:9px;align-items:center"><span class="lc" style="width:11px;height:11px;border-radius:3px;background:${d.color}"></span><span style="font-weight:600">${esc(d.name)}</span></div></td>
    <td>${d.mgr.name?`<div style="font-weight:500;font-size:13px">${esc(d.mgr.name)}</div><div class="mut3" style="font-size:11px">${esc(d.mgr.email||'')}</div>`:'<span class="muted">—</span>'}</td>
    <td class="muted" style="font-size:13px">${esc(d.mgr.role||'—')}</td>
    <td class="num">${inr(d.allocated)}</td>
    <td class="num">${total?Math.round(d.allocated/total*100):0}%</td>
    <td>${d.mgr.invite&&d.mgr.email?'<span class="tag tag-live"><span class="dot"></span>Invited</span>':'<span class="tag tag-draft">Not invited</span>'}</td>
  </tr>`).join('');
  return `<div class="page-h"><div><h1>Wallets</h1><div class="sub">Organization merchandise budget · ${esc(S.account)}</div></div>
    <button class="btn btn-brand" data-act="orgStart">${I.plus}Create wallet</button></div>

  <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px;margin-bottom:18px">
    <div class="card" style="padding:22px">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="mut3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Merchandise budget wallet</div>
        <h2 style="font-size:21px;font-family:var(--disp);margin-top:4px">${esc(o.name)}</h2></div>
        ${statusTag}</div>
      <div class="num" style="font-family:var(--disp);font-weight:800;font-size:34px;margin:14px 0 4px">${inr(total)}</div>
      <div class="muted" style="font-size:13px">Valid ${fmtDate(o.start)} → ${fmtDate(o.end)} · Funded via ${o.funding==='upload'?(esc(o.docType)+' '+esc(o.docNumber)):'online payment'}</div>
      <div class="row" style="gap:8px;margin-top:16px"><button class="btn btn-ghost btn-sm" data-act="orgGoEdit" data-arg="1">Edit wallet</button><button class="btn btn-ghost btn-sm" data-act="orgGoEdit" data-arg="3">Re-allocate budget</button><button class="btn btn-ghost btn-sm" data-act="orgGoEdit" data-arg="4">Manage managers</button></div>
    </div>
    <div class="card" style="padding:22px">
      <div class="mut3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Budget distribution</div>
      <div style="display:flex;gap:18px;align-items:center">
        <div class="donut" style="width:130px;height:130px;flex:none;background:conic-gradient(${stops})"><div class="donut-center"><div class="num" style="font-family:var(--disp);font-weight:800;font-size:22px">${depts.length}</div><div class="mut3" style="font-size:10px">Depts</div></div></div>
        <div style="flex:1">${depts.map(d=>`<div class="row" style="justify-content:space-between;padding:3px 0;font-size:12px"><span class="row" style="gap:6px;align-items:center"><span class="lc" style="width:9px;height:9px;border-radius:3px;background:${d.color}"></span>${esc(d.name)}</span><b>${total?Math.round(d.allocated/total*100):0}%</b></div>`).join('')}</div>
      </div>
    </div>
  </div>

  <div class="card row" style="padding:0;margin-bottom:18px">
    <div class="stat" style="flex:1"><div class="k">Total budget</div><div class="v num">${inr(total)}</div></div>
    <div style="width:1px;background:var(--line)"></div>
    <div class="stat" style="flex:1"><div class="k">Allocated to cost centers</div><div class="v num">${inr(alloc)}</div></div>
    <div style="width:1px;background:var(--line)"></div>
    <div class="stat" style="flex:1"><div class="k">Unallocated</div><div class="v num" style="color:${rem<0?'var(--danger)':'var(--brand-d)'}">${inr(rem)}</div></div>
    <div style="width:1px;background:var(--line)"></div>
    <div class="stat" style="flex:1"><div class="k">Managers invited</div><div class="v num">${invited} / ${depts.length}</div></div>
  </div>

  <div class="card" style="padding:22px">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="font-size:17px">Departments (cost centers)</h3>
      <button class="btn btn-ghost btn-sm" data-act="orgGoEdit" data-arg="2">${I.plus}Add / edit departments</button></div>
    <table class="tbl"><thead><tr><th>Department</th><th>Manager</th><th>Role</th><th>Budget</th><th>% of total</th><th>Invite</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
function orgStart(){ S.org.inWizard=true; S.org.done=false; S.org.step=1; render(); }
function orgGoEdit(arg){ S.org.inWizard=true; S.org.done=false; S.org.step=+arg; render(); }
function orgExit(){ S.org.inWizard=false; S.org.done=false; render(); }
function orgToDash(){ S.org.inWizard=false; S.org.active=true; S.org.done=false; render(); }

/* ---- Step 1: wallet ---- */
function orgStep1(){
  const o=S.org.wallet;
  return `<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:22px">
    <div class="card" style="padding:24px">
      <h3 style="font-size:18px;margin-bottom:4px">Create Merchandise Budget Wallet</h3>
      <p class="muted" style="font-size:13px;margin-bottom:18px">Set up your annual merchandise budget. Funds in this wallet power every department campaign and order.</p>
      <div class="field"><label class="lbl">Wallet name</label><input class="inp" id="org-wname" value="${esc(o.name)}" data-act="orgWLive"></div>
      <div class="field"><label class="lbl">Budget amount</label><div class="inp-wrap"><span class="inp-prefix" style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--ink-3)">₹</span><input class="inp num" id="org-wamt" style="padding-left:26px" value="${o.amount.toLocaleString('en-IN')}" data-act="orgWLive"></div><div class="mut3" style="font-size:11.5px;margin-top:6px">Total annual merchandise budget you want to fund.</div></div>
      <div class="row" style="gap:14px"><div class="field" style="flex:1;margin:0"><label class="lbl">Period start</label><input class="inp" type="date" id="org-wstart" value="${o.start}" data-act="orgWLive"></div>
        <div class="field" style="flex:1;margin:0"><label class="lbl">Period end</label><input class="inp" type="date" id="org-wend" value="${o.end}" data-act="orgWLive"></div></div>
      <div class="field" style="margin-top:16px"><label class="lbl">Funding method</label>
        <div class="row" style="gap:12px">
          <div class="radio-card ${o.funding==='upload'?'sel':''}" style="flex:1" data-act="orgFunding" data-arg="upload"><div class="rcd"></div><div class="rct">Upload Agreement / PO</div><div class="rcs">Fund against a signed agreement</div></div>
          <div class="radio-card ${o.funding==='pay'?'sel':''}" style="flex:1" data-act="orgFunding" data-arg="pay"><div class="rcd"></div><div class="rct">Pay Online</div><div class="rcs">Card, bank transfer or UPI</div></div></div></div>
      ${o.funding==='upload'?`
      <div class="row" style="gap:14px"><div class="field" style="flex:1;margin:0"><label class="lbl">Document type</label><select class="inp" id="org-doctype" data-act="orgWChange"><option ${o.docType==='Agreement'?'selected':''}>Agreement</option><option ${o.docType==='Purchase Order'?'selected':''}>Purchase Order</option><option ${o.docType==='Work Order'?'selected':''}>Work Order</option></select></div>
        <div class="field" style="flex:1;margin:0"><label class="lbl">Document number</label><input class="inp" id="org-docnum" value="${esc(o.docNumber)}" data-act="orgWLive"></div></div>
      <div class="field"><label class="lbl">Upload document</label>
        ${o.uploaded?`<div class="row" style="gap:10px;align-items:center;border:1px solid var(--brand);border-radius:var(--r-sm);padding:11px 13px;background:var(--brand-50)"><div class="logo-chip" style="width:34px;height:34px;font-size:10px;font-weight:800">PDF</div><div style="flex:1"><div style="font-weight:600;font-size:13px">${esc(S.account)}-Merch-Agreement-FY26.pdf</div><div class="mut3" style="font-size:11px">1.8 MB · uploaded just now</div></div><button class="xbtn" data-act="orgUploadClear">✕</button></div>`
        :`<div style="border:1.5px dashed var(--line);border-radius:var(--r-sm);padding:22px;text-align:center;color:var(--ink-2);cursor:pointer" data-act="orgUpload">${I.upload.replace('currentColor','#15784C')}<div style="font-weight:600;font-size:13px;margin-top:8px">Click to upload or drag & drop</div><div class="mut3" style="font-size:11px;margin-top:4px">PDF or DOCX · up to 25MB</div></div>`}
        <div class="row" style="gap:9px;align-items:center;margin-top:12px"><span class="lbl" style="margin:0">Approval status</span><span class="tag tag-warn"><span class="dot"></span>Pending review</span></div></div>`
      :`
      <div class="field"><label class="lbl">Amount</label><div class="inp-wrap"><span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--ink-3)">₹</span><input class="inp num" id="org-payamt" style="padding-left:26px" value="${o.amount.toLocaleString('en-IN')}" data-act="orgWLive"></div></div>
      <div class="field"><label class="lbl">Payment method</label><div class="row" style="gap:10px">
        ${['card','bank','upi'].map(p=>`<div class="radio-card ${o.pay===p?'sel':''}" style="flex:1;padding:12px 12px 12px 38px" data-act="orgPay" data-arg="${p}"><div class="rcd"></div><div class="rct">${p==='card'?'Credit card':p==='bank'?'Bank transfer':'UPI'}</div></div>`).join('')}</div></div>
      <button class="btn btn-dark btn-block" data-act="toast" data-arg="Redirecting to secure payment…">Proceed to payment</button>`}
    </div>
    <aside><div class="card" style="padding:20px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px"><span class="lbl" style="margin:0">Wallet summary</span><span class="tag tag-draft"><span class="dot"></span>Draft</span></div>
      <div style="border-top:1px solid var(--line);padding:12px 0"><div class="mut3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Wallet name</div><div id="org-sname" style="font-weight:600;margin-top:3px">${esc(o.name)}</div></div>
      <div style="border-top:1px solid var(--line);padding:12px 0"><div class="mut3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Budget</div><div id="org-sbudget" class="num" style="font-family:var(--disp);font-weight:800;font-size:24px;margin-top:3px">${inr(o.amount)}</div></div>
      <div style="border-top:1px solid var(--line);padding:12px 0"><div class="mut3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Validity</div><div id="org-svalidity" style="font-weight:500;margin-top:3px;font-size:13.5px">${fmtDate(o.start)} → ${fmtDate(o.end)}</div></div>
      <div style="border-top:1px solid var(--line);padding:12px 0 0"><div class="mut3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Funding method</div><div id="org-sfund" style="font-weight:500;margin-top:3px;font-size:13.5px">${o.funding==='upload'?'Upload Agreement / PO':'Pay Online'}</div></div>
    </div></aside></div>`;
}
function orgWLive(e){ const el=e.target||e, id=el.id, o=S.org.wallet;
  if(id==='org-wamt'||id==='org-payamt'){ const v=parseAmt(el.value); el.value=v?v.toLocaleString('en-IN'):''; o.amount=v; }
  else if(id==='org-wname') o.name=el.value;
  else if(id==='org-wstart') o.start=el.value;
  else if(id==='org-wend') o.end=el.value;
  else if(id==='org-docnum') o.docNumber=el.value;
  const s1=document.getElementById('org-sname'); if(s1)s1.textContent=o.name||'Untitled wallet';
  const s2=document.getElementById('org-sbudget'); if(s2)s2.textContent=inr(o.amount);
  const s3=document.getElementById('org-svalidity'); if(s3)s3.textContent=fmtDate(o.start)+' → '+fmtDate(o.end);
}
function orgWChange(el){ if(el.id==='org-doctype') S.org.wallet.docType=el.value; }
function orgFunding(m){ S.org.wallet.funding=m; render(); }
function orgPay(el,a){ S.org.wallet.pay=a; render(); }
function orgUpload(){ S.org.wallet.uploaded=true; toast('Document uploaded · pending review'); render(); }
function orgUploadClear(){ S.org.wallet.uploaded=false; render(); }

/* ---- Step 2: departments ---- */
function orgStep2(){
  const used=S.org.departments.map(d=>d.name.toLowerCase());
  const sugg=ORG_SUGG.map(s=>`<button class="chip ${used.includes(s.toLowerCase())?'used':''}" data-act="orgQuickAdd" data-arg="${esc(s)}"><span class="plus">+</span> ${s}</button>`).join('');
  const cards=S.org.departments.map(d=>`<div class="dept-card">
    <div class="row" style="gap:11px;align-items:center"><div class="dc-swatch" style="background:${d.color}">${esc(d.name.charAt(0))}</div><div style="font-weight:700;font-size:15px">${esc(d.name)}</div></div>
    <p class="muted" style="font-size:12.5px;margin:12px 0;min-height:34px">${esc(d.desc)}</p>
    <div class="row" style="justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:12px"><div class="mut3" style="font-size:12px">Expected users · <b style="color:var(--ink)">${d.users}</b></div>
      <div class="row" style="gap:4px"><button class="iconbtn" data-act="orgDeptModal" data-arg="${d.id}">${I.edit.replace('width="24" height="24"','width="15" height="15"')}</button><button class="iconbtn" data-act="orgDeptDel" data-arg="${d.id}">${I.trash.replace('width="24" height="24"','width="15" height="15"')}</button></div></div>
  </div>`).join('');
  return `<div style="margin-bottom:8px"><h3 style="font-size:18px">Create departments</h3><p class="muted" style="font-size:13px;margin-top:2px">Departments act as cost centers that consume the merchandise budget. Add the teams that will run campaigns and order swag.</p></div>
    <label class="lbl">Quick add suggestions</label><div style="margin:6px 0 18px">${sugg}</div>
    <div class="dept-grid">${cards}<button class="add-dept" data-act="orgDeptModal" data-arg="new"><div class="pc">+</div><span>Add another department</span></button></div>`;
}
function orgQuickAdd(name){ if(S.org.departments.some(d=>d.name.toLowerCase()===name.toLowerCase()))return;
  const descs={Engineering:'Team merchandise, hackathon kits and dev swag.',Finance:'Audit, compliance and finance team merchandise.',Operations:'Operational supplies and field team kits.'};
  S.org.departments.push({id:S.org.seq++,name,desc:descs[name]||'Department merchandise and campaigns.',users:10,allocated:0,color:orgNextColor(),mgr:{name:'',email:'',mobile:'',role:ORG_ROLES.find(r=>r.startsWith(name))||'Operations Manager',invite:true}});
  toast(name+' added'); render();
}
function orgDeptDel(id){ if(S.org.departments.length<=1){ toast('Keep at least one department',false); return; } S.org.departments=S.org.departments.filter(d=>String(d.id)!==String(id)); render(); }
function orgDeptModal(arg){ const edit=arg!=='new'; const d=edit?orgDeptById(arg):null; S.org.editId=edit?String(arg):null;
  openModal(`<div class="modal-pad"><div class="modal-h"><div><div class="eyebrow">Cost center</div><h2 style="font-size:22px;font-family:var(--disp)">${edit?'Edit department':'Add department'}</h2></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:4px 0 18px">Create a cost center that will consume merchandise budget.</p>
    <div class="field"><label class="lbl">Department name</label><input class="inp" id="org-mname" value="${edit?esc(d.name):''}" placeholder="e.g. Product" autofocus></div>
    <div class="field"><label class="lbl">Description</label><input class="inp" id="org-mdesc" value="${edit?esc(d.desc):''}" placeholder="What this team uses merchandise for"></div>
    <div class="field"><label class="lbl">Expected users</label><input class="inp num" id="org-musers" type="number" min="1" value="${edit?d.users:10}"></div>
    <div class="row" style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px"><button class="btn btn-ghost btn-block" data-act="closeLayer">Cancel</button><button class="btn btn-brand btn-block" data-act="orgDeptSave">${edit?'Save changes':'Add department'}</button></div></div>`);
}
function orgDeptSave(){ const name=(document.getElementById('org-mname').value||'').trim(); if(!name){ toast('Enter a department name',false); return; }
  const desc=(document.getElementById('org-mdesc').value||'').trim()||'Department merchandise and campaigns.'; const users=parseInt(document.getElementById('org-musers').value)||1;
  if(S.org.editId){ const d=orgDeptById(S.org.editId); if(d){ d.name=name; d.desc=desc; d.users=users; } }
  else S.org.departments.push({id:S.org.seq++,name,desc,users,allocated:0,color:orgNextColor(),mgr:{name:'',email:'',mobile:'',role:'Operations Manager',invite:true}});
  closeLayer(); render();
}

/* ---- Step 3: allocate ---- */
function orgStep3(){
  const total=S.org.wallet.amount, alloc=orgTotalAlloc(), rem=total-alloc;
  const segs=S.org.departments.filter(d=>d.allocated>0).map(d=>`<div class="alloc-seg" style="width:${Math.min(d.allocated/total*100,100)}%;background:${d.color}">${(d.allocated/total*100)>=8?Math.round(d.allocated/total*100)+'%':''}</div>`).join('')
    +(rem>0?`<div class="alloc-seg gap" style="width:${rem/total*100}%">${(rem/total*100)>=8?'Unallocated':''}</div>`:'');
  const legend=S.org.departments.map(d=>`<div class="leg"><span class="lc" style="background:${d.color}"></span>${esc(d.name)} · ${inr(d.allocated)}</div>`).join('');
  const rows=S.org.departments.map(d=>`<tr><td><div class="row" style="gap:8px;align-items:center"><span class="lc" style="width:10px;height:10px;border-radius:3px;background:${d.color}"></span>${esc(d.name)}</div></td>
    <td class="r"><span style="color:var(--ink-3);margin-right:2px">₹</span><input class="alloc-input ${alloc>total?'over':''}" data-act="orgAllocLive" data-id="${d.id}" value="${d.allocated.toLocaleString('en-IN')}"></td>
    <td class="r"><span class="pct-pill" id="org-pct-${d.id}">${total?(d.allocated/total*100).toFixed((d.allocated/total*100)%1?1:0):0}%</span></td></tr>`).join('');
  return `<div style="margin-bottom:14px"><h3 style="font-size:18px">Allocate budget across departments</h3><p class="muted" style="font-size:13px;margin-top:2px">Distribute the wallet across cost centers. Allocations update in real time and can never exceed the wallet value.</p></div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      <div class="card stat"><div class="k">Total budget</div><div class="v num" id="org-stTotal">${inr(total)}</div></div>
      <div class="card stat"><div class="k">Allocated</div><div class="v num" id="org-stAlloc">${inr(alloc)}</div></div>
      <div class="card stat"><div class="k">Remaining</div><div class="v num" id="org-stRem" style="color:${rem<0?'var(--danger)':'var(--brand-d)'}">${inr(rem)}</div></div></div>
    <div class="card" style="padding:18px"><div class="alloc-bar" id="org-bar">${segs||'<div class="alloc-seg gap" style="width:100%">Unallocated</div>'}</div><div class="alloc-legend" id="org-legend">${legend}</div></div>
    <div class="row" style="justify-content:flex-end;gap:10px;align-items:center;margin-top:14px"><span class="mut3" style="font-size:12.5px">Need a starting point?</span><button class="btn btn-soft btn-sm" data-act="orgSplitEven">Split evenly</button></div>
    <table class="alloc-table"><thead><tr><th>Department</th><th class="r">Allocated budget</th><th class="r">Percentage</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700"><td style="padding:12px 10px">Total allocated</td><td class="r" style="padding:12px 10px" id="org-footAmt">${inr(alloc)}</td><td class="r" style="padding:12px 10px" id="org-footPct">${total?Math.round(alloc/total*100):0}%</td></tr></tfoot></table>
    <div class="banner ${alloc>total?'':''}" id="org-allocAlert" style="margin-top:16px;background:var(--danger-tint,#fdeceb);color:var(--danger);border:none;${alloc>total?'':'display:none'}">Allocated amount exceeds the wallet value. Reduce allocations to continue.</div>`;
}
function orgAllocLive(e){ const el=e.target; const d=orgDeptById(el.dataset.id); if(!d) return; let n=parseAmt(el.value); el.value=n?n.toLocaleString('en-IN'):''; d.allocated=n; orgAllocRecalc(); }
function orgAllocRecalc(){ const total=S.org.wallet.amount, alloc=orgTotalAlloc(), rem=total-alloc, over=alloc>total;
  const set=(id,v)=>{const e=document.getElementById(id); if(e)e.textContent=v;};
  set('org-stAlloc',inr(alloc)); set('org-footAmt',inr(alloc)); set('org-footPct',(total?Math.round(alloc/total*100):0)+'%');
  const r=document.getElementById('org-stRem'); if(r){ r.textContent=inr(rem); r.style.color=rem<0?'var(--danger)':'var(--brand-d)'; }
  S.org.departments.forEach(d=>{ const p=document.getElementById('org-pct-'+d.id); if(p)p.textContent=(total?(d.allocated/total*100).toFixed((d.allocated/total*100)%1?1:0):0)+'%'; });
  const bar=document.getElementById('org-bar'); if(bar){ let segs=S.org.departments.filter(d=>d.allocated>0).map(d=>`<div class="alloc-seg" style="width:${Math.min(d.allocated/total*100,100)}%;background:${d.color}">${(d.allocated/total*100)>=8?Math.round(d.allocated/total*100)+'%':''}</div>`).join(''); if(rem>0)segs+=`<div class="alloc-seg gap" style="width:${rem/total*100}%">${(rem/total*100)>=8?'Unallocated':''}</div>`; bar.innerHTML=segs||'<div class="alloc-seg gap" style="width:100%">Unallocated</div>'; }
  const lg=document.getElementById('org-legend'); if(lg)lg.innerHTML=S.org.departments.map(d=>`<div class="leg"><span class="lc" style="background:${d.color}"></span>${esc(d.name)} · ${inr(d.allocated)}</div>`).join('');
  const al=document.getElementById('org-allocAlert'); if(al)al.style.display=over?'flex':'none';
  document.querySelectorAll('.alloc-input').forEach(i=>i.classList.toggle('over',over));
  const nb=document.getElementById('org-next'); if(nb)nb.disabled=over;
}
function orgSplitEven(){ const total=S.org.wallet.amount,n=S.org.departments.length,base=Math.floor(total/n/1000)*1000; S.org.departments.forEach((d,i)=>d.allocated=i===n-1?total-base*(n-1):base); toast('Budget split evenly'); render(); }

/* ---- Step 4: managers ---- */
function orgStep4(){
  return `<div style="margin-bottom:14px"><h3 style="font-size:18px">Assign department managers</h3><p class="muted" style="font-size:13px;margin-top:2px">Managers control campaigns, recipients and spending for their department. Invitations are sent the moment setup completes.</p></div>`
  +S.org.departments.map(d=>`<div class="mgr-card">
    <div class="mgr-head"><div class="dc-swatch" style="background:${d.color};width:30px;height:30px;font-size:13px">${esc(d.name.charAt(0))}</div><div style="font-weight:700;font-size:15px">${esc(d.name)}</div><div class="mb">Budget <b>${inr(d.allocated)}</b></div></div>
    <div class="mgr-body" style="grid-template-columns:1fr;display:block;padding:18px">
      <div><div class="row" style="gap:12px;margin-bottom:14px"><div class="field" style="flex:1;margin:0"><label class="lbl">Manager name</label><input class="inp" value="${esc(d.mgr.name)}" data-act="orgMgrLive" data-id="${d.id}" data-f="name" placeholder="Full name"></div>
        <div class="field" style="flex:1;margin:0"><label class="lbl">Role</label><select class="inp" data-act="orgMgrRole" data-id="${d.id}">${ORG_ROLES.map(r=>`<option ${r===d.mgr.role?'selected':''}>${r}</option>`).join('')}</select></div></div>
        <div class="row" style="gap:12px"><div class="field" style="flex:1;margin:0"><label class="lbl">Email</label><input class="inp" value="${esc(d.mgr.email)}" data-act="orgMgrLive" data-id="${d.id}" data-f="email" placeholder="name@${esc(S.account.toLowerCase())}.net"></div>
        <div class="field" style="flex:1;margin:0"><label class="lbl">Mobile</label><input class="inp" value="${esc(d.mgr.mobile)}" data-act="orgMgrLive" data-id="${d.id}" data-f="mobile" placeholder="+91 ..."></div></div></div>
    </div>
    <div class="row" style="justify-content:space-between;align-items:center;padding:14px 18px;border-top:1px solid var(--line);background:var(--surface-2)"><div><div style="font-weight:600;font-size:13px">Send invitation</div><div class="mut3" style="font-size:11.5px">Email the manager an invite to activate their account</div></div><div class="switch ${d.mgr.invite?'on':''}" data-act="orgInvite" data-arg="${d.id}"></div></div>
  </div>`).join('');
}
function orgDeptById(id){ return S.org.departments.find((d)=>String(d.id)===String(id)); }
function orgMgrLive(e){ const el=e.target; const d=orgDeptById(el.dataset.id); if(d) d.mgr[el.dataset.f]=el.value; }
function orgMgrRole(el){ const d=orgDeptById(el.dataset.id); if(d) d.mgr.role=el.value; }
function orgInvite(id){ const d=orgDeptById(id); if(!d) return; d.mgr.invite=!d.mgr.invite; render(); }

/* ---- Step 5: review ---- */
function orgStep5(){
  const o=S.org.wallet, total=o.amount, allocTot=orgTotalAlloc()||1;
  let acc=0; const stops=S.org.departments.map(d=>{ const pct=d.allocated/allocTot*100; const seg=`${d.color} ${acc}% ${acc+pct}%`; acc+=pct; return seg; }).join(',');
  return `<div style="margin-bottom:14px"><h3 style="font-size:18px">Review organization setup</h3><p class="muted" style="font-size:13px;margin-top:2px">Confirm everything looks right. Jump back to any step to make changes before finishing.</p></div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px">
      <div>
        <div class="card" style="padding:20px;margin-bottom:16px"><div class="row" style="justify-content:space-between;margin-bottom:10px"><b style="font-size:14px">Organization & wallet</b><span class="lnk" data-act="orgGo" data-arg="1">Edit</span></div>
          <div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted" style="font-size:13px">Organization</span><span style="font-weight:600;font-size:13px">${esc(S.account)}</span></div>
          <div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted" style="font-size:13px">Wallet</span><span style="font-weight:600;font-size:13px">${esc(o.name)}</span></div>
          <div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted" style="font-size:13px">Total budget</span><span style="font-weight:700;font-size:13px;color:var(--brand-d)">${inr(total)}</span></div>
          <div class="row" style="justify-content:space-between;padding:7px 0"><span class="muted" style="font-size:13px">Validity</span><span style="font-weight:600;font-size:13px">${fmtDate(o.start)} → ${fmtDate(o.end)}</span></div></div>
        <div class="card" style="padding:20px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="font-size:14px">Departments & managers</b><span class="lnk" data-act="orgGo" data-arg="2">Edit</span></div>
          ${S.org.departments.map(d=>`<div class="rev-dept"><span class="sw" style="background:${d.color}"></span><div style="flex:1"><div style="font-weight:600;font-size:13.5px">${esc(d.name)}</div><div class="mut3" style="font-size:11.5px">${d.mgr.name?esc(d.mgr.name)+(d.mgr.email?' · '+esc(d.mgr.email):''):'No manager assigned'}</div></div><span class="num" style="font-weight:700;font-size:13px">${inr(d.allocated)}</span><span class="pct-pill">${total?Math.round(d.allocated/total*100):0}%</span></div>`).join('')}</div>
      </div>
      <aside class="card" style="padding:20px"><div class="mut3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Budget distribution</div>
        <div class="donut" style="background:conic-gradient(${stops})"><div class="donut-center"><div class="num" style="font-family:var(--disp);font-weight:800;font-size:26px">${S.org.departments.length}</div><div class="mut3" style="font-size:11px">Departments</div></div></div>
        <div style="margin-top:6px">${S.org.departments.map(d=>`<div class="row" style="justify-content:space-between;padding:5px 0;font-size:12.5px"><span class="row" style="gap:7px;align-items:center"><span class="lc" style="width:10px;height:10px;border-radius:3px;background:${d.color}"></span>${esc(d.name)}</span><b>${total?Math.round(d.allocated/total*100):0}%</b></div>`).join('')}</div>
      </aside></div>`;
}

/* ---- nav + finish ---- */
function orgGo(arg){ S.org.step=+arg; render(); }
function orgBack(){ if(S.org.step>1){ S.org.step--; render(); } }
function orgNext(){ const st=S.org.step;
  if(st===3 && orgTotalAlloc()>S.org.wallet.amount){ toast('Reduce allocations to continue',false); return; }
  if(st===5 && orgTotalAlloc()<=0){ toast('Allocate budget to at least one department before finishing',false); return; }
  if(st===5){ orgFinishConfirm(); return; }
  S.org.step++; render();
}
function orgFinishConfirm(){ openModal(`<div class="modal-pad"><div class="modal-h"><div><h2 style="font-size:22px;font-family:var(--disp)">Finish setup?</h2></div><button class="xbtn" data-act="closeLayer">✕</button></div>
  <p class="muted" style="font-size:13.5px;margin:6px 0 20px">This activates the <b>${esc(S.org.wallet.name)}</b> wallet, creates all departments and sends manager invitations. You can still edit everything afterward.</p>
  <div class="row" style="border-top:1px solid var(--line);padding-top:16px"><button class="btn btn-ghost btn-block" data-act="closeLayer">Not yet</button><button class="btn btn-brand btn-block" data-act="orgFinish">Finish setup</button></div></div>`); }
async function orgFinish(){
  if(api.useMocks()){ S.org.done=true; closeLayer(); render(); return; }
  closeLayer();
  try{
    S.loading=true; render();
    const result=await api.syncOrgWizard(S.org);
    S.org.wallet.id=result.walletId;
    S.org.sentInvites=result.invites||[];
    await hydrateFromApi();
    S.org.done=true;
    S.org.active=true;
    const withLinks=(S.org.sentInvites||[]).filter((i)=>i.inviteToken).length;
    toast(withLinks?`Wallet saved — ${withLinks} invite link(s) shown below`:'Wallet setup saved to your workspace');
  }catch(err){
    toast(err.message||'Failed to save wallet setup');
  }finally{
    S.loading=false; render();
  }
}

function orgDone(){ const o=S.org.wallet; const invited=S.org.departments.filter(d=>d.mgr.invite&&d.mgr.email).length;
  const inviteCards=(S.org.sentInvites||[]).filter(i=>i.inviteToken).map(i=>{
    const link=`${location.origin}/accept-invite?token=${encodeURIComponent(i.inviteToken)}`;
    return `<div class="succ-item" style="flex-direction:column;align-items:stretch;gap:8px"><div style="font-weight:600;font-size:13px">${esc(i.name||i.email)} · ${esc(i.entityName)}</div><div class="mut3" style="font-size:11.5px;word-break:break-all">${esc(link)}</div><button class="btn btn-ghost btn-sm" type="button" data-act="copyInvite" data-arg="${esc(link)}">Copy invite link</button></div>`;
  }).join('');
  return `<div style="max-width:620px;margin:30px auto;text-align:center">
    <div class="success-burst">${I.check.replace('width="24" height="24"','width="36" height="36"')}</div>
    <h1 style="font-size:26px">Organization setup complete</h1>
    <p class="muted" style="margin:8px 0 24px">Your merchandise program is live. ${esc(S.account)} is ready to launch its first company store.</p>
    <div class="card" style="padding:8px 20px;text-align:left">
      <div class="succ-item"><div class="si">${I.wallet.replace('width="24" height="24"','width="17" height="17"')}</div><div style="flex:1"><div style="font-weight:600">Wallet created</div><div class="mut3" style="font-size:12px">${inr(o.amount)} budget activated</div></div><span class="tag tag-live"><span class="dot"></span>Active</span></div>
      <div class="succ-item"><div class="si">${I.box.replace('width="24" height="24"','width="17" height="17"')}</div><div style="flex:1"><div style="font-weight:600">${S.org.departments.length} departments created</div><div class="mut3" style="font-size:12px">${S.org.departments.map(d=>esc(d.name)).join(', ')}</div></div><span class="tag tag-live"><span class="dot"></span>Done</span></div>
      <div class="succ-item" style="border-bottom:none"><div class="si">${I.contacts.replace('width="24" height="24"','width="17" height="17"')}</div><div style="flex:1"><div style="font-weight:600">${invited} managers invited</div><div class="mut3" style="font-size:12px">Invitations sent via email — check spam if not received</div></div><span class="tag tag-live"><span class="dot"></span>Sent</span></div>
    </div>
    ${inviteCards?`<div class="card" style="padding:8px 20px;margin-top:16px;text-align:left"><div style="font-weight:600;font-size:13px;margin-bottom:8px">Invite links (dev)</div><p class="mut3" style="font-size:12px;margin:0 0 12px">Gmail often filters localhost invite links to spam. Share these links directly if needed.</p>${inviteCards}</div>`:''}
    <div class="card" style="padding:14px 18px;margin-top:16px;display:flex;gap:12px;align-items:center;text-align:left;background:var(--brand-50);border-color:#cfe7da"><div class="logo-chip" style="width:36px;height:36px">${I.shop.replace('currentColor','#15784C')}</div><div><div class="mut3" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Recommended next step</div><div style="font-weight:600">Create your company store</div></div></div>
    <div class="row" style="justify-content:center;margin-top:22px"><button class="btn btn-ghost btn-lg" data-act="orgToDash">Go to dashboard</button><button class="btn btn-brand btn-lg" data-act="nav" data-arg="shops">Create store ${I.send.replace('width="24" height="24"','width="15" height="15"')}</button></div>
  </div>`;
}

/* ---------- small UI state handlers ---------- */
function schedSet(el){ S.flow.sched=S.flow.sched||{}; S.flow.sched[el.dataset.k]=el.value; }
function prevTab(a){ S.flow.prevView=a; render(); }
function swSub(a){ S.flow.swSub=a; render(); }
function artTab(a){ S.flow.artTab=a; render(); }
function artPrevThumb(i,u,sel){
  const ph=u.preview?`<img src="${u.preview}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`:LOGO_DECO;
  const label=esc(u.ext&&u.size?u.ext+' · '+fmtFileSize(u.size):u.name||'artwork');
  return `<div class="thumb ${sel?'on':''}" data-act="artPick" data-arg="${i}"><div class="ph">${ph}</div><div class="nm">${label}</div></div>`;
}
function artPick(el){ const i=+el.dataset.arg; const u=(S.artUploads||[])[i]; if(!u) return;
  S.flow.artwork=true; S.flow.artSel=i; S.flow.artFile={name:u.name,size:u.size,ext:u.ext,preview:u.preview,file:u.file}; render(); }
function shopPrevThumb(i,u,sel){
  const src=u.preview||u.logoUrl||'';
  const ph=src?`<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`:LOGO_DECO;
  const label=esc(u.ext&&u.size?u.ext+' · '+fmtFileSize(u.size):u.name||'logo');
  return `<button type="button" class="thumb ${sel?'on':''}" data-act="shopLogoPrev" data-arg="${i}"><div class="ph">${ph}</div><div class="nm">${label}</div></button>`;
}
function shopLogoTab(a){
  if(S.view!=='createShop') return;
  if((S.flow.step|0)<1) S.flow.step=1;
  S.flow.logoTab=a;
  render();
}
function shopLogoPrev(el){
  const i=+el.dataset.arg;
  const u=getLogoUploadsList()[i];
  if(!u) return;
  S.flow.logo=true;
  S.flow.logoSel=i;
  S.flow.logoFile={name:u.name,size:u.size,ext:u.ext,preview:u.preview||u.logoUrl,sizeLabel:u.sizeLabel};
  S.flow.logoTab='device';
  render();
}

/* canned previous-uploads (logos + artwork) for picker grids */
const PREV_UPLOADS=[
  {nm:'PNG · 19.1 KB', deco:'logo'},
  {nm:'PNG · 19.1 KB', deco:'logo'},
  {nm:'SVG · 660 KB', deco:'crest'},
  {nm:'SVG · 660 KB', deco:'crest'},
];
function prevThumb(i,u,sel,act){ return `<div class="thumb ${sel?'on':''}" data-act="${act}" data-arg="${i}"><div class="ph">${u.deco==='crest'?I.spark.replace('currentColor','#d33b30').replace('width="24" height="24"','width="30" height="30"'):LOGO_DECO}</div><div class="nm">${u.nm}</div></div>`; }

/* ===================== TOP-LEVEL HANDLERS ===================== */
function readAuthForm(){
  if(S.view==='signup'){
    return {
      email:(document.getElementById('su-email')?.value||'').trim(),
      password:document.getElementById('su-password')?.value||'',
      name:(document.getElementById('su-name')?.value||'').trim(),
      companyName:(document.getElementById('su-company')?.value||'').trim(),
    };
  }
  const inputs=document.querySelectorAll('.auth-form .inp');
  return { email:(inputs[0]?.value||'').trim(), password:inputs[1]?.value||'' };
}
async function hydrateFromApi(sessionUser){
  const data=await api.hydrateWorkspace(sessionUser);
  api.applyWorkspaceToState(S,data);
}
async function auth(){
  if(api.useMocks()){
    S.authed=true; S.nav='orders'; S.view='orders'; S.flow={}; render();
    toast('Welcome back, '+S.user.name.split(' ')[0]);
    return;
  }
  const form=readAuthForm();
  const isSignup=S.view==='signup';
  if(isSignup){
    if(!form.email||!form.password||!form.name||!form.companyName){
      toast('Fill in all fields'); return;
    }
    if(form.password.length<8){ toast('Password must be at least 8 characters'); return; }
  } else if(!form.email||!form.password){ toast('Enter email and password'); return; }
  const gen=++bootState.gen;
  S.loading=true; render();
  try{
    const user=isSignup
      ? await api.register({ name:form.name, email:form.email, password:form.password, companyName:form.companyName })
      : await api.login(form.email,form.password);
    if(api.isPlatformUser(user)){
      window.location.href='/platform/dashboard';
      return;
    }
    S.user={name:user.name,initials:user.name.split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join(''),email:user.email,role:user.role||'company_admin'};
    await hydrateFromApi(user);
    if(gen!==bootState.gen) return;
    markSessionActive();
    S.authed=true; S.nav='orders'; S.view='orders'; S.flow={};
    toast(isSignup ? 'Welcome to Shelf Merch, '+user.name.split(' ')[0]+'!' : 'Welcome back, '+user.name.split(' ')[0]);
  }catch(err){
    if(gen===bootState.gen) toast(err.message||(isSignup?'Sign up failed':'Login failed'));
  }finally{
    if(gen===bootState.gen){ S.loading=false; render(); }
  }
}
async function logout(){
  ++bootState.gen;
  bootState.sessionAt=0;
  if(!api.useMocks()) await api.logout().catch(()=>{});
  S.authed=false; S.view='login'; S.flow={}; closeLayer(); render();
}

function shopOpen(id){ go('shopDetail',{flow:{shopId:id,shopTab:'Branded Swag'},nav:'shops'}); }
function shopTab(t){ S.flow.shopTab=t; render(); }
function swagTab(t){
  S.flow.swagTab=t;
  if(t==='All Products') S.flow.swagView='product';
  render();
}
function swagView(mode){ S.flow.swagView=mode; render(); }
async function catCat(c){
  const previousCategory=S.flow.catCat||'All Products';
  S.flow.catCat=c;
  if(api.useMocks()||!api.isAuthenticated()){ render(); return; }
  const requestId=(S.flow.catalogRequestId||0)+1;
  S.flow.catalogRequestId=requestId;
  S.flow.catalogLoading=true;
  render();
  try{
    const catalog=await api.refreshCatalogProducts(c==='All Products'?undefined:c);
    if(S.flow.catalogRequestId!==requestId) return;
    S.catalogProducts=catalog.items;
    S.catalogTotal=catalog.total;
  }catch(_e){
    if(S.flow.catalogRequestId===requestId){
      S.flow.catCat=previousCategory;
      toast('Could not load catalog products');
    }
  }finally{
    if(S.flow.catalogRequestId===requestId){
      S.flow.catalogLoading=false;
      render();
    }
  }
}
function acTab(t){ S.flow.addTab=t; if(t==='manual'){ S.flow.importFile=null; S.flow.importPreview=null; S.flow.importParsing=false; S.flow.importResult=null; S.flow.importStage=null; } renderAddContacts(); }

function chooseKitToSend(){
  const kits=(S.kits||[]).filter(k=>k.status==='live');
  const rows=kits.map(k=>`<div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:14px">
      <div style="width:42px;height:42px;border-radius:10px;background:var(--brand-50);color:var(--brand);display:grid;place-items:center;flex:none">${I.box||I.gift||I.send}</div>
      <div style="flex:1"><div style="font-weight:700">${esc(k.name)}</div><div class="muted" style="font-size:12px;margin-top:2px">${k.items||0} item${k.items===1?'':'s'} · ${esc(k.status||'live')}</div></div>
      <button class="btn btn-dark btn-sm" data-act="sendItemsStart" data-arg="${k.id}">Select</button>
    </div>`).join('');
  openModal(`<div class="modal-pad" style="max-width:620px">
    <div class="modal-h"><div><div class="eyebrow">Send a kit</div><h3>Choose a kit to send</h3></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:6px 0 18px">Select one of your existing kits, or create a new kit.</p>
    <div style="display:grid;gap:10px">${rows||'<div class="card empty" style="padding:24px"><h3>No kits available</h3><p>Create a kit before starting this send.</p></div>'}</div>
    <button class="btn btn-brand btn-block" style="margin-top:16px" data-act="createKitFromSend"><span style="font-size:18px;line-height:1" aria-hidden="true">+</span>Create a new kit</button>
  </div>`);
}
function createKitFromSend(){ closeLayer(); createKitStart(); }

function sendGift(){
  openModal(`<div class="modal-pad">
    <div class="modal-h"><div><div class="eyebrow">Send a gift</div><h3>What would you like to send?</h3></div><button class="xbtn" data-act="closeLayer">✕</button></div>
    <p class="muted" style="font-size:13px;margin:6px 0 18px">Choose how you'd like to delight your people. You can fine-tune recipients and branding on the next step.</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
      <div class="optcard" style="flex-direction:column;align-items:flex-start;gap:10px;cursor:pointer" data-act="sendPointsStart">
        <div style="width:42px;height:42px;border-radius:12px;background:var(--brand-50);color:var(--brand);display:grid;place-items:center">${I.coin}</div>
        <div><h4 style="margin-bottom:2px">Send points</h4><p>Let recipients pick their own swag from your branded shop.</p></div>
      </div>
      <div class="optcard" style="flex-direction:column;align-items:flex-start;gap:10px;cursor:pointer" data-act="chooseKitToSend">
        <div style="width:42px;height:42px;border-radius:12px;background:var(--brand-50);color:var(--brand);display:grid;place-items:center">${I.box||I.gift||I.send}</div>
        <div><h4 style="margin-bottom:2px">Send a kit</h4><p>Ship a ready-made bundle of branded items to addresses.</p></div>
      </div>
    </div>
  </div>`);
}

function userMenu(){
  openModal(`<div class="modal-pad" style="max-width:380px">
    <div class="row" style="gap:14px;align-items:center;margin-bottom:18px">
      <div class="avatar" style="width:52px;height:52px;font-size:18px">${S.user.initials}</div>
      <div><div style="font-weight:700;font-size:16px">${esc(S.user.name)}</div><div class="muted" style="font-size:13px">${esc(S.user.email||'')}</div>
        <div style="margin-top:5px"><span class="tag tag-ready">People Admin · ${esc(S.account)}</span></div></div>
    </div>
    <div style="border-top:1px solid var(--line);padding-top:8px">
      ${[['Account settings','settings'],['Billing & invoices','billing']].map(([l,v])=>`<div class="nav-item" style="border-radius:var(--r-sm)" data-act="navClose" data-arg="${v}">${I.gear}<span>${l}</span></div>`).join('')}
      <div class="nav-item" style="border-radius:var(--r-sm);color:var(--danger)" data-act="logout">${I.exit||I.back}<span>Log out</span></div>
    </div>
  </div>`);
}

/* ===================== EVENT DELEGATION ===================== */
const ACT = {
  nav:(el,a)=>setNav(a),
  navClose:(el,a)=>{ closeLayer(); setNav(a); },
  go:(el,a)=>go(a),
  auth:()=>auth(),
  logout:()=>logout(),
  sendGift:()=>sendGift(),
  chooseKitToSend:()=>chooseKitToSend(),
  createKitFromSend:()=>createKitFromSend(),
  viewShop:(el,a)=>window.open('/shop/'+a,'_blank'),
  userMenu:()=>userMenu(),
  toast:(el,a)=>toast(a||'Done'),
  noop:()=>{},
  closeLayer:()=>closeLayer(),
  closeLayerToast:(el,a)=>{ closeLayer(); toast(a||'Done'); },
  // orders
  orderOpen:(el,a)=>orderOpen(a),
  // wallets · organization setup
  orgGo:(el,a)=>orgGo(a),
  orgBack:()=>orgBack(),
  orgNext:()=>orgNext(),
  orgFunding:(el,a)=>orgFunding(a),
  orgPay:(el,a)=>orgPay(el,a),
  orgUpload:()=>orgUpload(),
  orgUploadClear:()=>orgUploadClear(),
  orgQuickAdd:(el,a)=>orgQuickAdd(a),
  orgDeptModal:(el,a)=>orgDeptModal(a),
  orgDeptSave:()=>orgDeptSave(),
  orgDeptDel:(el,a)=>orgDeptDel(a),
  orgSplitEven:()=>orgSplitEven(),
  orgInvite:(el,a)=>orgInvite(a),
  orgFinish:()=>orgFinish(),
  orgStart:()=>orgStart(),
  orgGoEdit:(el,a)=>orgGoEdit(a),
  orgExit:()=>orgExit(),
  orgToDash:()=>orgToDash(),
  copyInvite:(el,a)=>{ navigator.clipboard.writeText(a).then(()=>toast('Invite link copied')).catch(()=>toast('Copy failed — select the link manually',false)); },
  // shops
  shopOpen:(el,a)=>shopOpen(a),
  shopTab:(el,a)=>shopTab(a),
  createShopStart:()=>createShopStart(),
  shopCur:(el)=>shopCur(el),
  shopCreateBack:()=>shopCreateBack(),
  shopNext:()=>shopNext(),
  shopLogoUpload:()=>shopLogoUpload(),
  shopLogoClear:()=>shopLogoClear(),
  shopBuildGo:()=>shopBuildGo(),
  shopBannerEdit:()=>shopBannerEdit(),
  shopBannerTheme:(el,a)=>shopBannerTheme(el,a),
  shopEditOpen:(el,a)=>shopEditOpen(el,a),
  shopEditBannerTheme:(el,a)=>shopEditBannerTheme(el,a),
  shopEditLogoUpload:()=>shopEditLogoUpload(),
  shopEditLogoClear:()=>shopEditLogoClear(),
  shopEditSave:()=>shopEditSave(),
  catToggle:(el)=>catToggle(el),
  shopPublish:()=>shopPublish(),
  // swag designer
  swagDesignerStart:(el)=>swagDesignerStart(el),
  swNameNext:()=>swNameNext(),
  swPick:(el)=>swPick(el),
  swArtUpload:()=>swArtUpload(),
  swArtClear:()=>swArtClear(),
  swResetArt:()=>swResetArt(),
  swGenerate:()=>swGenerate(),
  swagTab:(el,a)=>swagTab(a),
  swagView:(el,a)=>swagView(a),
  swagCardMenu:(el,a)=>swagCardMenu(el,a),
  swagCardEdit:()=>swagCardEdit(),
  swagCardView:(el,a)=>swagCardView(el,a),
  swagAddToShopOpen:(el,a)=>swagAddToShopOpen(el,a),
  collectionAddToShopOpen:(el,a)=>collectionAddToShopOpen(el,a),
  swagAddToShopPick:(el,a)=>swagAddToShopPick(el,a),
  swagAddToShopDo:()=>swagAddToShopDo(),
  collectionMenu:(el,a)=>collectionMenu(el,a),
  collectionArchive:(el,a)=>collectionArchive(a),
  collectionRestore:(el,a)=>collectionRestore(a),
  collectionDelete:(el,a)=>collectionDelete(a),
  productOpen:(el,a)=>productOpen(a),
  catalogProductOpen:(el,a)=>catalogProductOpen(a),
  productBack:()=>productBack(),
  productColor:(el)=>productColor(el),
  productDescToggle:()=>productDescToggle(),
  productDetailTab:(el,a)=>productDetailTab(a),
  productPurchase:()=>productPurchase(),
  catCat:(el,a)=>catCat(a),
  // send points
  sendPointsStart:(el)=>sendPointsStart(el),
  spRecalc:()=>spRecalc(),
  spWhen:(el)=>spWhen(el),
  spBack:()=>spBack(),
  spExit:()=>spExit(),
  spNext:()=>spNext(),
  sendPointsDo:()=>sendPointsDo(),
  recToggle:(el)=>recToggle(el),
  recDeselect:()=>recDeselect(),
  recMode:(el)=>recMode(el),
  // kits
  kitOpen:(el,a)=>kitOpen(a),
  createKitStart:()=>createKitStart(),
  ktPick:(el)=>ktPick(el),
  ktLogoUpload:()=>ktLogoUpload(),
  ktLogoClear:()=>ktLogoClear(),
  ktPkg:(el)=>ktPkg(el),
  ktBack:()=>ktBack(),
  ktNext:()=>ktNext(),
  kitPublish:()=>kitPublish(),
  editKitStart:(el,a)=>editKitStart(a),
  ekPick:(el)=>ekPick(el),
  ekRemove:(el)=>ekRemove(el),
  ekBack:()=>ekBack(),
  ekNext:()=>ekNext(),
  kitSaveEdit:()=>kitSaveEdit(),
  // send items
  sendItemsStart:(el)=>sendItemsStart(el),
  siAddOpen:()=>siAddOpen(),
  siPick:(el)=>siPick(el),
  siAddDone:()=>siAddDone(),
  siBack:()=>siBack(),
  siNext:()=>siNext(),
  sendItemsDo:()=>sendItemsDo(),
  // contacts
  addContacts:()=>addContacts(),
  acTab:(el,a)=>acTab(a),
  acImportPick:()=>acImportPick(),
  acImportClear:()=>acImportClear(),
  acDownloadTemplate:()=>acDownloadTemplate(),
  addContactsDo:()=>addContactsDo(),
  contactEdit:(el,a)=>contactEdit(a),
  contactSave:(el,a)=>contactSave(a),
  // wizards
  wzExit:()=>wzExit(),
  payPick:(el)=>payPick(el),
  setTab:(el,a)=>setTab(a),
  saveWorkspace:()=>saveWorkspace(),
  // recipient experience / scheduler
  schedSet:(el)=>schedSet(el),
  prevTab:(el,a)=>prevTab(a),
  // branded swag sub-rail
  swSub:(el,a)=>swSub(a),
  // artwork picker
  artTab:(el,a)=>artTab(a),
  artPick:(el)=>artPick(el),
  // shop logo tabs
  shopLogoTab:(el,a)=>shopLogoTab(a),
  shopLogoPrev:(el)=>shopLogoPrev(el),
};
const LIVE = { spRecalc:1, spMsg:1, reMsg:1, reNote:1, singleLocLive:1, orgWLive:1, orgAllocLive:1, orgMgrLive:1, contactsSearch:1 };  // input-driven
const CHANGED = { schedSet:1, singleLocLive:1, orgWChange:1, orgMgrRole:1 };              // change-driven

function onShelfMerchClick(e){
  // backdrop click closes any open layer
  if(e.target.hasAttribute && e.target.hasAttribute('data-scrim')){ closeLayer(); return; }
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const act = t.dataset.act;
  if(LIVE[act] || CHANGED[act]) return;   // handled on input/change
  const fn = ACT[act];
  if(!fn){ return; }
  if(t.tagName==='A') e.preventDefault();
  if(act==='shopEditOpen'||act==='swagView'||act==='swagCardMenu'||act==='collectionMenu'||t.classList?.contains('swag-card-menu')) e.stopPropagation();
  fn(t, t.dataset.arg);
}

if(typeof window!=='undefined'){
  document.removeEventListener('click', window.__shelfMerchOnClick);
  window.__shelfMerchOnClick=onShelfMerchClick;
  document.addEventListener('click', window.__shelfMerchOnClick);
}

document.addEventListener('input', function(e){
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const a=t.dataset.act;
  if(a==='spRecalc') spRecalc();
  else if(a==='spMsg') spMsg(e);
  else if(a==='reMsg') reMsg(e);
  else if(a==='reNote') reNote(e);
  else if(a==='singleLocLive') singleLocLive(t);
  else if(a==='orgWLive') orgWLive(e);
  else if(a==='orgAllocLive') orgAllocLive(e);
  else if(a==='orgMgrLive') orgMgrLive(e);
  else if(a==='contactsSearch') {
    S.flow.contactsSearch = t.value;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    render();
    const inp = document.querySelector('[data-act="contactsSearch"]');
    if(inp){
      inp.focus();
      inp.setSelectionRange(start, end);
    }
  }
});

document.addEventListener('change', function(e){
  if(e.target.id==='kt-logo-inp'){
    const f=e.target.files?.[0];
    if(f) ktLogoSetFile(f);
    e.target.value='';
    return;
  }
  if(e.target.id==='sh-logo-inp'){
    const f=e.target.files?.[0];
    if(f) shopLogoSetFile(f);
    e.target.value='';
    return;
  }
  if(e.target.id==='sw-art-inp'){
    const f=e.target.files?.[0];
    if(f) swArtSetFile(f);
    e.target.value='';
    return;
  }
  if(e.target.id==='shop-edit-logo-inp'){
    const f=e.target.files?.[0];
    if(f) shopEditSetLogoFile(f);
    e.target.value='';
    return;
  }
  if(e.target.id==='ac-import-inp'){
    const f=e.target.files?.[0];
    if(f) acImportSetFile(f);
    e.target.value='';
    return;
  }
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const a=t.dataset.act;
  if(a==='schedSet') schedSet(t);
  else if(a==='singleLocLive') singleLocLive(t);
  else if(a==='orgWChange') orgWChange(t);
  else if(a==='orgWLive') orgWLive(t);
  else if(a==='orgMgrRole') orgMgrRole(t);
});

document.addEventListener('dragover', function(e){
  if(e.target.closest('#sh-logo-drop')||e.target.closest('#kt-logo-drop')||e.target.closest('#sw-art-drop')||e.target.closest('#shop-edit-logo-drop')||e.target.closest('#ac-import-drop')) e.preventDefault();
});

document.addEventListener('drop', function(e){
  const logoDrop=e.target.closest('#sh-logo-drop');
  const kitLogoDrop=e.target.closest('#kt-logo-drop');
  const artDrop=e.target.closest('#sw-art-drop');
  const editLogoDrop=e.target.closest('#shop-edit-logo-drop');
  const importDrop=e.target.closest('#ac-import-drop');
  if(!logoDrop&&!kitLogoDrop&&!artDrop&&!editLogoDrop&&!importDrop) return;
  e.preventDefault();
  const f=e.dataTransfer?.files?.[0];
  if(!f) return;
  if(importDrop) acImportSetFile(f);
  else if(editLogoDrop) shopEditSetLogoFile(f);
  else if(kitLogoDrop) ktLogoSetFile(f);
  else if(logoDrop) shopLogoSetFile(f);
  else swArtSetFile(f);
});

document.addEventListener('keydown', function(e){
  if(e.key==='Escape') closeLayer();
});

/* ===================== BOOT ===================== */
async function init(){
  if(api.useMocks()){
    S.authed=false; S.view='login'; render();
    return;
  }
  if(S.authed && api.isAuthenticated()){
    markSessionActive();
    return;
  }
  const gen=++bootState.gen;
  S.loading=true; render();
  const snapshot=await api.tryRestoreSession();
  if(gen!==bootState.gen||S.authed){
    S.loading=false; render();
    return;
  }
  if(snapshot==='platform'){
    window.location.href='/platform/dashboard';
    return;
  }
  if(snapshot){
    api.applyWorkspaceToState(S,snapshot);
    markSessionActive();
    S.authed=true; S.nav='orders'; S.view='orders';
  }else{
    if(gen!==bootState.gen||S.authed){
      S.loading=false; render();
      return;
    }
    S.authed=false; S.view='login';
  }
  S.loading=false; render();
}
init();
}

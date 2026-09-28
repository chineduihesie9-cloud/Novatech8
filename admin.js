(() => {
"use strict";
const supabase = window.novaSupabase;
const $ = id => document.getElementById(id);
let adminUser=null, products=[], profiles=[], contacts=[], orders=[], quotes=[], selectedQuote=null, quoteTabFilter='all';
const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function safeUUID(){try{if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID()}catch(e){}return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)}
function showFatalError(msg){try{let el=document.getElementById('adminFatalError');if(!el){el=document.createElement('div');el.id='adminFatalError';el.style.cssText='position:fixed;top:0;left:0;right:0;background:#7f1d1d;color:#fff;padding:14px 20px;font:13px/1.5 -apple-system,sans-serif;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.3)';document.body.appendChild(el)}el.innerHTML='⚠ <strong>The admin dashboard hit an error and some buttons may not work:</strong> '+String(msg).replace(/[<>]/g,'')+' — please refresh the page. If this keeps happening, copy this exact message and send it back.'}catch(e){}}
window.addEventListener('error',e=>showFatalError(e.message||'Unknown script error'));
window.addEventListener('unhandledrejection',e=>showFatalError(e.reason?.message||String(e.reason)||'Unknown promise error'));
const money = n => `$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date = v => v ? new Date(v).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
function toast(msg,good=true){const t=$('toast');t.textContent=msg;t.className='toast show';t.style.background=good?'#132b50':'#9b3434';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.className='toast',2800)}
function statusClass(s){s=String(s||'').toLowerCase();return ['completed','delivered','accepted','quoted','in stock','active'].includes(s)?'good':['pending','new','reviewing','processing','pre-order'].includes(s)?'warn':['cancelled','declined','expired','closed','out of stock','suspended'].includes(s)?'bad':''}
function go(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));$('view-'+view)?.classList.add('active-view');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const titles={overview:'Overview',products:'Products',invoices:'Invoices',quotes:'Request Quotes',customers:'Customers',contacts:'Contact Messages',messages:'Customer Messages'};$('pageTitle').textContent=titles[view]||view;window.scrollTo({top:0,behavior:'smooth'});if(innerWidth<=800)$('sidebar').classList.remove('open')}
async function checkAdmin(){
 if(!supabase){showLogin('Supabase client did not load.');return}
 const {data:{session}}=await supabase.auth.getSession(); if(!session){showLogin();return}
 let {data:p,error}=await supabase.from('profiles').select('id,email,full_name,role,account_status,auth_user_id').eq('id',session.user.id).maybeSingle();
 if(!p&&!error){const fallback=await supabase.from('profiles').select('id,email,full_name,role,account_status,auth_user_id').eq('auth_user_id',session.user.id).maybeSingle();p=fallback.data;error=fallback.error;}
 if(error){showLogin('Could not verify your admin profile: '+error.message);return}
 const role=String(p?.role||'').trim().toLowerCase();
 const accountStatus=String(p?.account_status||'').trim().toLowerCase();
 if(!p||role!=='admin'||accountStatus!=='active'){console.warn('Admin profile mismatch',{userId:session.user.id,profile:p,role,accountStatus});showLogin('Your account was found, but its profile must have Role = admin and Account Status = active.');return}
 adminUser={...session.user,...p}; $('adminLogin').classList.add('hidden');$('dashboard').classList.remove('hidden');$('adminIdentity').textContent=`${p.full_name||p.email} · Admin`;await loadAll();subscribeRealtime();
 window.dispatchEvent(new CustomEvent('nova-admin-ready'));
}
function showLogin(error=''){ $('dashboard').classList.add('hidden');$('adminLogin').classList.remove('hidden');$('loginError').textContent=error; }
async function loadAll(){
 $('liveState').textContent='● Loading';
 const tables=['products','profiles','contact_messages','orders','quotes'];
 const results=await Promise.allSettled([
  supabase.from('products').select('*').order('display_order',{ascending:true}).order('created_at',{ascending:false}),
  supabase.from('profiles').select('id,full_name,email,role,account_status,phone,created_at').order('created_at',{ascending:false}),
  supabase.from('contact_messages').select('*').order('created_at',{ascending:false}),
  supabase.from('orders').select('*').order('created_at',{ascending:false}),
  supabase.from('quotes').select('*').order('created_at',{ascending:false})
 ]);
 [products,profiles,contacts,orders,quotes]=results.map(r=>r.status==='fulfilled'&&!r.value.error?(r.value.data||[]):[]);
 const failed=results.map((r,i)=>({r,table:tables[i]})).filter(x=>x.r.status==='rejected'||(x.r.status==='fulfilled'&&x.r.value.error));
 renderDbHealthBanner(failed);
 if(failed.length){
  console.warn('Some admin queries failed',failed);
  const t=$('toast');t.textContent=`⚠ Some data failed to load — see the red banner above the dashboard for details`;t.className='toast show';t.style.background='#9b3434';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.className='toast',6000);
 }
 renderAll();$('liveState').textContent='● Live';
}

function renderDbHealthBanner(failed){
 const banner=$('dbHealthBanner');
 if(!banner)return;
 if(!failed.length){banner.classList.add('hidden');banner.innerHTML='';return}
 const rows=failed.map(x=>{
  const msg=x.r.status==='rejected'?(x.r.reason?.message||String(x.r.reason)):(x.r.value.error?.message||'Unknown error');
  return `<li><strong>${esc(x.table)}</strong> — ${esc(msg)}</li>`;
 }).join('');
 const anyMissingFn=failed.some(x=>{const m=x.r.status==='rejected'?(x.r.reason?.message||''):(x.r.value.error?.message||'');return /is_admin|function .* does not exist/i.test(m)});
 const anyMissingTable=failed.some(x=>{const m=x.r.status==='rejected'?(x.r.reason?.message||''):(x.r.value.error?.message||'');return /relation .* does not exist|schema cache/i.test(m)});
 banner.classList.remove('hidden');
 banner.innerHTML=`
  <strong>⚠ ${failed.length} data source${failed.length>1?'s':''} failed to load — this is why some data may look empty or missing:</strong>
  <ul>${rows}</ul>
  <p>${anyMissingFn?'This usually means the <code>is_admin()</code> function or its RLS policies have not been created yet. ' : ''}${anyMissingTable?'This usually means a table or column referenced by the app does not exist in your database yet. ' : ''}Run <code>UPGRADE_V3_CHAT_ATTACHMENTS.sql</code>, then <code>UPGRADE_V4_DISCOUNT_SYSTEM.sql</code>, then <code>UPGRADE_V5_SAVED_PHONES_AND_NETWORK.sql</code> in your Supabase SQL Editor, in that order, then click Refresh below.</p>
  <button type="button" id="dismissHealthBanner">Dismiss</button>
 `;
 $('dismissHealthBanner')?.addEventListener('click',()=>banner.classList.add('hidden'));
}
function renderAll(){renderStats();renderProducts();renderOrders();renderQuotes();renderCustomers();renderContacts();renderCharts();renderRecent();}
function renderStats(){
 const stock=products.reduce((s,p)=>s+Number(p.stock||0),0);
 const pendingQuotes=quotes.filter(q=>['NEW','REVIEWING','QUOTED'].includes(String(q.status||'').toUpperCase())).length;
 const pendingOrders=orders.filter(o=>['pending','processing','in transit'].includes(String(o.status||'').toLowerCase())).length;
 const paidRevenue=orders.filter(o=>String(o.payment_status||'pending').toLowerCase()==='paid').reduce((s,o)=>s+Number(o.total_amount||o.amount||0),0);
 $('statProducts').textContent=products.length;
 $('statStock').textContent=`${stock.toLocaleString()} units in stock`;
 $('statCustomers').textContent=profiles.filter(p=>p.role!=='admin').length;
 $('statQuotes').textContent=quotes.length;
 $('statPendingQuotes').textContent=`${pendingQuotes} waiting for review`;
 $('statOrders').textContent=orders.length;
 $('statPendingOrders').textContent=`${pendingOrders} pending`;
 $('statRevenue').textContent=money(paidRevenue);
 $('quoteBadge').textContent=pendingQuotes;
 const invPending=orders.filter(o=>String(o.payment_status||'').toLowerCase()==='pending').reduce((s,o)=>s+Number(o.total_amount||o.amount||0),0);
 if($('invStatPending')){$('invStatPending').textContent=money(invPending);$('invStatPaid').textContent=money(paidRevenue);$('invStatTotal').textContent=money(orders.reduce((s,o)=>s+Number(o.total_amount||o.amount||0),0))}
}
function renderCharts(){
 const os=['pending','processing','in transit','delivered','completed','cancelled'];
 const qs=['NEW','REVIEWING','QUOTED','ACCEPTED','DECLINED','CLOSED'];
 bar('orderChart',os,s=>orders.filter(o=>String(o.status||'').toLowerCase()===s).length);
 bar('quoteChart',qs,s=>quotes.filter(q=>String(q.status||'').toUpperCase()===s).length);
 renderTrendChart();
 renderDonutChart();
}
function renderTrendChart(){
 const el=$('trendChart');if(!el)return;
 const days=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));d.setHours(0,0,0,0);return d});
 const dayKey=d=>d.toISOString().slice(0,10);
 const quoteCounts=days.map(d=>quotes.filter(q=>q.created_at&&q.created_at.slice(0,10)===dayKey(d)).length);
 const orderCounts=days.map(d=>orders.filter(o=>o.created_at&&o.created_at.slice(0,10)===dayKey(d)).length);
 const max=Math.max(1,...quoteCounts,...orderCounts);
 const w=680,h=180,pad=10;
 const stepX=(w-pad*2)/(days.length-1);
 const toPoints=arr=>arr.map((v,i)=>`${pad+i*stepX},${h-pad-(v/max)*(h-pad*2)}`).join(' ');
 const quotePts=toPoints(quoteCounts),orderPts=toPoints(orderCounts);
 const labels=days.map(d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric'}));
 el.innerHTML=`
  <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="trend-svg">
   <polyline points="${quotePts}" fill="none" stroke="#2f6fed" stroke-width="2.5"></polyline>
   <polyline points="${orderPts}" fill="none" stroke="#0fb37f" stroke-width="2.5" stroke-dasharray="5,4"></polyline>
  </svg>
  <div class="trend-legend"><span><i style="background:#2f6fed"></i>Quote requests</span><span><i style="background:#0fb37f"></i>Invoices created</span></div>
  <div class="trend-axis"><span>${esc(labels[0])}</span><span>${esc(labels[labels.length-1])}</span></div>
 `;
}
function renderDonutChart(){
 const el=$('donutChart');if(!el)return;
 const segments=[
  {label:'Pending',count:orders.filter(o=>String(o.status).toLowerCase()==='pending').length,color:'#f2c94c'},
  {label:'Processing',count:orders.filter(o=>['processing','in transit'].includes(String(o.status).toLowerCase())).length,color:'#2f6fed'},
  {label:'Completed',count:orders.filter(o=>['delivered','completed'].includes(String(o.status).toLowerCase())).length,color:'#0fb37f'},
  {label:'Cancelled',count:orders.filter(o=>String(o.status).toLowerCase()==='cancelled').length,color:'#e0575b'}
 ];
 const total=Math.max(1,segments.reduce((s,x)=>s+x.count,0));
 let offset=0;
 const r=52,c=2*Math.PI*r;
 const rings=segments.map(seg=>{
  const frac=seg.count/total,len=frac*c;
  const circle=`<circle cx="70" cy="70" r="${r}" fill="none" stroke="${seg.color}" stroke-width="16" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
  offset+=len;
  return circle;
 }).join('');
 el.innerHTML=`
  <svg viewBox="0 0 140 140" class="donut-svg">${rings}<text x="70" y="66" text-anchor="middle" class="donut-total">${orders.length}</text><text x="70" y="84" text-anchor="middle" class="donut-total-label">Invoices</text></svg>
  <div class="donut-legend">${segments.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)} · ${s.count}</span>`).join('')}</div>
 `;
}
function bar(id,labels,get){const el=$(id);if(!el)return;const vals=labels.map(get),max=Math.max(1,...vals);el.innerHTML=labels.map((l,i)=>`<div class="bar-row"><span>${esc(l)}</span><div class="bar-track"><div class="bar-fill" style="width:${vals[i]/max*100}%"></div></div><strong>${vals[i]}</strong></div>`).join('')}
function renderRecent(){
 const rq=$('recentQuotes');if(rq)rq.innerHTML=quotes.slice(0,5).map(q=>`<div class="activity-item"><strong>${esc(q.quote_number||q.id)} · ${esc(q.product_name||'Phone')}</strong><span>${esc(q.customer_name||q.email||'Customer')} · ${esc(q.status)} · ${date(q.created_at)}</span></div>`).join('')||'<div class="empty">No quote requests yet.</div>';
 const ro=$('recentOrders');if(ro)ro.innerHTML=orders.slice(0,5).map(o=>`<div class="activity-item"><strong>${esc(o.order_number||('#NT'+String(o.id).slice(0,8).toUpperCase()))} · ${esc(o.item_name||o.product_name||'Phone')}</strong><span>${esc(o.customer_name||o.customer_email||'Customer')} · ${esc(o.status)} · ${date(o.created_at)}</span></div>`).join('')||'<div class="empty">No invoices yet.</div>';
}
function renderProducts(){const term=($('productSearch')?.value||'').toLowerCase(),f=$('productFilter')?.value||'all';let list=products.filter(p=>`${p.brand} ${p.model} ${p.name} ${p.storage}`.toLowerCase().includes(term));list=list.filter(p=>f==='all'||f==='stock'&&Number(p.stock)>0||f==='low'&&Number(p.stock)>0&&Number(p.stock)<=5||f==='out'&&Number(p.stock)<=0||f==='hidden'&&p.is_hidden);$('productsBody').innerHTML=list.map(p=>{const name=p.name||`${p.brand||''} ${p.model||''}`.trim()||'Phone';const status=Number(p.stock)>0?(p.availability||'In Stock'):'Out of Stock';return `<tr><td><div class="product-cell">${p.image?`<img src="${esc(p.image)}" alt="">`:'<div style="width:48px;height:58px;background:#eef2f6;border-radius:9px"></div>'}<div><strong>${esc(name)}</strong><span>${esc(p.storage||'')} ${p.colour?'· '+esc(p.colour):''}</span></div></div></td><td>${money(p.price)}</td><td>${Number(p.stock||0)}</td><td><span class="pill ${statusClass(status)}">${esc(status)}</span></td><td><span class="pill ${p.is_hidden?'bad':'good'}">${p.is_hidden?'Hidden':'Visible'}</span></td><td><div class="row-actions"><button class="mini" data-edit-product="${esc(p.id)}">Edit</button><button class="mini danger" data-delete-product="${esc(p.id)}">Delete</button></div></td></tr>`}).join('')||'<tr><td colspan="6"><div class="empty">No products found.</div></td></tr>'}

function renderCustomers(){const term=($('customerSearch')?.value||'').toLowerCase();const list=profiles.filter(p=>`${p.full_name} ${p.email}`.toLowerCase().includes(term));$('customersBody').innerHTML=list.map(p=>`<tr><td><strong>${esc(p.full_name||'Unnamed')}</strong></td><td>${esc(p.email||'')}</td><td><span class="pill ${p.role==='admin'?'good':''}">${esc(p.role)}</span></td><td><span class="pill ${statusClass(p.account_status)}">${esc(p.account_status)}</span></td><td>${date(p.created_at)}</td><td>${p.id!==adminUser.id?`<button class="mini" data-toggle-user="${esc(p.id)}">${p.account_status==='active'?'Suspend':'Activate'}</button>`:'Current admin'}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">No customers found.</div></td></tr>'}
function renderContacts(){$('contactsBody').innerHTML=contacts.map(c=>`<tr><td>${esc(c.name||'—')}</td><td>${esc(c.email||'—')}</td><td>${esc(c.subject||'—')}</td><td style="max-width:360px;white-space:normal">${esc(c.message)}${c.admin_reply?`<div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#f3f6fa;border:1px solid #e5ebf2"><strong style="font-size:11px">NovaTech reply:</strong><div>${esc(c.admin_reply)}</div></div>`:''}</td><td>${c.reply_status==='replied'?'<span class="pill good">Replied</span>':'<span class="pill warn">Unreplied</span>'}</td><td>${date(c.created_at)}</td><td><button class="mini" data-reply-contact="${esc(c.id)}">${c.reply_status==='replied'?'Reply again':'Reply'}</button></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">No contact messages yet.</div></td></tr>'}

function renderOrders(){
 const term=($('orderSearch')?.value||'').toLowerCase();const statusFilter=$('orderStatusFilter')?.value||'all';
 let list=orders.filter(o=>`${o.customer_name||''} ${o.customer_email||''} ${o.item_name||o.product_name||''}`.toLowerCase().includes(term));
 if(statusFilter!=='all')list=list.filter(o=>String(o.status||'').toLowerCase()===statusFilter);
 $('ordersBody').innerHTML=list.map(o=>{const initials=(o.customer_name||o.customer_email||'C').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();return `<tr><td><strong>${esc(o.order_number||('#NT'+String(o.id).slice(0,8).toUpperCase()))}</strong></td><td><div class="invoice-customer"><span class="invoice-avatar">${esc(initials)}</span><div><strong>${esc(o.customer_name||'Customer')}</strong><span>${esc(o.customer_email||'')}</span></div></div></td><td>${esc(o.item_name||o.product_name||'Phone')}<span style="display:block;color:#8b98aa;font-size:10px">Qty ${Number(o.quantity||1)}</span></td><td>${money(o.total_amount||o.amount||0)}</td><td><select class="order-status" data-id="${esc(o.id)}">${['pending','processing','in transit','delivered','completed','cancelled'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select><select class="order-payment-status" data-id="${esc(o.id)}"><option value="pending" ${o.payment_status==='pending'?'selected':''}>Payment: Pending</option><option value="awaiting_verification" ${o.payment_status==='awaiting_verification'?'selected':''}>Payment: Awaiting verification</option><option value="paid" ${o.payment_status==='paid'?'selected':''}>Payment: Paid</option><option value="failed" ${o.payment_status==='failed'?'selected':''}>Payment: Failed</option><option value="refunded" ${o.payment_status==='refunded'?'selected':''}>Payment: Refunded</option></select></td><td>${date(o.created_at)}</td></tr>`}).join('')||'<tr><td colspan="6"><div class="empty">No invoices yet — they are created automatically when you accept a quote.</div></td></tr>';
}

async function updateOrder(id,status){
 try{const {data,error}=await supabase.rpc('admin_update_order_status',{p_order_id:id,p_status:status});if(error)return toast(error.message,false);toast('Invoice status updated');await loadAll()}
 catch(err){toast('Could not update status: '+(err?.message||'Unknown error'),false)}
}
async function updatePaymentStatus(id,payment_status){
 try{const {data,error}=await supabase.rpc('admin_update_payment_status',{p_order_id:id,p_payment_status:payment_status});if(error)return toast(error.message,false);toast('Payment status updated');await loadAll()}
 catch(err){toast('Could not update payment status: '+(err?.message||'Unknown error'),false)}
}

function renderQuotes(){
 let list=quotes;
 if(quoteTabFilter!=='all')list=list.filter(q=>(q.quote_type||'retail')===quoteTabFilter);
 $('quotesBody').innerHTML=list.map(q=>`<tr><td><strong>${esc(q.quote_number||String(q.id).slice(0,8))}</strong></td><td>${esc(q.customer_name||'Customer')}<span style="display:block;color:#8b98aa;font-size:10px">${esc(q.email||'')}</span></td><td>${esc(q.product_name||q.product_id||'Phone')}</td><td>${Number(q.quantity||1)}</td><td><span class="pill ${q.quote_type==='wholesale'?'warn':'good'}">${q.quote_type==='wholesale'?'Wholesale':'Retail'}</span></td><td><span class="pill ${statusClass(q.status)}">${esc(q.status)}</span></td><td>${date(q.created_at)}</td><td><button class="mini" data-review-quote="${esc(q.id)}">Review</button></td></tr>`).join('')||'<tr><td colspan="8"><div class="empty">No quote requests yet.</div></td></tr>';
}

function showQuote(id){
 selectedQuote=quotes.find(q=>String(q.id)===String(id));
 if(!selectedQuote)return;
 const q=selectedQuote;
 const total=q.total_amount==null?'':Number(q.total_amount);
 $('quoteEditor').innerHTML=`
  <div class="editor-head"><p class="eyebrow">${q.quote_type==='wholesale'?'WHOLESALE':'RETAIL'} · ${esc(q.quote_number||q.id)}</p><h3>${esc(q.customer_name||'Customer')}</h3><span>${esc(q.email||'')} ${q.phone?'· '+esc(q.phone):''}</span></div>
  <div class="detail-grid">
   <div class="detail-item"><span>Product</span><strong>${esc(q.product_name||'—')}</strong></div>
   <div class="detail-item"><span>Quantity</span><strong>${Number(q.quantity||1)}</strong></div>
   <div class="detail-item"><span>Condition</span><strong>${esc(q.condition||'—')}</strong></div>
   <div class="detail-item"><span>Destination</span><strong>${esc(q.destination||'—')}</strong></div>
   <div class="detail-item"><span>Shipping</span><strong>${esc(q.shipping_preference||'—')}</strong></div>
   ${q.quote_type==='wholesale'?`<div class="detail-item"><span>Business Name</span><strong>${esc(q.business_name||'—')}</strong></div><div class="detail-item"><span>Business Type</span><strong>${esc(q.business_type||'—')}</strong></div><div class="detail-item"><span>Monthly Volume</span><strong>${esc(q.monthly_volume||'—')}</strong></div><div class="detail-item"><span>MOQ Acknowledged</span><strong>${q.moq_acknowledged?'Yes':'No'}</strong></div>`:''}
   ${q.lock_status_requested?`<div class="detail-item"><span>Preferred Lock Status</span><strong>${esc(q.lock_status_requested)}</strong></div>`:''}
   ${q.network_requested?`<div class="detail-item"><span>Preferred Network</span><strong>${esc(q.network_requested)}</strong></div>`:''}
  </div>
  ${q.customer_message||q.message?`<div class="quote-message"><span>Customer message</span><p>${esc(q.customer_message||q.message)}</p></div>`:''}
  <form id="quoteReviewForm">
   <label>Status<select id="qStatus">${['NEW','REVIEWING','QUOTED','ACCEPTED','DECLINED','CLOSED'].map(s=>`<option ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
   <label>Quoted Price ($)<input id="qPrice" type="number" min="0" step="0.01" value="${q.quoted_price??''}"></label>
   <label>Shipping Cost ($)<input id="qShipping" type="number" min="0" step="0.01" value="${q.shipping_cost??''}"></label>
   <label>Final Total ($)<input id="qTotal" type="number" min="0" step="0.01" value="${q.total_amount??''}" placeholder="Enter the exact total you want the customer to pay"><small>NovaTech will use this exact amount. It will not calculate a new total.</small></label>
   <label>Estimated Delivery<input id="qDelivery" value="${esc(q.estimated_delivery||'')}" placeholder="e.g. 5-7 business days"></label>
   <label>Message to Customer<textarea id="qMessage" rows="3" placeholder="Visible to the customer">${esc(q.admin_message||'')}</textarea></label>
   <label>Internal Note<textarea id="qNote" rows="2" placeholder="Admin-only note">${esc(q.admin_note||'')}</textarea></label>
   <p class="editor-total">Customer Total: <strong>${total===''?'Not set':money(total)}</strong></p>
   ${q.order_id?`<p class="editor-hint">✓ Already converted to an invoice.</p>`:''}
   <button type="submit" class="btn primary" id="saveQuoteBtn">Save &amp; Notify Customer</button>
  </form>
 `;
 $('quoteReviewForm').addEventListener('submit',saveQuote);
}

async function replyToContact(id){
 const contact=contacts.find(c=>String(c.id)===String(id));
 if(!contact)return;
 const reply=window.prompt(`Reply to ${contact.name||contact.email||'customer'}:`,contact.admin_reply||'');
 if(reply===null)return;
 const clean=reply.trim();
 if(!clean){toast('Reply cannot be empty.',false);return;}
 try{
  const {error}=await supabase.rpc('admin_reply_contact_message',{p_contact_id:contact.id,p_reply:clean});
  if(error)throw error;
  toast('Reply sent and customer notified');
  await loadAll();
 }catch(err){toast(err?.message||'Could not send reply.',false);}
}

async function saveQuote(e){
 e.preventDefault();
 if(!selectedQuote)return;
 const btn=$('saveQuoteBtn');btn.disabled=true;btn.textContent='Saving…';
 try{
  const status=$('qStatus').value;
  const totalValue=$('qTotal').value;
  if((status==='QUOTED'||status==='ACCEPTED') && totalValue===''){
   toast('Enter the exact Final Total before saving this quote.',false);
   btn.disabled=false;btn.textContent='Save & Notify Customer';
   return;
  }
  const {data,error}=await supabase.rpc('admin_review_quote',{
   p_quote_id:selectedQuote.id,
   p_status:$('qStatus').value,
   p_quoted_price:$('qPrice').value?Number($('qPrice').value):null,
   p_shipping_cost:$('qShipping').value?Number($('qShipping').value):null,
   p_total_amount:$('qTotal').value!==''?Number($('qTotal').value):null,
   p_estimated_delivery:$('qDelivery').value.trim()||null,
   p_admin_note:$('qNote').value.trim()||null,
   p_admin_message:$('qMessage').value.trim()||null
  });
  if(error){toast(error.message,false);return}
  toast(data?.order_created?'Quote accepted — invoice created':'Quote updated');
  await loadAll();
  selectedQuote=quotes.find(q=>String(q.id)===String(selectedQuote.id));
  if(selectedQuote)showQuote(selectedQuote.id);
 }catch(err){
  toast('Could not save: '+(err?.message||'Unknown error'),false);
 }finally{
  if(btn){btn.disabled=false;btn.textContent='Save & Notify Customer'}
 }
}

function openProduct(p=null){$('productModalTitle').textContent=p?'Edit Phone':'Add Phone';$('productForm').reset();$('productId').value=p?.id||'';$('brand').value=p?.brand||'';$('model').value=p?.model||'';$('category').value=p?.category||'';$('storage').value=p?.storage||'';$('ram').value=p?.ram||'';$('colour').value=p?.colour||'';$('condition').value=p?.condition||'New';$('lockStatus').value=p?.lock_status||'';$('network').value=p?.network||'';$('region').value=p?.region||'';$('price').value=p?.price??0;$('discountPercent').value=p?.discount_percent??0;$('oldPrice').value=p?.old_price??'';$('wholesalePrice').value=p?.wholesale_price??'';$('stock').value=p?.stock??0;$('availability').value=p?.availability||'In Stock';$('displayOrder').value=p?.display_order??0;$('shipping').value=p?.shipping||'';$('delivery').value=p?.delivery||'';$('description').value=p?.description||'';$('specifications').value=p?.specifications||'';$('imageUrl').value=p?.image||'';$('featured').checked=!!p?.featured;$('newArrival').checked=!!p?.new_arrival;$('hiddenProduct').checked=!!p?.is_hidden;$('imagePreview').src=p?.image||'';$('imagePreviewWrap').classList.toggle('hidden',!p?.image);$('productModal').classList.remove('hidden')}
async function saveProduct(e){e.preventDefault();const btn=$('saveProductBtn');btn.disabled=true;btn.textContent='Saving…';try{let id=$('productId').value||safeUUID(),image=$('imageUrl').value.trim();const file=$('imageFile').files[0];if(file){const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`products/${id}-${Date.now()}.${ext||'jpg'}`;const up=await supabase.storage.from('product-images').upload(path,file,{upsert:true,contentType:file.type});if(up.error)throw up.error;const pub=supabase.storage.from('product-images').getPublicUrl(path);image=pub.data.publicUrl}
const row={id,product_id:id,name:`${$('brand').value.trim()} ${$('model').value.trim()}`.trim(),brand:$('brand').value.trim(),model:$('model').value.trim(),category:$('category').value.trim(),storage:$('storage').value.trim(),ram:$('ram').value.trim(),colour:$('colour').value.trim(),condition:$('condition').value,lock_status:$('lockStatus').value||null,network:$('network').value||null,region:$('region').value.trim()||null,price:Number($('price').value||0),discount_percent:Math.min(100,Math.max(0,Number($('discountPercent').value||0))),old_price:Number($('oldPrice').value||0),wholesale_price:Number($('wholesalePrice').value||0),stock:Number($('stock').value||0),availability:Number($('stock').value||0)>0?'In Stock':$('availability').value,display_order:Number($('displayOrder').value||0),shipping:$('shipping').value.trim(),delivery:$('delivery').value.trim(),description:$('description').value.trim(),specifications:$('specifications').value.trim(),image,featured:$('featured').checked,new_arrival:$('newArrival').checked,is_hidden:$('hiddenProduct').checked,updated_at:new Date().toISOString()};const {error}=await supabase.from('products').upsert(row,{onConflict:'id'});if(error)throw error;toast('Product saved successfully');$('productModal').classList.add('hidden');await loadAll()}catch(err){console.error(err);toast(err.message||'Could not save product',false)}finally{btn.disabled=false;btn.textContent='Save Product'}}
function subscribeRealtime(){supabase.channel('novatech-admin-live').on('postgres_changes',{event:'*',schema:'public',table:'quotes'},payload=>{if(payload.eventType==='INSERT'&&payload.new&&!quotes.some(q=>q.id===payload.new.id))quotes.unshift(payload.new);if(payload.eventType==='UPDATE'&&payload.new){const i=quotes.findIndex(q=>q.id===payload.new.id);if(i>=0)quotes[i]=payload.new}renderStats();renderQuotes();renderCharts();renderRecent()}).on('postgres_changes',{event:'*',schema:'public',table:'orders'},payload=>{if(payload.eventType==='INSERT'&&payload.new&&!orders.some(o=>o.id===payload.new.id))orders.unshift(payload.new);if(payload.eventType==='UPDATE'&&payload.new){const i=orders.findIndex(o=>o.id===payload.new.id);if(i>=0)orders[i]=payload.new}renderStats();renderOrders();renderCharts()}).on('postgres_changes',{event:'*',schema:'public',table:'products'},payload=>{if(payload.eventType==='INSERT'&&payload.new&&!products.some(p=>p.id===payload.new.id))products.unshift(payload.new);if(payload.eventType==='UPDATE'&&payload.new){const i=products.findIndex(p=>p.id===payload.new.id);if(i>=0)products[i]=payload.new}if(payload.eventType==='DELETE')products=products.filter(p=>p.id!==payload.old.id);renderStats();renderProducts()}).on('postgres_changes',{event:'*',schema:'public',table:'contact_messages'},payload=>{if(payload.eventType==='INSERT'&&payload.new)contacts.unshift(payload.new);if(payload.eventType==='DELETE')contacts=contacts.filter(c=>c.id!==payload.old.id);renderContacts()}).subscribe();}
$('adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='Signing in…';const {error}=await supabase.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});if(error){$('loginError').textContent=error.message;return}await checkAdmin()});
$('logoutBtn').addEventListener('click',async()=>{await supabase.auth.signOut();showLogin();toast('Logged out')});$('refreshBtn').addEventListener('click',loadAll);$('menuBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));$('newProductBtn').addEventListener('click',()=>openProduct());$('productForm').addEventListener('submit',saveProduct);
$('imageFile').addEventListener('change',()=>{const f=$('imageFile').files[0];if(f){$('imagePreview').src=URL.createObjectURL(f);$('imagePreviewWrap').classList.remove('hidden')}});
document.addEventListener('click',async e=>{const nav=e.target.closest('.nav-item');if(nav)go(nav.dataset.view);const goBtn=e.target.closest('[data-go]');if(goBtn)go(goBtn.dataset.go);const edit=e.target.closest('[data-edit-product]');if(edit)openProduct(products.find(p=>String(p.id)===String(edit.dataset.editProduct)));const del=e.target.closest('[data-delete-product]');if(del)deleteProduct(del.dataset.deleteProduct);const review=e.target.closest('[data-review-quote]');if(review)showQuote(review.dataset.reviewQuote);const qtab=e.target.closest('[data-quote-tab]');if(qtab){quoteTabFilter=qtab.dataset.quoteTab;document.querySelectorAll('[data-quote-tab]').forEach(b=>b.classList.toggle('active',b===qtab));renderQuotes()}const user=e.target.closest('[data-toggle-user]');if(user)toggleUser(user.dataset.toggleUser);const close=e.target.closest('[data-close]');if(close)$(close.dataset.close).classList.add('hidden')});
$('productSearch').addEventListener('input',renderProducts);$('productFilter').addEventListener('change',renderProducts);$('orderSearch')?.addEventListener('input',renderOrders);$('orderStatusFilter')?.addEventListener('change',renderOrders);$('customerSearch').addEventListener('input',renderCustomers);document.addEventListener('change',e=>{if(e.target.matches('.order-status'))updateOrder(e.target.dataset.id,e.target.value);if(e.target.matches('.order-payment-status'))updatePaymentStatus(e.target.dataset.id,e.target.value)});
supabase?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});checkAdmin();
document.addEventListener('click',function(e){
 const b=e.target.closest('[data-reply-contact]');
 if(b)replyToContact(b.dataset.replyContact);
});
})();


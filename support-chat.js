(() => {
  'use strict';
  const sb = window.novaSupabase;
  const $ = id => document.getElementById(id);
  const list = $('supportChatList'), messages = $('supportChatMessages');
  const form = $('supportChatForm'), input = $('supportChatInput'), fileInput = $('supportChatFile');
  const preview = $('supportChatPreview'), status = $('supportChatStatus');
  let user = null, conversation = null, pendingFile = null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setStatus = t => { if(status) status.textContent=t||''; };
  const initials = n => String(n||'Customer').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  function media(m){ if(!m.attachment_url) return ''; const type=m.attachment_name||''; if(/\.(mp4|webm|mov|m4v)$/i.test(type)) return `<video class="chat-media" preload="metadata" src="${esc(m.attachment_url)}" data-full-media="video"></video>`; return `<img class="chat-media" src="${esc(m.attachment_url)}" alt="Shared image" data-full-media="image">`; }
  function render(m){ const mine=m.sender==='customer'; return `<div class="support-bubble ${mine?'mine':'theirs'}"><div class="bubble-meta">${mine?'You':'NovaTech Support'} · ${new Date(m.created_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div>${media(m)}${m.body&&m.body!=='Attachment'?`<p>${esc(m.body)}</p>`:''}</div>`; }
  function openLightbox(url,isVideo){let box=document.getElementById('customerMediaLightbox');if(!box){box=document.createElement('div');box.id='customerMediaLightbox';box.className='customer-lightbox';box.innerHTML='<button type="button" class="customer-lightbox-close" aria-label="Close">×</button><div class="customer-lightbox-content"></div>';document.body.appendChild(box);box.addEventListener('click',e=>{if(e.target===box||e.target.closest('.customer-lightbox-close'))closeLightbox();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLightbox();});}box.querySelector('.customer-lightbox-content').innerHTML=isVideo?`<video controls autoplay playsinline src="${esc(url)}"></video>`:`<img src="${esc(url)}" alt="Shared image">`;box.classList.add('show');}
  function closeLightbox(){const box=document.getElementById('customerMediaLightbox');if(box){box.classList.remove('show');box.querySelector('.customer-lightbox-content').innerHTML='';}}
  messages?.addEventListener('click',e=>{const el=e.target.closest('[data-full-media]');if(el)openLightbox(el.currentSrc||el.src,el.dataset.fullMedia==='video');});
  async function init(){
    if(!sb){setStatus('Supabase is not connected.');return;}
    const {data:{user:u},error}=await sb.auth.getUser(); if(error||!u){
    let overlay=document.getElementById('novaChatLoginPrompt');
    if(!overlay){
        overlay=document.createElement('div'); overlay.id='novaChatLoginPrompt'; overlay.className='nova-chat-login-prompt';
        overlay.innerHTML='<div class="nova-chat-login-backdrop"></div><section class="nova-chat-login-card" role="dialog" aria-modal="true"><button type="button" class="nova-chat-login-close" aria-label="Close">×</button><div class="nova-chat-login-icon">⌁</div><div class="nova-chat-login-eyebrow">NOVA TECH SUPPORT</div><h2>Sign in to continue</h2><p>Sign in to chat securely with the Nova Tech support team.</p><div class="nova-chat-login-actions"><button type="button" class="nova-chat-login-primary">Log in</button><button type="button" class="nova-chat-login-secondary">Back to shopping</button></div></section>';
        document.body.appendChild(overlay);
        const close=()=>overlay.classList.remove('is-open');
        overlay.querySelector('.nova-chat-login-close').onclick=close;
        overlay.querySelector('.nova-chat-login-secondary').onclick=()=>{location.href='../index.html';};
        overlay.querySelector('.nova-chat-login-primary').onclick=()=>{location.href='../login.html?returnTo=pages/chat.html';};
        overlay.querySelector('.nova-chat-login-backdrop').onclick=close;
    }
    overlay.classList.add('is-open'); return;
} user=u;
    const {data:existing,error:e}=await sb.from('support_conversations').select('*').eq('customer_id',user.id).eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(e){setStatus(e.message);return;} conversation=existing;
    if(!conversation){const created=await sb.from('support_conversations').insert({customer_id:user.id,status:'open'}).select().single(); if(created.error){setStatus(created.error.message);return;} conversation=created.data;}
    await load(); subscribe();
  }
    let previewUrl = null;
  function chooseFile(file){ if(!file)return; if(!/^image\//.test(file.type)&&!/^video\//.test(file.type)){setStatus('Choose an image or video.');return;} const max=/^video\//.test(file.type)?25:8; if(file.size>max*1024*1024){setStatus(`Files must be under ${max}MB.`);return;} pendingFile=file; previewUrl=URL.createObjectURL(file); const isVideo=/^video\//.test(file.type); preview.hidden=false; preview.innerHTML=`<div class="preview-thumb-row">${isVideo?`<video src="${previewUrl}" muted></video>`:`<img src="${previewUrl}" alt="Preview">`}<span class="preview-filename">${esc(file.name)}</span><button type="button" id="supportPreviewRemove" aria-label="Remove">×</button></div>`; $('supportPreviewRemove').onclick=clearFile; }
  function clearFile(){pendingFile=null;if(fileInput)fileInput.value='';preview.hidden=true;preview.innerHTML='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
  async function load(){ const {data,error}=await sb.from('support_messages').select('*').eq('conversation_id',conversation.id).is('deleted_at',null).order('created_at',{ascending:true}); if(error){setStatus(error.message);return;} messages.innerHTML=(data||[]).map(render).join('')||'<div class="support-empty">Start a conversation with NovaTech Support.</div>'; messages.scrollTop=messages.scrollHeight; await sb.from('support_conversations').update({unread_for_customer:0}).eq('id',conversation.id); }
  function subscribe(){ sb.channel('customer-support-'+conversation.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages',filter:'conversation_id=eq.'+conversation.id},p=>{if(p.new&&p.new.sender==='support'){messages.insertAdjacentHTML('beforeend',render(p.new));messages.scrollTop=messages.scrollHeight;}}).subscribe(); }

  fileInput?.addEventListener('change',e=>chooseFile(e.target.files[0]));
  async function send(e){e.preventDefault(); const text=input.value.trim(); if(!text&&!pendingFile)return; const btn=form.querySelector('button[type=submit]');btn.disabled=true;setStatus('Sending…'); try{let url=null,name=null;if(pendingFile){const safe=pendingFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`chat/${user.id}/${Date.now()}-${safe}`;const up=await sb.storage.from('chat-attachments').upload(path,pendingFile,{upsert:false,contentType:pendingFile.type});if(up.error)throw up.error;url=sb.storage.from('chat-attachments').getPublicUrl(path).data.publicUrl;name=pendingFile.name;} const body=text||'Attachment';const ins=await sb.from('support_messages').insert({conversation_id:conversation.id,customer_id:user.id,sender:'customer',body,message:body,sender_type:'customer',attachment_url:url,attachment_name:name}).select().single();if(ins.error)throw ins.error;await sb.from('support_conversations').update({last_message:body,last_message_preview:body,last_message_at:new Date().toISOString(),unread_for_admin:1,updated_at:new Date().toISOString()}).eq('id',conversation.id);messages.insertAdjacentHTML('beforeend',render(ins.data));messages.scrollTop=messages.scrollHeight;input.value='';clearFile();setStatus('');}catch(err){setStatus(err.message||'Message could not be sent.');}finally{btn.disabled=false;} }
  form?.addEventListener('submit',send); $('supportChatPlus')?.addEventListener('click',()=>fileInput?.click()); init();
})();

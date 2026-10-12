/* Company images are available with the index, before the first job render. */
(()=>{
  const safe=src=>typeof src==='string'&&/^assets\/company-logos\/[a-f0-9]{24}\.(webp|svg)$/.test(src);
  const key=name=>String(name||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog=Object.create(null),fallback='';
  function setManifest(data,defaultImage){
    catalog=Object.create(null);
    if(data&&typeof data==='object'&&!Array.isArray(data))for(const[name,src]of Object.entries(data))if(safe(src))catalog[key(name)]=src;
    fallback=safe(defaultImage)?defaultImage:'';
  }
  function markup(company,letter,eager=false){
    const src=catalog[key(company)]||fallback;
    if(!src)return '<div class="mono">'+esc(letter)+'</div>';
    return '<div class="mono has-company-logo" data-monogram="'+esc(letter)+'"><img class="company-logo" src="'+esc(src)+'" alt="" width="24" height="24" loading="'+(eager?'eager':'lazy')+'" decoding="async" fetchpriority="'+(eager?'auto':'low')+'" /></div>';
  }
  function failed(img){
    if(!img?.matches?.('img.company-logo'))return;
    const box=img.parentElement;
    if(fallback&&img.getAttribute('src')!==fallback&&!img.dataset.fallbackTried){img.dataset.fallbackTried='true';img.src=fallback;return;}
    if(box){box.classList.remove('has-company-logo');box.textContent=box.dataset.monogram||'';}
  }
  document.addEventListener('error',event=>failed(event.target),true);
  async function prepare(root,{timeoutMs=180,maxImages=12}={}){
    const images=[...root.querySelectorAll('img.company-logo')].slice(0,maxImages);
    if(!images.length)return;
    let timer;
    const tasks=images.map(async img=>{
      img.loading='eager';img.addEventListener('error',()=>failed(img),{once:true});
      try{
        if(typeof Image==='undefined'){if(img.decode)await img.decode();return;}
        const ready=new Image(24,24);ready.className='company-logo';ready.alt='';ready.loading='eager';ready.decoding='async';ready.src=img.getAttribute('src');
        await ready.decode();
        if(img.parentElement&&img.getAttribute('src')===ready.getAttribute('src'))img.replaceWith(ready);
      }catch{if(!img.dataset.fallbackTried)failed(img);}
    });
    try{await Promise.race([Promise.allSettled(tasks),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  window.CompanyLogos={setManifest,markup,prepare};
})();

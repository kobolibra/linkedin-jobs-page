/* Logos are optional decoration: jobs and controls never wait for this file. */
(()=>{
  const root=document.getElementById('jobs');if(!root)return;
  let manifest=null,scheduled=false;
  const visible=new Set(),observed=new WeakSet(),failed=new Set();
  const key=name=>String(name||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const paint=card=>{
    const box=card.querySelector('.mono'),src=manifest?.[key(card.dataset.comp)];
    if(!box||box.dataset.logoTried||!src||failed.has(src)||!/^assets\/company-logos\/[a-f0-9]{24}\.webp$/.test(src))return;
    box.dataset.logoTried='true';
    const img=new Image(24,24);img.alt='';img.decoding='async';img.loading='lazy';img.fetchPriority='low';
    img.onload=()=>{if(box.isConnected){box.replaceChildren(img);box.classList.add('has-company-logo');}};
    img.onerror=()=>failed.add(src);img.src=src;
  };
  const observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{
    if(isIntersecting){visible.add(target);if(manifest)paint(target);}else visible.delete(target);
  }),{rootMargin:'120px 0px'});
  const register=node=>{
    if(node.nodeType!==1)return;
    const cards=node.matches('.job')?[node]:node.querySelectorAll('.job');
    cards.forEach(card=>{if(!observed.has(card)){observed.add(card);observer.observe(card);}});
  };
  const start=()=>{
    register(root);
    new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(register))).observe(root,{childList:true,subtree:true});
    const idle=window.requestIdleCallback||((fn)=>setTimeout(fn,0));
    idle(async()=>{
      try{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
        let data;try{const response=await fetch('company-logos.json',{signal:controller.signal,priority:'low'});if(!response.ok)return;data=await response.json();}finally{clearTimeout(timer);}
        if(!data||Array.isArray(data)||typeof data!=='object')return;
        manifest=data;visible.forEach(paint);
      }catch{} // Keep the existing letter when the optional manifest fails.
    },{timeout:2500});
  };
  const wait=()=>{if(scheduled||!root.querySelector('.job'))return;scheduled=true;startup.disconnect();setTimeout(start,0);};
  const startup=new MutationObserver(wait);startup.observe(root,{childList:true});wait();
})();

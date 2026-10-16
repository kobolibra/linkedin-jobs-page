/* A single out-of-flow marker; measure only the row being hovered, never the list. */
(() => {
  const host=document.getElementById('jobs');
  if(!host)return;
  const fine=window.matchMedia('(hover:hover) and (pointer:fine)');
  let current=null,rail=null,frame=0;
  function hide(){
    if(frame){cancelAnimationFrame(frame);frame=0;}
    current=null;rail?.classList.remove('is-visible');
  }
  function paint(instant){
    frame=0;
    if(!fine.matches||!current?.isConnected||current.classList.contains('hidden'))return hide();
    const box=current.getBoundingClientRect();
    if(!box.height)return hide();
    const parent=host.getBoundingClientRect();
    const color=getComputedStyle(current).getPropertyValue('--region').trim();
    if(!rail?.isConnected){
      rail=document.createElement('span');rail.className='job-hover-rail';
      rail.setAttribute('aria-hidden','true');host.appendChild(rail);instant=true;
    }
    if(instant)rail.classList.add('is-instant');
    rail.style.transform='translate3d(0,'+(box.top-parent.top+host.scrollTop)+'px,0)';
    rail.style.height=box.height+'px';rail.style.color=color||'var(--navy)';
    if(current.classList.contains('expired'))rail.classList.add('is-expired');
    else rail.classList.remove('is-expired');
    if(instant){
      // Flush once on entry so the first rail appears at its row, never gliding from page top.
      void rail.offsetWidth;rail.classList.remove('is-instant');
    }
    rail.classList.add('is-visible');
  }
  function queue(instant=false){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>paint(instant));
  }
  host.addEventListener('pointerover',event=>{
    if(!fine.matches||event.pointerType==='touch')return;
    const row=event.target.closest?.('.job');
    if(!row||!host.contains(row)){hide();return;}
    if(row===current)return;
    const instant=!current;current=row;queue(instant);
  });
  host.addEventListener('pointerleave',hide);
  host.addEventListener('pointercancel',hide);
  host.addEventListener('scroll',()=>{if(current)queue(true);},{passive:true});
  window.addEventListener('resize',()=>{if(current)queue(true);},{passive:true});
  fine.addEventListener('change',hide);
  document.addEventListener('jobsfilterchange',hide);
})();

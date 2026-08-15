(function(){
  const regionColor={CN:'cn',HK:'hk',SG:'sg',OTHER:'other'};
  const regionLabel={CN:'CN',HK:'HK',SG:'SG',OTHER:'OTHER'};
  const ticks=(n,unit)=>{const count=Math.max(1,Math.min(34,Math.ceil(n/unit)));return Array.from({length:count},(_,i)=>'<i class="ed-tick '+(i>=Math.min(28,count)?'muted':'')+'"></i>').join('');};
  const intText=s=>{const m=String(s||'').replace(/,/g,'').match(/\d+/);return m?Number(m[0]):0;};
  function enhanceTop(){
    const dist=document.getElementById('dist'),spark=document.getElementById('spark');
    if(!dist||!spark||!dist.querySelector('.dist-row')||dist.dataset.editorial==='1')return false;
    dist.dataset.editorial='1';
    const rows=[...dist.querySelectorAll('.dist-row')];
    dist.innerHTML=rows.map(row=>{
      const key=row.dataset.region||'OTHER',label=row.querySelector('.dist-label')?.textContent||regionLabel[key],valEl=row.querySelector('.dist-val'),count=intText(valEl?.firstChild?.textContent||valEl?.textContent),pct=row.querySelector('.dist-val small')?.textContent||'';
      return '<div class="ed-region-row" data-region="'+key+'"><span class="ed-region-label">'+label+'</span><span class="ed-ticks '+regionColor[key]+'">'+ticks(count,50)+'</span><span class="ed-region-value">'+count.toLocaleString()+'<small>'+pct+'</small></span></div>';
    }).join('');
    const cols=[...spark.querySelectorAll('.spark-col')];
    const markets=['CN','HK','SG','OTHER'];
    spark.innerHTML='<div class="ed-week">'+cols.map(col=>{
      const total=intText(col.querySelector('.spark-total')?.textContent),label=col.querySelector('.spark-label')?.textContent||'',today=col.classList.contains('today');
      const vals={};[...col.querySelectorAll('.spark-seg')].forEach(seg=>{vals[seg.dataset.region||'OTHER']=parseFloat(seg.style.flexGrow)||1;});
      const max=Math.max(1,...markets.map(m=>vals[m]||0));
      const cells=markets.map(m=>'<span class="ed-matrix-cell"><i class="'+regionColor[m]+'" style="width:'+Math.max(vals[m]?8:0,Math.min(100,(vals[m]||0)/max*100))+'%"></i></span>').join('');
      return '<div class="ed-day '+(today?'today':'')+'"><b>'+total+'</b><div class="ed-day-matrix">'+cells+'</div><span>'+label+'</span></div>';
    }).join('')+'</div>';
    const heads=dist.closest('.ac-col')?.querySelector('h3');if(heads)heads.textContent='REGIONAL DISTRIBUTION';
    const sparkHead=spark.closest('.ac-col')?.querySelector('h3');if(sparkHead)sparkHead.innerHTML='SEVEN-DAY ACTIVITY <span class="ed-market-key"><i class="cn"></i>CN <i class="hk"></i>HK <i class="sg"></i>SG <i class="other"></i>OTHER</span>';
    return true;
  }
  function enhanceCompany(){
    const hist=document.getElementById('coHist'); if(!hist||!hist.querySelector('.co-bar'))return;
    const panel=document.getElementById('coPanel');
    if(panel&&!panel.dataset.editorial){
      panel.dataset.editorial='1';
      const meta=document.getElementById('coRegions');
      if(meta)meta.insertAdjacentHTML('afterend','<p class="ed-contract">one tick = one live posting · age measured from first seen</p>');
      const h=hist.closest('.co-sec')?.querySelector('.co-h');if(h)h.innerHTML='POSTING AGE PROFILE <span class="co-hint">click a band to filter</span>';
      const ah=document.querySelector('#coAxisSec .co-h');if(ah)ah.innerHTML='POSTING AGE FIELD <span class="co-hint"><i class="co-sw co-sw-med"></i>median <i class="co-sw co-sw-mean"></i>mean</span>';
    }
    hist.querySelectorAll('.co-bar').forEach(btn=>{
      if(btn.dataset.editorial==='1')return;
      btn.dataset.editorial='1';
      const label=btn.querySelector('.co-bar-l')?.textContent||'',count=intText(btn.querySelector('.co-bar-v')?.textContent),pct=btn.querySelector('.co-bar-p')?.textContent||'';
      btn.innerHTML='<span class="ed-age-label">'+label+'</span><span class="ed-age-ticks">'+ticks(count,2)+'</span><span class="ed-age-value">'+count+'</span><span class="ed-age-pct">'+pct+'</span>';
    });
  }
  const run=()=>{enhanceTop();enhanceCompany();};
  const obs=new MutationObserver(run);obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(run,500);setTimeout(run,1500);setTimeout(run,3000);
})();

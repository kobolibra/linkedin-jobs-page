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
    const days=cols.map(col=>({total:intText(col.querySelector('.spark-total')?.textContent),label:col.querySelector('.spark-label')?.textContent||'',today:col.classList.contains('today'),vals:Object.fromEntries([...col.querySelectorAll('.spark-seg')].map(seg=>[seg.dataset.region||'OTHER',parseFloat(seg.style.flexGrow)||1]))}));
    const markets=['CN','HK','SG','OTHER'].filter(m=>days.some(d=>(d.vals[m]||0)>0));
    const W=430,H=142,left=42,right=8,top=29,rowGap=25,colGap=(W-left-right)/Math.max(days.length-1,1);
    const escSvg=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const maxCell=Math.max(1,...days.flatMap(d=>markets.map(m=>d.vals[m]||0)));
    const regionRows=markets.map((m,ri)=>{const y=top+ri*rowGap;return '<path class="ed-arc-guide" d="M'+left+' '+y+' Q '+(left+(W-left-right)/2)+' '+(y-7)+' '+(W-right)+' '+y+'"/><text class="ed-arc-market" x="2" y="'+(y+3)+'">'+m+'</text>';}).join('');
    const nodes=days.map((d,di)=>{const x=left+di*colGap;const cells=markets.map((m,ri)=>{const v=d.vals[m]||0,y=top+ri*rowGap,r=v?Math.max(3.5,Math.sqrt(v/maxCell)*10):1.5;return '<circle class="ed-arc-node '+regionColor[m]+'" cx="'+x.toFixed(1)+'" cy="'+y+'" r="'+r.toFixed(1)+'"><title>'+escSvg(d.label)+' · '+m+' · '+v+'</title></circle><text class="ed-arc-value" x="'+x.toFixed(1)+'" y="'+(y+r+9)+'">'+v+'</text>';}).join('');return '<text class="ed-arc-total" x="'+x.toFixed(1)+'" y="13">'+d.total+'</text>'+cells+'<text class="ed-arc-day '+(d.today?'today':'')+'" x="'+x.toFixed(1)+'" y="'+(H-4)+'">'+escSvg(d.label)+'</text>';}).join('');
    spark.innerHTML='<svg class="ed-arc-matrix" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Seven-day activity by market">'+regionRows+nodes+'</svg>';
    const heads=dist.closest('.ac-col')?.querySelector('h3');if(heads)heads.textContent='REGIONAL DISTRIBUTION';
    const sparkHead=spark.closest('.ac-col')?.querySelector('h3');if(sparkHead)sparkHead.innerHTML='SEVEN-DAY ACTIVITY <span class="ed-market-key">'+markets.map(m=>'<i class="'+regionColor[m]+'"></i>'+m).join(' ')+'</span>';
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

/* Canonical calendar for the three markets: all share UTC+08:00.
 * Calendar dates are NOT instants; never parse YYYY-MM-DD through the
 * visitor's timezone. The same contract is used by posting_dates.py. */
(function(root){
  'use strict';
  const DAY=86400000,OFFSET=8*3600000,ZONE='Asia/Singapore';
  const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
  function validKey(value){
    if(typeof value!=='string'||!ISO_DAY.test(value))return '';
    const t=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?value:'';
  }
  function timestamp(value){
    if(value instanceof Date)return value.getTime();
    if(typeof value==='number')return Number.isFinite(value)?value:NaN;
    if(typeof value!=='string'||!value.trim())return NaN;
    const v=value.trim(),key=validKey(v);
    if(key)return dayStart(key);
    if(ISO_DAY.test(v))return NaN;
    // Upstream naive timestamps are UTC, just as in posting_dates.py.
    const normalized=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v)
      ?v.replace(' ','T')+'Z':v;
    const t=Date.parse(normalized);
    return Number.isFinite(t)?t:NaN;
  }
  function key(value){
    const plain=validKey(value);
    if(plain)return plain;
    const t=timestamp(value);
    return Number.isFinite(t)?new Date(t+OFFSET).toISOString().slice(0,10):'';
  }
  function dayStart(value){
    const k=validKey(value);
    return k?Date.parse(k+'T00:00:00Z')-OFFSET:NaN;
  }
  function dayEnd(value){const t=dayStart(value);return Number.isFinite(t)?t+DAY:NaN;}
  function addDays(value,n){
    const k=validKey(value);
    if(!k||!Number.isInteger(n))return '';
    return new Date(Date.parse(k+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
  }
  function weekday(value){
    const k=validKey(value);
    return k?new Date(k+'T00:00:00Z').getUTCDay():NaN;
  }
  const dateValue=value=>{const k=key(value);return k?new Date(k+'T00:00:00Z'):null;};
  const shortFormatter=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  const fullFormatter=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const weekdayFormatter=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const stampFormatter=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:ZONE});
  const compactStampFormatter=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:ZONE});
  function shortDay(value){const d=dateValue(value);return d?shortFormatter.format(d):'—';}
  function fullDay(value,{weekday:withWeekday=false}={}){
    const d=dateValue(value);
    return d?(withWeekday?weekdayFormatter:fullFormatter).format(d):'—';
  }
  function formatStamp(value,{compact=false}={}){
    if(validKey(value))return fullDay(value);
    const t=timestamp(value);
    if(!Number.isFinite(t))return '—';
    return (compact?compactStampFormatter:stampFormatter).format(new Date(t)).replace(/,\s*/g,' ');
  }
  const api=Object.freeze({key,dayStart,dayEnd,addDays,weekday,shortDay,fullDay,formatStamp,timestamp});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.JobDates=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);

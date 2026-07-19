import { useState, useEffect } from 'react';
import { supabase } from './supabase/client';

let globalOffset = 0;
let synced = false;

export function useServerTimeOffset() {
  const [offset, setOffset] = useState(globalOffset);

  useEffect(() => {
    if (synced) return;
    
    async function fetchOffset() {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc('get_server_time');
      const t1 = Date.now();
      
      if (!error && data) {
        const serverTime = new Date(data).getTime();
        const latency = (t1 - t0) / 2;
        globalOffset = serverTime - (t0 + latency);
        synced = true;
        setOffset(globalOffset);
      }
    }
    
    fetchOffset();
  }, []);

  return offset;
}

export function getServerDateNow() {
  return Date.now() + globalOffset;
}

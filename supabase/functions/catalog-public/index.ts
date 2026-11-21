import { withSupabase } from "npm:@supabase/server@1.9.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
};
const respond = (data: unknown, status=200) => Response.json(data,{status,headers:{
  ...cors,"Cache-Control":"public, max-age=30"
}});
const parseNumber=(s:string|null, fallback:number,max:number) => {
  if(s===null) return fallback;
  if(!/^\d+$/.test(s)) return null;
  const n=Number(s);
  return Number.isSafeInteger(n) && n<=max ? n : null;
};

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response(null, { status:204, headers:cors });
    if (req.method !== "GET") return respond({error:"Method not allowed"},405);
    const url=new URL(req.url);
    const limit=parseNumber(url.searchParams.get("limit"),30,100);
    const offset=parseNumber(url.searchParams.get("offset"),0,1000000);
    const search=url.searchParams.get("search")?.trim() ?? "";
    if(limit===null || offset===null || limit<1 || search.length>120) {
      return respond({error:"Invalid query parameters"},400);
    }
    const { data,error }=await ctx.supabaseAdmin.rpc("gr_public_catalog", {
      p_limit:limit,p_offset:offset,p_search:search||null
    });
    if(error){
      console.error("catalog-public failed",error.code);
      return respond({error:"Unable to load catalogue"},500);
    }
    return respond({ok:true,...data});
  })
};
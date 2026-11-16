import { withSupabase } from "npm:@supabase/server@1.9.2";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const staffSession = {
  fetch: withSupabase({auth:"user"}, async (req,ctx) => {
    if(req.method!=="GET") return Response.json({error:"Method not allowed"},{status:405});
    const actor=ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if(typeof actor!=="string" || !uuid.test(actor))
      return Response.json({error:"Invalid session"},{status:401});
    const sessionId=ctx.jwtClaims?.session_id;
    if(typeof sessionId!=="string" || !uuid.test(sessionId))
      return Response.json({error:"Invalid session"},{status:401});
    const credential=await ctx.supabaseAdmin.rpc("gr_employee_session_allowed",{p_actor:actor,p_session:sessionId});
    if(credential.error) {
      console.error("staff-session credential check failed",credential.error.code);
      return Response.json({error:"Unable to check staff status"},{status:503});
    }
    if(credential.data!==true) return Response.json({isStaff:false,role:null});
    const {data,error}=await ctx.supabaseAdmin.rpc("gr_staff_session",{p_actor_id:actor});
    if(error){
      console.error("staff-session error",error.code);
      return Response.json({error:"Unable to check staff status"},{status:500});
    }
    return Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
  })
};

export default staffSession;

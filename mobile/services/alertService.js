import { supabase } from "./supabase";

export async function getRecentAlerts(userId, days = 7) {

const desde = new Date();
desde.setDate(desde.getDate() - days);

const {data, error} = await supabase
.from("alert_logs")
.select("id, created_at")
.eq("user_id", userId)
.gte("created_at", desde.toISOString())
.order("created_at", {ascending: true});

if(error){

console.log(error);
return [];

}

return data || [];

}

import { supabase } from "./supabase";

export async function saveLocationPoint(userId, latitude, longitude, speed = null, riskScore = null, source = "gps") {

const {error} = await supabase
.from("location_history")
.insert({

user_id: userId,
latitude,
longitude,
speed,
risk_score: riskScore,
source

});

if(error){

console.log(error);

}

}

export async function getRecentLocationHistory(userId, days = 7) {

const desde = new Date();
desde.setDate(desde.getDate() - days);

const {data, error} = await supabase
.from("location_history")
.select("latitude, longitude, risk_score, created_at")
.eq("user_id", userId)
.gte("created_at", desde.toISOString())
.order("created_at", {ascending: true});

if(error){

console.log(error);
return [];

}

return data || [];

}

import { supabase } from "./supabase";

// riskScore: a conta antiga (0 a 100, maior = mais seguro), mantida para quem ainda lê.
// risco: o score da tela Proteção (0 a 10, maior = mais risco), que o relatório usa.
// Ver data/historico_risco.sql.
export async function saveLocationPoint(userId, latitude, longitude, speed = null, riskScore = null, source = "gps", risco = null) {

const {error} = await supabase
.from("location_history")
.insert({

user_id: userId,
latitude,
longitude,
speed,
risk_score: riskScore,
risco,
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
.select("latitude, longitude, speed, risk_score, risco, created_at")
.eq("user_id", userId)
.gte("created_at", desde.toISOString())
.order("created_at", {ascending: true});

if(error){

console.log(error);
return [];

}

return data || [];

}

export async function getLocationHistoryBetween(userId, startDate, endDate) {

const {data, error} = await supabase
.from("location_history")
.select("latitude, longitude, speed, risk_score, risco, created_at")
.eq("user_id", userId)
.gte("created_at", startDate.toISOString())
.lt("created_at", endDate.toISOString())
.order("created_at", {ascending: true});

if(error){

console.log(error);
return [];

}

return data || [];

}

export async function getSafeLocations(userId) {

const {data, error} = await supabase
.from("safe_locations")
.select("latitude, longitude")
.eq("user_id", userId);

if(error){

console.log(error);
return [];

}

return data || [];

}

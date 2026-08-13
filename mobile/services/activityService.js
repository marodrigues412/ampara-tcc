import { supabase } from "./supabase";

export async function getRecentActivityPeriods(userId, days = 7){

const desde = new Date();
desde.setDate(desde.getDate() - days);

const {data, error} = await supabase
.from("user_activity_status")
.select("tipo, started_at, ended_at")
.eq("user_id", userId)
.gte("started_at", desde.toISOString())
.order("started_at", {ascending: true});

if(error){

console.log(error);
return [];

}

return data || [];

}

export async function getActivityStatus(userId){

const {data,error}=await supabase
.from("user_activity_status")
.select("*")
.eq("user_id",userId)
.is("ended_at",null)
.single();

if(error && error.code!=="PGRST116"){

console.log(error);

}

return data;

}


export async function updateActivityStatus(
userId,
ativo,
tipo="academia"
){

try{

if(ativo){

const {data,error}=await supabase
.from("user_activity_status")
.insert({

user_id:userId,
tipo,
ativo:true,
started_at:new Date().toISOString()

})
.select();

if(error){

console.log(error);

}

return data;

}


const current=
await getActivityStatus(userId);

if(!current)return;


const {data,error}=await supabase
.from("user_activity_status")
.update({

ativo:false,
ended_at:new Date().toISOString()

})
.eq("id",current.id)
.select();

if(error){

console.log(error);

}

return data;

}catch(err){

console.log(err);

}

}
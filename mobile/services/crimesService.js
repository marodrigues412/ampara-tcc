import { supabase } from "./supabase";

export async function buscarOcorrencias(userLat, userLon, raioKm = 3) {
  const delta = raioKm / 111;

  const { data, error } = await supabase
    .from("occurrences")
    .select(`
      id,
      latitude,
      longitude,
      tipo_crime,
      descricao,
      address,
      horario
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", userLat - delta)
    .lte("latitude", userLat + delta)
    .gte("longitude", userLon - delta)
    .lte("longitude", userLon + delta)
    .limit(200);

  if (error) {
    console.error("ERRO SUPABASE (occurrences):", error);
    return [];
  }

  return data;
}

export async function buscarCrimes(userLat, userLon, raioKm = 3) {
  const delta = raioKm / 111;

  const { data, error } = await supabase
    .from("crime_occurrences")
    .select(`
      id,
      latitude,
      longitude,
      natureza_apurada,
      bairro,
      cidade
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", userLat - delta)
    .lte("latitude", userLat + delta)
    .gte("longitude", userLon - delta)
    .lte("longitude", userLon + delta)
    .limit(500);

  if (error) {
    console.error("ERRO SUPABASE:", error);
    return [];
  }

  return data;
}
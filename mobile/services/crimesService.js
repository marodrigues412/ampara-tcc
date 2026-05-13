import { supabase } from "./supabase";

export async function buscarCrimes() {

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
    .limit(50000)

  if (error) {

    console.error(
      "ERRO SUPABASE:",
      error
    )

    return []
  }

  console.log(
    "TOTAL CRIMES:",
    data.length
  )

  console.log(
    "AMOSTRA:",
    data[0]
  )

  return data
}
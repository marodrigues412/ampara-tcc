import { supabase } from "./supabase";

// Compromissos da rotina da usuária (tabela routine_commitments, data/rotina.sql).

export async function listarCompromissos(userId) {
  const { data, error } = await supabase
    .from("routine_commitments")
    .select("*")
    .eq("user_id", userId)
    .order("hora_chegada", { ascending: true });

  if (error) {
    console.error("ERRO SUPABASE (routine_commitments):", error);
    return [];
  }

  return data || [];
}

// Sem id cria um compromisso novo; com id atualiza o existente.
export async function salvarCompromisso(userId, compromisso) {
  const campos = {
    user_id: userId,
    nome: compromisso.nome,
    tipo: compromisso.tipo,
    local_nome: compromisso.local_nome,
    endereco: compromisso.endereco ?? null,
    latitude: compromisso.latitude,
    longitude: compromisso.longitude,
    safe_location_id: compromisso.safe_location_id ?? null,
    // Um dos dois, nunca ambos: o banco recusa as duas combinações erradas.
    dias: compromisso.data ? null : compromisso.dias,
    data: compromisso.data ?? null,
    hora_chegada: compromisso.hora_chegada,
    hora_saida: compromisso.hora_saida,
    transporte: compromisso.transporte,
    avisar_atraso: compromisso.avisar_atraso,
    tolerancia_min: compromisso.tolerancia_min,
    liga_modo_atividade: compromisso.tipo === "exercicio" && compromisso.liga_modo_atividade,
    ativo: compromisso.ativo ?? true,
  };

  const consulta = compromisso.id
    ? supabase.from("routine_commitments").update(campos).eq("id", compromisso.id)
    : supabase.from("routine_commitments").insert(campos);

  const { error } = await consulta;
  if (error) throw error;
}

export async function alternarCompromisso(id, ativo) {
  const { error } = await supabase.from("routine_commitments").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirCompromisso(id) {
  const { error } = await supabase.from("routine_commitments").delete().eq("id", id);
  if (error) throw error;
}

// Atalhos do campo "Onde": os locais seguros que a usuária já cadastrou.
export async function listarLocaisSeguros(userId) {
  const { data, error } = await supabase
    .from("safe_locations")
    .select("id, nome, tipo, endereco, latitude, longitude")
    .eq("user_id", userId)
    .order("nome", { ascending: true });

  if (error) {
    console.error("ERRO SUPABASE (safe_locations):", error);
    return [];
  }

  return data || [];
}

// Usado quando ela marca "Salvar também como local seguro" no cadastro.
export async function criarLocalSeguro(userId, { nome, endereco, latitude, longitude, tipo }) {
  const { data, error } = await supabase
    .from("safe_locations")
    .insert({ user_id: userId, nome, endereco, latitude, longitude, tipo: tipo ?? "Outro" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

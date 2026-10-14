import { supabase } from "./supabase";

// Horários fixos de atividade da usuária (tabela activity_schedules no Supabase).

export async function listarHorariosAtividade(userId) {
  const { data, error } = await supabase
    .from("activity_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("hora_inicio", { ascending: true });

  if (error) {
    console.error("ERRO SUPABASE (activity_schedules):", error);
    return [];
  }

  return data || [];
}

// Sem id cria um horário novo; com id atualiza o existente.
export async function salvarHorarioAtividade(userId, horario) {
  const campos = {
    user_id: userId,
    nome: horario.nome,
    dias: horario.dias,
    hora_inicio: horario.hora_inicio,
    hora_fim: horario.hora_fim,
    ativo: horario.ativo ?? true,
  };

  const consulta = horario.id
    ? supabase.from("activity_schedules").update(campos).eq("id", horario.id)
    : supabase.from("activity_schedules").insert(campos);

  const { error } = await consulta;
  if (error) throw error;
}

export async function alternarHorarioAtividade(id, ativo) {
  const { error } = await supabase.from("activity_schedules").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirHorarioAtividade(id) {
  const { error } = await supabase.from("activity_schedules").delete().eq("id", id);
  if (error) throw error;
}

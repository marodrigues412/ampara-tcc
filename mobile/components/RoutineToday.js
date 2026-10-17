import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import {
  TIPOS_COMPROMISSO, linhaDoTempo, minutosDoDia, horaDosMinutos, dataLocal,
  abrirNoMapa, proximoNosProximosDias,
} from '../utils/rotina'
import { DIAS_SEMANA } from '../utils/activitySchedule'
import { Brand, TemaDaAba } from '../constants/brandTheme'

// "Seu dia" na tela Proteção: os compromissos de hoje em lista, com o atual ou o próximo
// em destaque (e a hora de sair). Tocar num compromisso abre a aba Mapa no lugar dele.

const iconeDoTipo = (tipo) => TIPOS_COMPROMISSO.find((t) => t.id === tipo)?.icone ?? 'location-outline'

// "em 25 min", "em 1 h 10"
const daquiA = (minutos) => {
  if (minutos < 60) return `em ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `em ${h} h ${String(m).padStart(2, '0')}` : `em ${h} h`
}

// "AAAA-MM-DD" montado de volta em números: interpretar texto de data varia de motor para
// motor de JavaScript.
const dataDoTexto = (texto) => {
  const [ano, mes, dia] = texto.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

export default function RoutineToday({ navigation, cor = TemaDaAba['Proteção'].forte, fundo = TemaDaAba['Proteção'].fundo }) {
  const [compromissos, setCompromissos] = useState(null)
  const [casa, setCasa] = useState(null)
  // Atualiza a cada minuto para o "em 25 min" e o destaque andarem sozinhos.
  const [agora, setAgora] = useState(() => new Date())

  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data?.user) return
      const [lista, locais] = await Promise.all([listarCompromissos(data.user.id), listarLocaisSeguros(data.user.id)])
      if (!ativo) return
      setCompromissos(lista)
      setCasa(locais.find((l) => String(l.tipo).toLowerCase() === 'casa') ?? null)
      setAgora(new Date())
    })()
    return () => { ativo = false }
  }, []))

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(relogio)
  }, [])

  const minutoAgora = agora.getHours() * 60 + agora.getMinutes()
  // Os cálculos do dia só mudam na virada do dia, não a cada minuto.
  const diaDeHoje = dataLocal(agora)
  const itens = useMemo(
    () => (compromissos ? linhaDoTempo(compromissos, dataDoTexto(diaDeHoje), casa) : []),
    [compromissos, casa, diaDeHoje],
  )
  // Com o dia acabado (ou vazio), o card não fica parado num "concluído": mostra o
  // próximo compromisso da semana, que é o que a usuária precisa saber em seguida.
  const futuro = useMemo(
    () => (compromissos ? proximoNosProximosDias(compromissos, dataDoTexto(diaDeHoje), casa) : null),
    [compromissos, casa, diaDeHoje],
  )

  const doDia = itens.filter((i) => i.tipo === 'compromisso').map((i) => i.compromisso)
  const trajetoPara = (c) => itens.find((i) => i.tipo === 'trajeto' && i.compromisso === c) ?? null

  // Só o relógio e a rotina cadastrada decidem o estado de cada linha: o app não sabe se
  // ela de fato foi ao lugar, então nada é marcado como "feito".
  const emAndamento = doDia.find((c) => minutoAgora >= minutosDoDia(c.hora_chegada) && minutoAgora < minutosDoDia(c.hora_saida))
  const proximoHoje = doDia.find((c) => minutosDoDia(c.hora_chegada) > minutoAgora)

  const detalheDe = (c) => {
    const horario = `${c.hora_chegada.slice(0, 5)} – ${c.hora_saida.slice(0, 5)}`
    if (c === emAndamento) return { texto: horario, etiqueta: 'agora' }
    if (c !== proximoHoje) return { texto: horario, etiqueta: null }
    const trajeto = trajetoPara(c)
    if (!trajeto) return { texto: horario, etiqueta: `próximo · ${daquiA(minutosDoDia(c.hora_chegada) - minutoAgora)}` }
    const aCaminho = minutoAgora >= trajeto.saida
    return {
      texto: aCaminho ? `${horario} · chegada prevista ${horaDosMinutos(trajeto.chegada)}` : `${horario} · sair às ${horaDosMinutos(trajeto.saida)}`,
      etiqueta: aCaminho ? 'a caminho' : 'próximo',
    }
  }

  const titulo = (
    <View style={styles.cabecalho}>
      <Text style={styles.titulo}>Seu dia</Text>
      <TouchableOpacity onPress={() => navigation.navigate('Routine')} hitSlop={8} style={styles.verTudo} accessibilityRole="button">
        <Text style={[styles.verTudoTexto, { color: cor }]}>Ver rotina</Text>
        <Ionicons name="chevron-forward" size={15} color={cor} />
      </TouchableOpacity>
    </View>
  )

  // Ainda carregando: reserva o espaço sem piscar um estado vazio.
  if (compromissos === null) return <View style={styles.secao}>{titulo}<View style={styles.esqueleto} /></View>

  // Nenhum compromisso cadastrado: convite para montar a rotina.
  if (compromissos.length === 0) {
    return (
      <View style={styles.secao}>
        {titulo}
        <TouchableOpacity style={styles.linha} onPress={() => navigation.navigate('Routine')} accessibilityRole="button">
          <View style={[styles.icone, { backgroundColor: fundo }]}>
            <Ionicons name="calendar-outline" size={17} color={cor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nome}>Monte sua rotina</Text>
            <Text style={styles.detalhe}>Cadastre faculdade, trabalho e academia para o Ampara conhecer seus horários.</Text>
          </View>
          <Ionicons name="add" size={22} color={cor} />
        </TouchableOpacity>
      </View>
    )
  }

  const linha = (c, { texto, etiqueta }, apagado, chave) => (
    // Tocar leva ao mapa do lugar: a pergunta aqui é "como está a região para onde eu vou?".
    <TouchableOpacity
      key={chave}
      style={styles.linha}
      onPress={() => abrirNoMapa(navigation, c)}
      accessibilityRole="button"
      accessibilityLabel={`${c.nome}, ${texto}${etiqueta ? `, ${etiqueta}` : ''}. Ver a região no mapa`}
    >
      <View style={[styles.icone, { backgroundColor: etiqueta ? fundo : '#F3EFF1' }]}>
        <Ionicons name={iconeDoTipo(c.tipo)} size={17} color={etiqueta ? cor : Brand.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.nome, apagado && styles.apagado]} numberOfLines={1}>{c.nome}</Text>
        <Text style={styles.detalhe} numberOfLines={1}>{texto}</Text>
      </View>
      {etiqueta && <Text style={[styles.etiqueta, { color: cor }]}>{etiqueta}</Text>}
      <Ionicons name="chevron-forward" size={16} color="#C9C2C6" />
    </TouchableOpacity>
  )

  return (
    <View style={styles.secao}>
      {titulo}
      {doDia.map((c) => {
        const passou = minutosDoDia(c.hora_saida) <= minutoAgora
        return linha(c, detalheDe(c), passou, c.id)
      })}
      {/* Com o dia acabado (ou vazio), mostra o próximo compromisso da semana. */}
      {!emAndamento && !proximoHoje && futuro && (
        <>
          {doDia.length === 0 && <Text style={styles.aviso}>Nada na sua rotina hoje.</Text>}
          {linha(futuro.compromisso, {
            texto: `${futuro.compromisso.hora_chegada.slice(0, 5)} – ${futuro.compromisso.hora_saida.slice(0, 5)}`,
            etiqueta: futuro.adiante === 1 ? 'amanhã' : DIAS_SEMANA[futuro.dia.getDay()].nome.toLowerCase(),
          }, false, 'futuro')}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 20 },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  titulo: { fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: '#8A8590' },
  verTudo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verTudoTexto: { fontSize: 13, fontWeight: '600' },
  esqueleto: { height: 96, borderRadius: 16, backgroundColor: '#FAF6F7' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  icone: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 15, color: Brand.ink },
  apagado: { color: '#8A8590' },
  detalhe: { fontSize: 12, color: '#8A8590', marginTop: 1 },
  etiqueta: { fontSize: 12, fontWeight: '700' },
  aviso: { fontSize: 13, color: '#8A8590', paddingVertical: 4 },
})

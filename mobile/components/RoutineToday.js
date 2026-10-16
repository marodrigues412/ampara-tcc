import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import {
  TIPOS_COMPROMISSO, TRANSPORTES, linhaDoTempo, minutosDoDia, horaDosMinutos, dataLocal,
  abrirNoMapa, proximoNosProximosDias,
} from '../utils/rotina'
import { DIAS_SEMANA } from '../utils/activitySchedule'
import { Brand } from '../constants/brandTheme'

// Card "Hoje" da tela principal, no formato de widget de agenda: o próximo compromisso em
// destaque, com a hora de sair, e os demais do dia numa fileira que rola para o lado.
// Tocar num compromisso abre a aba Mapa no lugar dele.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const iconeDoTipo = (tipo) => TIPOS_COMPROMISSO.find((t) => t.id === tipo)?.icone ?? 'location-outline'
const transporteDe = (id) => TRANSPORTES.find((t) => t.id === id) ?? TRANSPORTES[2]

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

export default function RoutineToday({ navigation }) {
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

  // Destaque: o compromisso em andamento; senão o próximo de hoje; senão o próximo da semana.
  const emAndamento = doDia.find((c) => minutoAgora >= minutosDoDia(c.hora_chegada) && minutoAgora < minutosDoDia(c.hora_saida))
  const proximoHoje = doDia.find((c) => minutosDoDia(c.hora_chegada) > minutoAgora)
  const destaque = emAndamento ?? proximoHoje ?? futuro?.compromisso ?? null
  const ehDeOutroDia = !emAndamento && !proximoHoje && Boolean(futuro)
  const trajeto = emAndamento ? null : ehDeOutroDia ? futuro.trajeto : destaque ? trajetoPara(destaque) : null
  const aCaminho = !ehDeOutroDia && Boolean(trajeto) && minutoAgora >= trajeto.saida
  const outrosDeHoje = ehDeOutroDia ? [] : doDia.filter((c) => c !== destaque)

  let etiqueta = null
  if (emAndamento) etiqueta = 'Agora'
  else if (ehDeOutroDia) etiqueta = futuro.adiante === 1 ? 'Amanhã' : DIAS_SEMANA[futuro.dia.getDay()].nome
  else if (aCaminho) etiqueta = 'A caminho'
  else if (destaque) etiqueta = `Próximo · ${daquiA(minutosDoDia(destaque.hora_chegada) - minutoAgora)}`

  let rodape = null
  if (emAndamento) rodape = { icone: 'time-outline', texto: `Até ${emAndamento.hora_saida.slice(0, 5)}` }
  else if (trajeto) {
    rodape = {
      icone: transporteDe(trajeto.transporte).icone,
      texto: aCaminho
        ? `Chegada prevista às ${horaDosMinutos(trajeto.chegada)}`
        : `Sair às ${horaDosMinutos(trajeto.saida)} · cerca de ${trajeto.minutos} min`,
    }
  }

  const titulo = (
    <View style={styles.cabecalho}>
      <View>
        <Text style={styles.titulo}>Hoje</Text>
        <Text style={styles.data}>{DIAS_SEMANA[agora.getDay()].nome}, {agora.getDate()} {MESES[agora.getMonth()]}</Text>
      </View>
      <TouchableOpacity onPress={() => navigation.navigate('Routine')} hitSlop={8} style={styles.verTudo} accessibilityRole="button">
        <Text style={styles.verTudoTexto}>Ver rotina</Text>
        <Ionicons name="chevron-forward" size={16} color={Brand.blue} />
      </TouchableOpacity>
    </View>
  )

  // Ainda carregando: reserva o espaço sem piscar um estado vazio.
  if (compromissos === null) return <View style={styles.secao}>{titulo}<View style={[styles.destaque, styles.esqueleto]} /></View>

  // Nenhum compromisso cadastrado: convite para montar a rotina.
  if (compromissos.length === 0) {
    return (
      <View style={styles.secao}>
        {titulo}
        <TouchableOpacity style={styles.convite} onPress={() => navigation.navigate('Routine')} accessibilityRole="button">
          <View style={styles.iconeRedondo}>
            <Ionicons name="calendar-outline" size={22} color={Brand.rose} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.conviteTitulo}>Monte sua rotina</Text>
            <Text style={styles.conviteTexto}>Cadastre faculdade, trabalho e academia para o Ampara conhecer seus horários de deslocamento.</Text>
          </View>
          <Ionicons name="add-circle" size={28} color={Brand.rose} />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.secao}>
      {titulo}

      {ehDeOutroDia && (
        <View style={styles.statusHoje}>
          <Ionicons name={doDia.length ? 'checkmark-circle' : 'sunny-outline'} size={16} color={Brand.green} />
          <Text style={styles.statusHojeTexto}>{doDia.length ? 'Rotina de hoje concluída' : 'Nada na sua rotina hoje'}</Text>
        </View>
      )}

      {destaque ? (
        // Tocar leva ao mapa do lugar: na tela principal, a pergunta é "como está a
        // região para onde eu vou?". Para editar, "Ver rotina".
        <TouchableOpacity
          style={styles.destaque}
          onPress={() => abrirNoMapa(navigation, destaque)}
          accessibilityRole="button"
          accessibilityLabel={`${destaque.nome}, ${destaque.hora_chegada.slice(0, 5)}. Ver a região no mapa`}
        >
          <View style={styles.destaqueTopo}>
            <View style={[styles.etiqueta, emAndamento ? styles.etiquetaAgora : aCaminho ? styles.etiquetaCaminho : null]}>
              <Text style={[styles.etiquetaTexto, emAndamento && styles.etiquetaTextoAgora]}>{etiqueta}</Text>
            </View>
            <View style={styles.verMapa}>
              <Ionicons name="map-outline" size={14} color={Brand.blue} />
              <Text style={styles.verMapaTexto}>Ver região</Text>
            </View>
          </View>
          <View style={styles.destaqueCorpo}>
            <View style={styles.iconeRedondo}>
              <Ionicons name={iconeDoTipo(destaque.tipo)} size={22} color={Brand.rose} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destaqueNome} numberOfLines={1}>{destaque.nome}</Text>
              <Text style={styles.destaqueDetalhe} numberOfLines={1}>
                {destaque.hora_chegada.slice(0, 5)} – {destaque.hora_saida.slice(0, 5)} · {destaque.local_nome}
              </Text>
            </View>
          </View>
          {rodape && (
            <View style={styles.destaqueRodape}>
              <Ionicons name={rodape.icone} size={15} color={Brand.blue} />
              <Text style={styles.destaqueRodapeTexto}>{rodape.texto}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.fimDoDia}>
          <Ionicons name="checkmark-circle-outline" size={20} color={Brand.green} />
          <Text style={styles.fimDoDiaTexto}>
            {doDia.length ? 'Rotina de hoje concluída' : 'Nada na sua rotina esta semana'}
          </Text>
        </View>
      )}

      {/* Os outros compromissos de hoje, em ordem. Os que já passaram ficam apagados. */}
      {outrosDeHoje.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fileira}>
          {outrosDeHoje.map((c) => {
            const passou = minutosDoDia(c.hora_saida) <= minutoAgora
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.mini, passou && styles.miniPassou]}
                onPress={() => abrirNoMapa(navigation, c)}
                accessibilityLabel={`${c.nome}, ${c.hora_chegada.slice(0, 5)}. Ver a região no mapa`}
              >
                <Ionicons name={passou ? 'checkmark' : iconeDoTipo(c.tipo)} size={15} color={passou ? Brand.muted : Brand.rose} />
                <View>
                  <Text style={[styles.miniHora, passou && styles.miniTextoPassou]}>{c.hora_chegada.slice(0, 5)}</Text>
                  <Text style={[styles.miniNome, passou && styles.miniTextoPassou]} numberOfLines={1}>{c.nome}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 18 },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  titulo: { fontSize: 19, fontWeight: '700', color: Brand.ink },
  data: { fontSize: 13, color: Brand.muted, marginTop: 1 },
  verTudo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verTudoTexto: { color: Brand.blue, fontSize: 14, fontWeight: '600' },

  statusHoje: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusHojeTexto: { color: Brand.green, fontSize: 13, fontWeight: '600' },

  destaque: { backgroundColor: Brand.surface, borderRadius: 20, borderWidth: 1, borderColor: Brand.line, padding: 16, gap: 12, shadowColor: '#291D23', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  esqueleto: { height: 128, backgroundColor: Brand.surfaceSoft, borderColor: Brand.surfaceSoft, shadowOpacity: 0, elevation: 0 },
  destaqueTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etiqueta: { backgroundColor: Brand.blueSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaAgora: { backgroundColor: Brand.rose },
  etiquetaCaminho: { backgroundColor: Brand.amberSoft },
  etiquetaTexto: { fontSize: 12, fontWeight: '700', color: Brand.blue },
  etiquetaTextoAgora: { color: '#FFF' },
  verMapa: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verMapaTexto: { color: Brand.blue, fontSize: 12, fontWeight: '600' },
  destaqueCorpo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconeRedondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.surfaceRose, alignItems: 'center', justifyContent: 'center' },
  destaqueNome: { fontSize: 18, fontWeight: '700', color: Brand.ink },
  destaqueDetalhe: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  destaqueRodape: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 11 },
  destaqueRodapeTexto: { color: Brand.blue, fontSize: 13, fontWeight: '600' },

  fimDoDia: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Brand.mint, borderRadius: 16, padding: 14 },
  fimDoDiaTexto: { color: Brand.green, fontSize: 14, fontWeight: '600' },

  fileira: { gap: 8, paddingTop: 10, paddingRight: 4 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: Brand.line, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Brand.surface, maxWidth: 170 },
  miniPassou: { backgroundColor: '#F7F4F5', borderColor: '#F0EAEC' },
  miniHora: { fontSize: 12, fontWeight: '700', color: Brand.ink, fontVariant: ['tabular-nums'] },
  miniNome: { fontSize: 12, color: Brand.muted, maxWidth: 120 },
  miniTextoPassou: { color: '#B9AEB4' },

  convite: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Brand.surfaceSoft, borderRadius: 20, padding: 16 },
  conviteTitulo: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  conviteTexto: { fontSize: 13, color: Brand.muted, marginTop: 3, lineHeight: 18 },
})

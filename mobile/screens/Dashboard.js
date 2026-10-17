import React, { useEffect, useMemo, useState } from 'react'
import {
  StyleSheet, Text, View, Image, ScrollView, ActivityIndicator, Pressable, TouchableOpacity, Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { tallyContactAlerts } from '../utils/weeklyCalculator'
import {
  nivelDoRisco, riscoMedio, riscoPorDia, tendencia, diasMonitorados, riscoDosTrajetos,
  horariosExpostos, descreverHorario, ORDEM_SEMANA, PERIODOS_GRADE,
  lugaresFrequentes, nivelDaRegiao, descreverTempo,
} from '../utils/relatorio'
import { TRANSPORTES, horaDosMinutos, abrirNoMapa } from '../utils/rotina'
import { DIAS_SEMANA } from '../utils/activitySchedule'
import { distanceKm } from '../utils/geo'
import { supabase } from '../services/supabase'
import { getRecentLocationHistory, getLocationHistoryBetween } from '../services/locationService'
import { getRecentAlerts } from '../services/alertService'
import { getDailyRiskAssessmentReport } from '../services/riskAssessmentService'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import { buscarResumoCrimes } from '../services/crimesService'
import { resumoDaLia } from '../services/resumoDaLia'
import { Brand } from '../constants/brandTheme'
import LiaHelpModal from '../components/LiaHelpModal'
import LiaAvatar from '../components/LiaAvatar'

// Relatório: o histórico da usuária na MESMA escala da tela Proteção (0 a 10, maior =
// mais risco), lido da coluna risco do histórico. Contas em utils/relatorio.js.
//
// Os blocos respondem às perguntas que mais aparecem em pesquisas sobre apps de
// segurança: quando estive mais exposta, onde passo meu tempo, estou preparada para uma
// emergência e, resumindo, como foi. Números que só assustam (contagem de crimes) ou
// que não levam a nenhuma decisão (velocidade do GPS) ficaram de fora.

const PERIODOS = [7, 30]
const SECOES = [
  { id: 'resumo', rotulo: 'Resumo', icone: 'pie-chart-outline' },
  { id: 'deslocamentos', rotulo: 'Deslocamentos', icone: 'navigate-outline' },
  { id: 'alertas', rotulo: 'Alertas', icone: 'notifications-outline' },
]
const ALTURA_BARRAS = 92
// Um local seguro ou compromisso a menos disso dá nome ao lugar frequente.
const RAIO_NOME_KM = 0.15

const formatarRisco = (risco) => (risco == null ? '—' : risco.toFixed(1).replace('.', ','))
const transporteDe = (id) => TRANSPORTES.find((t) => t.id === id) ?? TRANSPORTES[2]
const formatarDataHora = (iso) => new Date(iso).toLocaleString('pt-BR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const iconeDoLocal = (tipo) => ({ casa: 'home-outline', trabalho: 'briefcase-outline', faculdade: 'school-outline', academia: 'barbell-outline' }[String(tipo).toLowerCase()] ?? 'location-outline')

function Titulo({ titulo, explicacao, onExplicar }) {
  return (
    <View style={styles.tituloLinha}>
      <Text style={styles.tituloSecao}>{titulo}</Text>
      {explicacao && (
        <Pressable onPress={() => onExplicar(titulo, explicacao)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`O que é ${titulo}?`}>
          <Ionicons name="help-circle-outline" size={18} color={Brand.blue} />
        </Pressable>
      )}
    </View>
  )
}

function Vazio({ texto }) {
  return <Text style={styles.vazio}>{texto}</Text>
}

function Numero({ valor, rotulo }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroValor}>{valor}</Text>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
    </View>
  )
}

export default function Dashboard({ navigation }) {
  const insets = useSafeAreaInsets()
  const [carregando, setCarregando] = useState(true)
  const [ajuda, setAjuda] = useState(null)
  const [dias, setDias] = useState(7)
  const [secao, setSecao] = useState('resumo')
  const [tecnicosAbertos, setTecnicosAbertos] = useState(false)

  const [userId, setUserId] = useState(null)
  const [historico, setHistorico] = useState([])
  const [historicoAnterior, setHistoricoAnterior] = useState([])
  const [alertas, setAlertas] = useState([])
  const [locais, setLocais] = useState([])
  const [contatos, setContatos] = useState([])
  const [compromissos, setCompromissos] = useState([])
  const [avaliacoesBpm, setAvaliacoesBpm] = useState([])
  // Nome e faixa da região de cada lugar frequente, preenchidos depois (consultas extras).
  const [detalhesLugares, setDetalhesLugares] = useState({})
  // { chave, texto } — chave identifica a que período/dados o texto se refere.
  const [resumoLia, setResumoLia] = useState(null)

  const explicar = (title, message) => setAjuda({ title, message })

  const carregar = React.useCallback(async (periodo) => {
    setCarregando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCarregando(false); return }

    const inicioAnterior = new Date()
    inicioAnterior.setDate(inicioAnterior.getDate() - periodo * 2)
    const fimAnterior = new Date()
    fimAnterior.setDate(fimAnterior.getDate() - periodo)

    const [atual, anterior, listaAlertas, resultadoContatos, rotina, seguros, bpm] = await Promise.all([
      getRecentLocationHistory(user.id, periodo),
      getLocationHistoryBetween(user.id, inicioAnterior, fimAnterior),
      getRecentAlerts(user.id, periodo),
      supabase.from('emergency_contacts').select('nome, telefone').eq('user_id', user.id),
      listarCompromissos(user.id),
      listarLocaisSeguros(user.id),
      getDailyRiskAssessmentReport(periodo).catch(() => []),
    ])

    setUserId(user.id)
    setHistorico(atual)
    setHistoricoAnterior(anterior)
    setAlertas(listaAlertas)
    setContatos(resultadoContatos.data || [])
    setCompromissos(rotina)
    setLocais(seguros)
    setAvaliacoesBpm(bpm)
    setCarregando(false)
  }, [])

  // useFocusEffect, e não useEffect: as abas ficam montadas em segundo plano, e um SOS
  // ou um local seguro novo em outra aba só apareceria aqui depois de reiniciar o app.
  useFocusEffect(React.useCallback(() => { carregar(dias) }, [dias, carregar]))

  const casa = locais.find((l) => String(l.tipo).toLowerCase() === 'casa') ?? null
  const media = riscoMedio(historico)
  const nivelMedio = nivelDoRisco(media)
  const variacao = tendencia(historico, historicoAnterior)
  const porDia = useMemo(() => riscoPorDia(historico, dias), [historico, dias])
  const monitorados = diasMonitorados(historico)
  const expostos = useMemo(() => horariosExpostos(historico), [historico])
  const trajetos = useMemo(() => riscoDosTrajetos(compromissos, casa, historico), [compromissos, casa, historico])
  const lugares = useMemo(() => lugaresFrequentes(historico), [historico])
  const rankingContatos = tallyContactAlerts(alertas, contatos)
  const nomePorTelefone = useMemo(() => Object.fromEntries(contatos.map((c) => [c.telefone, c.nome])), [contatos])
  const semHistorico = media == null

  // Score experimental do relógio (parte em teste do grupo): só na seção técnica.
  const leiturasBpm = avaliacoesBpm.reduce((soma, d) => soma + Number(d.sample_count || 0), 0)
  const bpmMedio = leiturasBpm
    ? Math.round(avaliacoesBpm.reduce((soma, d) => soma + Number(d.average_bpm || 0) * Number(d.sample_count || 0), 0) / leiturasBpm)
    : null
  const avaliadas = avaliacoesBpm.reduce((soma, d) => soma + Number(d.scored_count || 0), 0)
  const scoreExperimental = avaliadas
    ? avaliacoesBpm.reduce((soma, d) => soma + Number(d.average_experimental_score || 0) * Number(d.scored_count || 0), 0) / avaliadas
    : null

  // --- Seu preparo: o que deixa a usuária pronta para uma emergência ---
  const preparo = [
    {
      feito: contatos.length > 0,
      texto: contatos.length > 0 ? `${contatos.length} ${contatos.length === 1 ? 'contato' : 'contatos'} de emergência` : 'Cadastrar seus contatos de emergência',
      tela: 'EmergencyContacts',
    },
    { feito: Boolean(casa), texto: casa ? 'Casa cadastrada como local seguro' : 'Cadastrar sua casa como local seguro', tela: 'SafeLocations' },
    { feito: compromissos.length > 0, texto: compromissos.length > 0 ? 'Rotina cadastrada' : 'Cadastrar sua rotina', tela: 'Routine' },
    {
      feito: monitorados >= Math.ceil(dias / 2),
      texto: `Monitoramento ativo em ${monitorados} de ${dias} dias`,
    },
    // O relógio só existe no Android (Galaxy Watch + Health Connect).
    ...(Platform.OS === 'android' ? [{
      feito: leiturasBpm > 0,
      texto: leiturasBpm > 0 ? 'Relógio enviando batimentos' : 'Conectar o relógio',
    }] : []),
  ]
  const preparoFeito = preparo.filter((p) => p.feito).length

  // Nome e região de cada lugar frequente. Nome: local seguro, compromisso ou, sem nenhum
  // dos dois por perto, a rua. Região: a mesma faixa de registros do mapa (1 km).
  const chaveLugares = lugares.map((l) => `${l.latitude.toFixed(4)},${l.longitude.toFixed(4)}`).join('|')
  useEffect(() => {
    if (!lugares.length) return undefined
    let ativo = true
    ;(async () => {
      const novos = {}
      for (const lugar of lugares) {
        const chave = `${lugar.latitude.toFixed(4)},${lugar.longitude.toFixed(4)}`
        const seguro = locais.find((l) => distanceKm(l.latitude, l.longitude, lugar.latitude, lugar.longitude) <= RAIO_NOME_KM)
        const compromisso = compromissos.find((c) => distanceKm(c.latitude, c.longitude, lugar.latitude, lugar.longitude) <= RAIO_NOME_KM)
        let nome = seguro?.nome ?? compromisso?.local_nome ?? null
        if (!nome) {
          try {
            const [endereco] = await Location.reverseGeocodeAsync({ latitude: lugar.latitude, longitude: lugar.longitude })
            nome = endereco?.street ? `Perto da ${endereco.street}` : endereco?.district ?? 'Lugar sem nome'
          } catch {
            nome = 'Lugar sem nome'
          }
        }
        const resumo = seguro ? null : await buscarResumoCrimes(lugar.latitude, lugar.longitude, 1)
        novos[chave] = {
          nome,
          seguro: Boolean(seguro),
          icone: seguro ? iconeDoLocal(seguro.tipo) : compromisso ? 'calendar-outline' : 'location-outline',
          regiao: seguro ? null : nivelDaRegiao(resumo),
        }
      }
      if (ativo) setDetalhesLugares(novos)
    })()
    return () => { ativo = false }
    // chaveLugares resume a lista de lugares; locais e compromissos dão os nomes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLugares, locais, compromissos])

  // --- Resumo da Lia: só números e rótulos vão para a IA ---
  const chaveResumo = semHistorico || !userId ? null : `${userId}|${dias}|${formatarRisco(media)}`
  useEffect(() => {
    if (!chaveResumo) return undefined
    let ativo = true
    const pendentes = preparo.filter((p) => !p.feito).map((p) => p.texto.toLowerCase())
    resumoDaLia(userId, {
      dias,
      riscoMedio: formatarRisco(media),
      faixa: nivelMedio.rotulo.toLowerCase(),
      variacao: variacao && !variacao.igual ? `${Math.abs(variacao.variacao)}% ${variacao.melhorou ? 'menor' : 'maior'}` : null,
      horarioMaisExposto: expostos.pior ? `${descreverHorario(expostos.pior).toLowerCase()} (risco ${formatarRisco(expostos.pior.risco)})` : null,
      diasMonitorados: monitorados,
      alertas: alertas.length,
      preparo: pendentes.length ? pendentes.join(', ') : null,
    }).then((texto) => { if (ativo) setResumoLia({ chave: chaveResumo, texto }) })
    return () => { ativo = false }
    // O texto só muda quando muda o período ou o risco médio (chaveResumo); o resto é
    // contexto do mesmo cálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveResumo])
  const textoLia = resumoLia?.chave === chaveResumo ? resumoLia.texto : undefined

  if (carregando) {
    return (
      <SafeAreaView style={[styles.container, styles.centro]}>
        <ActivityIndicator size="large" color={Brand.rose} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Math.max(insets.top - 30, 10) }]}>
      <ScrollView contentContainerStyle={styles.conteudo} showsVerticalScrollIndicator={false}>
        <View style={styles.topo}>
          <View>
            <Text style={styles.titulo}>Seu relatório</Text>
            <Text style={styles.subtitulo}>Últimos {dias} dias</Text>
          </View>
          <Image source={require('../assets/images/maos-ampara-azul.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.periodos}>
          {PERIODOS.map((p) => (
            <Pressable key={p} onPress={() => setDias(p)} style={[styles.periodo, dias === p && styles.periodoAtivo]} accessibilityRole="button" accessibilityState={{ selected: dias === p }}>
              <Text style={[styles.periodoTexto, dias === p && styles.periodoTextoAtivo]}>{p} dias</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.abas} accessibilityRole="tablist">
          {SECOES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSecao(s.id)}
              style={[styles.aba, secao === s.id && styles.abaAtiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: secao === s.id }}
            >
              <Ionicons name={s.icone} size={16} color={secao === s.id ? Brand.rose : Brand.muted} />
              <Text style={[styles.abaTexto, secao === s.id && styles.abaTextoAtiva]}>{s.rotulo}</Text>
            </Pressable>
          ))}
        </View>

        {secao === 'resumo' && (
          <>
            {semHistorico ? (
              <View style={styles.aviso}>
                <Ionicons name="time-outline" size={20} color={Brand.blue} />
                <Text style={styles.avisoTexto}>
                  Ainda não há histórico no período. O relatório usa o mesmo risco da tela Proteção, registrado enquanto o monitoramento está ativo.
                </Text>
              </View>
            ) : (
              <>
                <View style={[styles.destaque, { backgroundColor: nivelMedio.fundo }]}>
                  <View>
                    <Text style={[styles.destaqueRotulo, { color: nivelMedio.cor }]}>Risco médio</Text>
                    <Text style={[styles.destaqueValor, { color: nivelMedio.cor }]}>
                      {formatarRisco(media)}<Text style={styles.destaqueMax}>/10</Text>
                    </Text>
                    <Text style={[styles.destaqueNivel, { color: nivelMedio.cor }]}>{nivelMedio.rotulo}</Text>
                  </View>
                  {variacao && !variacao.igual && (
                    <View style={styles.tendencia}>
                      <Ionicons name={variacao.melhorou ? 'trending-down' : 'trending-up'} size={18} color={variacao.melhorou ? Brand.green : Brand.amber} />
                      <Text style={[styles.tendenciaTexto, { color: variacao.melhorou ? Brand.green : Brand.amber }]}>
                        {Math.abs(variacao.variacao)}% {variacao.melhorou ? 'menor' : 'maior'}{'\n'}que no período anterior
                      </Text>
                    </View>
                  )}
                </View>

                {/* Resumo em uma frase, escrito pela Lia a partir dos números acima. */}
                {textoLia !== null && (
                  <View style={styles.lia}>
                    <LiaAvatar size={44} reaction="oi" showRing={false} showBadge={false} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.liaRotulo}>Lia resume</Text>
                      {textoLia === undefined ? (
                        <Text style={styles.liaCarregando}>Lia está escrevendo…</Text>
                      ) : (
                        <Text style={styles.liaTexto}>{textoLia}</Text>
                      )}
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.secao}>
              <Titulo
                titulo="Risco por dia"
                explicacao="Média do risco de cada dia, na mesma escala da tela Proteção: quanto maior, mais risco. Dias sem registro aparecem vazios. É um resumo do seu histórico no app, não uma previsão."
                onExplicar={explicar}
              />
              <View style={styles.barras} accessibilityLabel="Gráfico do risco por dia">
                {porDia.map((d) => {
                  const nivel = nivelDoRisco(d.risco)
                  return (
                    <View key={d.data.toISOString()} style={styles.barraDia}>
                      <View style={[
                        styles.barraDiaPreenchida,
                        d.risco == null
                          ? styles.barraDiaVazia
                          : { height: Math.max(6, (d.risco / 10) * ALTURA_BARRAS), backgroundColor: nivel.cor },
                      ]} />
                    </View>
                  )
                })}
              </View>
              <View style={styles.barrasRotulos}>
                {dias === 7
                  ? porDia.map((d) => <Text key={d.data.toISOString()} style={styles.barraDiaRotulo}>{d.rotulo}</Text>)
                  : [porDia[0], porDia[Math.floor(porDia.length / 2)], porDia[porDia.length - 1]].map((d) => (
                    <Text key={d.data.toISOString()} style={styles.barraDiaRotulo}>{d.data.getDate()}/{d.data.getMonth() + 1}</Text>
                  ))}
              </View>
            </View>

            <View style={styles.secao}>
              <Titulo
                titulo="Seu preparo"
                explicacao="O que deixa você pronta para uma emergência. Cada item que falta pode ser resolvido com um toque."
                onExplicar={explicar}
              />
              <View style={styles.preparoTopo}>
                <Text style={styles.preparoContagem}>{preparoFeito} de {preparo.length}</Text>
                <View style={styles.preparoTrilha}>
                  <View style={[styles.preparoBarra, { width: `${(preparoFeito / preparo.length) * 100}%` }]} />
                </View>
              </View>
              {preparo.map((item) => {
                const conteudo = (
                  <>
                    <Ionicons name={item.feito ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={item.feito ? Brand.green : Brand.muted} />
                    <Text style={[styles.preparoTexto, !item.feito && styles.preparoPendente]}>{item.texto}</Text>
                    {!item.feito && item.tela && <Ionicons name="chevron-forward" size={16} color={Brand.rose} />}
                  </>
                )
                return !item.feito && item.tela ? (
                  <TouchableOpacity key={item.texto} style={styles.preparoItem} onPress={() => navigation.navigate(item.tela)}>{conteudo}</TouchableOpacity>
                ) : (
                  <View key={item.texto} style={styles.preparoItem}>{conteudo}</View>
                )
              })}
            </View>

            {/* Score experimental do relógio: parte em teste, fica recolhida para não
                misturar com o risco que a usuária conhece. */}
            <TouchableOpacity style={styles.tecnicosCabecalho} onPress={() => setTecnicosAbertos((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: tecnicosAbertos }}>
              <Ionicons name="flask-outline" size={16} color={Brand.muted} />
              <Text style={styles.tecnicosTitulo}>Dados técnicos do relógio (experimental)</Text>
              <Ionicons name={tecnicosAbertos ? 'chevron-up' : 'chevron-down'} size={16} color={Brand.muted} />
            </TouchableOpacity>
            {tecnicosAbertos && (
              <View style={styles.tecnicos}>
                {leiturasBpm === 0 ? (
                  <Vazio texto="As leituras do relógio aparecem aqui quando o Galaxy Watch estiver conectado." />
                ) : (
                  <>
                    <View style={styles.numeros}>
                      <Numero valor={`${bpmMedio} bpm`} rotulo="média no período" />
                      <Numero valor={scoreExperimental == null ? '—' : `${formatarRisco(scoreExperimental)}/10`} rotulo="score experimental" />
                    </View>
                    <Text style={styles.nota}>{leiturasBpm} leituras. Score em teste, não validado e não usado para acionar alertas.</Text>
                  </>
                )}
              </View>
            )}
          </>
        )}

        {secao === 'deslocamentos' && (
          <>
            <View style={styles.secao}>
              <Titulo
                titulo="Seus horários mais expostos"
                explicacao="Cada quadradinho é a média do risco registrado naquele dia da semana e parte do dia. Ajuda a ver quando você costuma estar mais exposta, segundo o seu histórico no app."
                onExplicar={explicar}
              />
              {semHistorico ? (
                <Vazio texto="Ainda não há histórico no período." />
              ) : (
                <>
                  <View style={styles.grade}>
                    <View style={styles.gradeLinha}>
                      <Text style={styles.gradeRotuloLinha} />
                      {ORDEM_SEMANA.map((dia) => <Text key={dia} style={styles.gradeRotuloColuna}>{DIAS_SEMANA[dia].curto}</Text>)}
                    </View>
                    {PERIODOS_GRADE.map((periodo) => (
                      <View key={periodo.id} style={styles.gradeLinha}>
                        <Text style={styles.gradeRotuloLinha}>{periodo.rotulo}</Text>
                        {ORDEM_SEMANA.map((dia) => {
                          const risco = expostos.grade[periodo.id][dia]
                          return (
                            <View
                              key={dia}
                              style={[styles.gradeCelula, risco == null ? styles.gradeVazia : { backgroundColor: nivelDoRisco(risco).cor, opacity: 0.35 + (risco / 10) * 0.65 }]}
                              accessibilityLabel={`${DIAS_SEMANA[dia].nome}, ${periodo.rotulo}: ${risco == null ? 'sem registros' : `risco ${formatarRisco(risco)}`}`}
                            />
                          )
                        })}
                      </View>
                    ))}
                  </View>
                  {expostos.pior && (
                    <Text style={styles.nota}>
                      {descreverHorario(expostos.pior)} foi o seu horário mais exposto ({nivelDoRisco(expostos.pior.risco).rotulo.toLowerCase()}).
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={styles.secao}>
              <Titulo
                titulo="Trajetos da sua rotina"
                explicacao="Os trajetos entre os compromissos da sua rotina, com o risco médio registrado nesse horário nos dias em que eles acontecem. Sem registro no horário, o app ainda não tem como dizer."
                onExplicar={explicar}
              />
              {compromissos.length === 0 ? (
                <TouchableOpacity style={styles.convite} onPress={() => navigation.navigate('Routine')}>
                  <Ionicons name="calendar-outline" size={20} color={Brand.rose} />
                  <Text style={styles.conviteTexto}>Cadastre sua rotina para ver o risco dos seus trajetos.</Text>
                  <Ionicons name="chevron-forward" size={18} color={Brand.rose} />
                </TouchableOpacity>
              ) : trajetos.length === 0 ? (
                <Vazio texto="Cadastre sua Casa nos locais seguros e mais de um compromisso para ver os trajetos." />
              ) : (
                trajetos.map((t) => {
                  const nivel = nivelDoRisco(t.risco)
                  return (
                    <View key={t.chave} style={styles.linhaLista}>
                      <Ionicons name={transporteDe(t.transporte).icone} size={18} color={Brand.blue} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaNome} numberOfLines={1}>{t.origem} → {t.destino}</Text>
                        <Text style={styles.linhaDetalhe}>Sai às {horaDosMinutos(t.saida)}</Text>
                      </View>
                      <View style={[styles.selo, { backgroundColor: nivel.fundo }]}>
                        <Text style={[styles.seloTexto, { color: nivel.cor }]}>{t.risco == null ? 'Sem registros' : nivel.rotulo}</Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            <View style={styles.secao}>
              <Titulo
                titulo="Seus lugares frequentes"
                explicacao="Onde você passou mais tempo no período, pelo seu histórico de localização. Para lugares que não são locais seguros, mostra a quantidade de ocorrências registradas num raio de 1 km, como no mapa. Toque para ver a região."
                onExplicar={explicar}
              />
              {lugares.length === 0 ? (
                <Vazio texto="Seus lugares frequentes aparecem depois de alguns dias de uso com o monitoramento ativo." />
              ) : (
                lugares.map((lugar) => {
                  const chave = `${lugar.latitude.toFixed(4)},${lugar.longitude.toFixed(4)}`
                  const detalhe = detalhesLugares[chave]
                  const selo = detalhe?.seguro
                    ? { rotulo: 'Local seguro', cor: Brand.green, fundo: Brand.mint }
                    : detalhe?.regiao
                  return (
                    <TouchableOpacity
                      key={chave}
                      style={styles.linhaLista}
                      onPress={() => abrirNoMapa(navigation, { latitude: lugar.latitude, longitude: lugar.longitude, local_nome: detalhe?.nome ?? 'Lugar frequente' })}
                      accessibilityRole="button"
                      accessibilityLabel={`${detalhe?.nome ?? 'Lugar frequente'}, ${descreverTempo(lugar.minutos)}. Ver no mapa`}
                    >
                      <Ionicons name={detalhe?.icone ?? 'location-outline'} size={18} color={Brand.rose} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaNome} numberOfLines={1}>{detalhe?.nome ?? '…'}</Text>
                        <Text style={styles.linhaDetalhe}>{descreverTempo(lugar.minutos)} no período</Text>
                      </View>
                      {selo && (
                        <View style={[styles.selo, { backgroundColor: selo.fundo }]}>
                          <Text style={[styles.seloTexto, { color: selo.cor }]}>{selo.rotulo}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          </>
        )}

        {secao === 'alertas' && (
          <>
            <View style={styles.numeros}>
              <Numero valor={String(alertas.length)} rotulo={alertas.length === 1 ? 'alerta SOS enviado' : 'alertas SOS enviados'} />
              <Numero valor={String(rankingContatos.length)} rotulo={rankingContatos.length === 1 ? 'contato acionado' : 'contatos acionados'} />
            </View>

            <View style={styles.secao}>
              <Titulo titulo="Histórico" explicacao="Os alertas SOS enviados no período e quem recebeu cada um." onExplicar={explicar} />
              {alertas.length === 0 ? (
                <Vazio texto="Nenhum alerta enviado no período." />
              ) : (
                alertas.slice(-10).reverse().map((alerta) => (
                  <View key={alerta.id} style={styles.linhaLista}>
                    <Ionicons name="alert-circle" size={20} color={Brand.danger} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome}>SOS enviado</Text>
                      {!!alerta.recipient_names && (
                        <Text style={styles.linhaDetalhe} numberOfLines={1}>
                          Para {alerta.recipient_names.split(',').map((t) => t.trim()).filter(Boolean).map((tel) => nomePorTelefone[tel] || tel).join(', ')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.alertaData}>{formatarDataHora(alerta.created_at)}</Text>
                  </View>
                ))
              )}
            </View>

            {rankingContatos.length > 0 && (
              <View style={styles.secao}>
                <Titulo titulo="Quem mais recebeu seus alertas" onExplicar={explicar} />
                {rankingContatos.map((c) => (
                  <View key={c.telefone} style={styles.contato}>
                    <View style={styles.avatar}><Text style={styles.avatarTexto}>{c.nome?.charAt(0)?.toUpperCase()}</Text></View>
                    <Text style={styles.contatoNome}>{c.nome}</Text>
                    <Text style={styles.contatoContagem}>{c.count} {c.count === 1 ? 'alerta' : 'alertas'}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LiaHelpModal visible={Boolean(ajuda)} title={ajuda?.title} message={ajuda?.message} onClose={() => setAjuda(null)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.canvas },
  centro: { justifyContent: 'center', alignItems: 'center' },
  conteudo: { paddingHorizontal: 20, paddingBottom: 40 },

  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 14 },
  titulo: { fontSize: 26, fontWeight: '700', color: Brand.rose },
  subtitulo: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  logo: { width: 40, height: 40 },

  periodos: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  periodo: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: Brand.line },
  periodoAtivo: { backgroundColor: Brand.blue, borderColor: Brand.blue },
  periodoTexto: { fontSize: 13, fontWeight: '600', color: Brand.blue },
  periodoTextoAtivo: { color: '#FFF' },

  abas: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Brand.line, marginBottom: 16 },
  aba: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: Brand.rose },
  abaTexto: { color: Brand.muted, fontSize: 12, fontWeight: '600' },
  abaTextoAtiva: { color: Brand.rose },

  destaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 22, padding: 18 },
  destaqueRotulo: { fontSize: 13, fontWeight: '700' },
  destaqueValor: { fontSize: 44, fontWeight: '800', lineHeight: 50, fontVariant: ['tabular-nums'] },
  destaqueMax: { fontSize: 18, fontWeight: '500' },
  destaqueNivel: { fontSize: 15, fontWeight: '700' },
  tendencia: { alignItems: 'flex-end', gap: 2, maxWidth: '45%' },
  tendenciaTexto: { fontSize: 12, fontWeight: '600', textAlign: 'right' },

  lia: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: Brand.surfaceSoft, borderRadius: 18, padding: 14, marginTop: 12 },
  liaRotulo: { fontSize: 12, fontWeight: '700', color: Brand.rose, marginBottom: 3 },
  liaTexto: { fontSize: 14, color: Brand.ink, lineHeight: 21 },
  liaCarregando: { fontSize: 13, color: Brand.muted, fontStyle: 'italic' },

  aviso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: Brand.blueSoft, borderRadius: 16, padding: 14 },
  avisoTexto: { flex: 1, color: Brand.blue, fontSize: 13, lineHeight: 19 },

  secao: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: Brand.line },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  tituloSecao: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  vazio: { fontSize: 13, color: Brand.muted, lineHeight: 19 },
  nota: { fontSize: 12, color: Brand.muted, marginTop: 10, lineHeight: 17 },

  barras: { height: ALTURA_BARRAS, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barraDia: { flex: 1, height: ALTURA_BARRAS, justifyContent: 'flex-end' },
  barraDiaPreenchida: { borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barraDiaVazia: { height: 4, backgroundColor: Brand.line, borderRadius: 2 },
  barrasRotulos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barraDiaRotulo: { flex: 1, textAlign: 'center', fontSize: 11, color: Brand.muted, fontWeight: '600' },

  preparoTopo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  preparoContagem: { fontSize: 22, fontWeight: '800', color: Brand.rose },
  preparoTrilha: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F3EFF1', overflow: 'hidden' },
  preparoBarra: { height: 8, borderRadius: 4, backgroundColor: Brand.rose },
  preparoItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  preparoTexto: { flex: 1, fontSize: 14, color: Brand.ink },
  preparoPendente: { color: Brand.muted },

  grade: { gap: 4 },
  gradeLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gradeRotuloLinha: { width: 70, fontSize: 11, color: Brand.muted, fontWeight: '600' },
  gradeRotuloColuna: { flex: 1, textAlign: 'center', fontSize: 11, color: Brand.muted, fontWeight: '600' },
  gradeCelula: { flex: 1, height: 26, borderRadius: 6 },
  gradeVazia: { backgroundColor: '#F5F1F3' },

  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  numero: { flexBasis: '47%', flexGrow: 1, backgroundColor: Brand.surfaceSoft, borderRadius: 16, padding: 14 },
  numeroValor: { fontSize: 22, fontWeight: '800', color: Brand.ink },
  numeroRotulo: { fontSize: 12, color: Brand.muted, marginTop: 2 },

  tecnicosCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingVertical: 10 },
  tecnicosTitulo: { flex: 1, fontSize: 13, color: Brand.muted, fontWeight: '600' },
  tecnicos: { paddingBottom: 10 },

  convite: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Brand.surfaceSoft, borderRadius: 14, padding: 14 },
  conviteTexto: { flex: 1, color: Brand.ink, fontSize: 13 },
  linhaLista: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F5EEF1' },
  linhaNome: { fontSize: 14, color: Brand.ink, fontWeight: '600' },
  linhaDetalhe: { fontSize: 12, color: Brand.muted, marginTop: 1 },
  selo: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },

  alertaData: { fontSize: 11, color: Brand.muted },
  contato: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Brand.surfaceRose, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: Brand.rose, fontWeight: '700' },
  contatoNome: { flex: 1, fontSize: 14, color: Brand.ink },
  contatoContagem: { fontSize: 13, color: Brand.muted },
})

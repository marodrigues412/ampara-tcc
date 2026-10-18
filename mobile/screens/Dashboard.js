import React, { useEffect, useMemo, useState } from 'react'
import {
  StyleSheet, Text, View, ScrollView, ActivityIndicator, Pressable, TouchableOpacity, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { tallyContactAlerts } from '../utils/weeklyCalculator'
import { nomeDoTelefone } from '../utils/contatos'
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
import { getDailyRiskAssessmentReport, getRiskLevelReport } from '../services/riskAssessmentService'
import { gradePorNivel, nivelNaJanela, nivelPorDia, normalizarLinhas, minutosDe, porModoDeSensores, resumoPorNivel, tendenciaDoAlto } from '../utils/relatorioPorNivel'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import { buscarResumoCrimes } from '../services/crimesService'
import { resumoDaLia } from '../services/resumoDaLia'
import { contextoDosLugares } from '../services/contextoDosLugaresService'
import { buscarEnderecoReverso } from '../services/enderecoReverso'
import { Brand, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'
import PopupAmpara, { LinhaDoPopup } from '../components/PopupAmpara'
import LiaHelpModal from '../components/LiaHelpModal'
import LiaAvatar from '../components/LiaAvatar'

// Relatório: o histórico da usuária na MESMA escala da tela Proteção (0 a 10, maior =
// mais risco), lido da coluna risco do histórico. Contas em utils/relatorio.js.
//
// Os blocos respondem às perguntas que mais aparecem em pesquisas sobre apps de
// segurança: quando estive mais exposta, onde passo meu tempo, estou preparada para uma
// emergência e, resumindo, como foi. Números que só assustam (contagem de crimes) ou
// que não levam a nenhuma decisão (velocidade do GPS) ficaram de fora.

const TEMA = TemaDaAba.Dashboard
const PERIODOS = [7, 30]
const SECOES = [
  { id: 'resumo', rotulo: 'Resumo', icone: 'pie-chart-outline' },
  { id: 'deslocamentos', rotulo: 'Deslocamentos', icone: 'navigate-outline' },
  { id: 'alertas', rotulo: 'Alertas', icone: 'notifications-outline' },
]
const ALTURA_BARRAS = 92
// Um local seguro ou compromisso a menos disso dá nome ao lugar frequente.
const RAIO_NOME_KM = 0.15

// O relatório usa o nível das 3 camadas (risk_level_report), o mesmo da tela Proteção.
// O código antigo, montado sobre o score de pontos 0–10 (coluna risco do histórico),
// fica escondido para não haver dois scores no app; apagar depois da Eureka
// (docs/PENDENCIAS_POS_EUREKA.md).
const MOSTRAR_SCORE_DE_PONTOS = false

// Cores e rótulos dos níveis do score de 3 camadas (os mesmos da tela Proteção).
const NIVEL_VISUAL = {
  alto: { rotulo: 'Alto', cor: Brand.danger, fundo: '#FBE3E7' },
  moderado: { rotulo: 'Moderado', cor: Brand.amber, fundo: Brand.amberSoft },
  baixo: { rotulo: 'Baixo', cor: Brand.green, fundo: Brand.mint },
  sem_nivel: { rotulo: 'Sem nível', cor: '#CFC6CB', fundo: '#F3EFF1' },
}
// De cima para baixo na barra empilhada.
const ORDEM_NA_BARRA = ['sem_nivel', 'alto', 'moderado', 'baixo']
const formatarPct = (pct) => `${Math.round(pct)}%`
const ROTULO_DO_MODO = {
  completo: 'completo (relógio e celular)',
  so_celular: 'só celular',
  parcial: 'relógio parcial',
  so_relogio: 'só relógio',
  desconhecido: 'não registrado',
}
// Faixas do mapa da região (Camada 1), para "contexto dos lugares".
const FAIXA_VISUAL = {
  alto: { rotulo: 'Alto', cor: Brand.danger },
  medio: { rotulo: 'Médio', cor: Brand.amber },
  baixo: { rotulo: 'Baixo', cor: Brand.green },
  sem_dados: { rotulo: 'Sem dados', cor: '#CFC6CB' },
}

const formatarRisco = (risco) => (risco == null ? 'sem dados' : risco.toFixed(1).replace('.', ','))
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
          <Ionicons name="help-circle-outline" size={18} color={TEMA.forte} />
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
  const [carregando, setCarregando] = useState(true)
  const [ajuda, setAjuda] = useState(null)
  const [dias, setDias] = useState(7)
  const [secao, setSecao] = useState('resumo')
  const [tecnicosAbertos, setTecnicosAbertos] = useState(false)
  // Popup aberto ao tocar num gráfico ou num alerta: { tipo: 'dia' | 'horario' | 'alerta', ... }
  const [detalhe, setDetalhe] = useState(null)
  // Endereço do alerta aberto no popup (buscado na hora, só para o alerta tocado).
  const [enderecoAlerta, setEnderecoAlerta] = useState(null)

  const [userId, setUserId] = useState(null)
  const [historico, setHistorico] = useState([])
  const [historicoAnterior, setHistoricoAnterior] = useState([])
  const [alertas, setAlertas] = useState([])
  const [locais, setLocais] = useState([])
  const [contatos, setContatos] = useState([])
  const [compromissos, setCompromissos] = useState([])
  const [avaliacoesBpm, setAvaliacoesBpm] = useState([])
  // Score de 3 camadas (risk_level_report), já normalizado. null = não carregou.
  const [niveis, setNiveis] = useState(null)
  const [niveisAnteriores, setNiveisAnteriores] = useState(null)
  // Faixa do mapa dos lugares do histórico: { chave, resumo }. Calculada no aparelho.
  const [contextoLugares, setContextoLugares] = useState(null)
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

    // Dias inteiros, como nas barras: de meia-noite de N-1 dias atrás até agora; o
    // período anterior é o bloco de N dias logo antes.
    const hoje = new Date()
    const inicioDoPeriodo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (periodo - 1))
    const inicioDoAnterior = new Date(inicioDoPeriodo.getFullYear(), inicioDoPeriodo.getMonth(), inicioDoPeriodo.getDate() - periodo)
    const [linhasDeNivel, linhasDeNivelAnteriores] = await Promise.all([
      getRiskLevelReport(inicioDoPeriodo).catch((erro) => { console.warn('risk_level_report:', erro.message); return null }),
      getRiskLevelReport(inicioDoAnterior, inicioDoPeriodo).catch(() => null),
    ])
    setNiveis(linhasDeNivel ? normalizarLinhas(linhasDeNivel) : null)
    setNiveisAnteriores(linhasDeNivelAnteriores ? normalizarLinhas(linhasDeNivelAnteriores) : null)

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
  const semHistorico = media == null
  const diasPorNivel = useMemo(() => nivelPorDia(niveis ?? [], dias), [niveis, dias])
  const semNiveis = !diasPorNivel.some((d) => d.total > 0)
  const gradeNiveis = useMemo(() => gradePorNivel(niveis ?? []), [niveis])
  const resumoNivel = useMemo(() => resumoPorNivel(niveis ?? []), [niveis])
  const modosDeSensores = useMemo(() => porModoDeSensores(niveis ?? []), [niveis])
  const trajetosPorNivel = useMemo(
    () => trajetos.map((t) => ({ ...t, nivel: nivelNaJanela(niveis ?? [], t.diasDaSemana, t.saida, t.chegada) })),
    [trajetos, niveis],
  )
  const variacaoDoAlto = useMemo(
    () => tendenciaDoAlto(resumoNivel, resumoPorNivel(niveisAnteriores ?? [])),
    [resumoNivel, niveisAnteriores],
  )

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
            // Fila única, depois da tela Proteção, com cache: não disputa a cota do iPhone.
            const { enderecos } = await buscarEnderecoReverso({ latitude: lugar.latitude, longitude: lugar.longitude, prioridade: 'relatorio', prazoMs: 20_000 })
            const endereco = enderecos?.[0]
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

  // --- Contexto dos lugares por onde ela passou (Camada 1 dos pontos do histórico) ---
  const chaveContextoLugares = `${dias}|${historico.length}|${historico.at(-1)?.created_at ?? ''}`
  useEffect(() => {
    if (!historico.length) return undefined
    let ativo = true
    contextoDosLugares(historico)
      .then((resumo) => { if (ativo) setContextoLugares({ chave: chaveContextoLugares, resumo }) })
      .catch((erro) => { if (ativo) setContextoLugares({ chave: chaveContextoLugares, resumo: null, erro: erro.message }) })
    return () => { ativo = false }
    // chaveContextoLugares resume o histórico do período.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveContextoLugares])
  const lugaresAtual = contextoLugares?.chave === chaveContextoLugares ? contextoLugares : undefined

  // --- Resumo da Lia: só números e rótulos vão para a IA ---
  // Só rótulos e tempos vão para a IA (sem número de 0 a 10, lugar ou contato).
  const chaveResumo = semNiveis || !userId ? null : `${userId}|${dias}|${resumoNivel.total}|${Math.round(resumoNivel.pct?.alto ?? 0)}`
  useEffect(() => {
    if (!chaveResumo) return undefined
    let ativo = true
    const pendentes = preparo.filter((p) => !p.feito).map((p) => p.texto.toLowerCase())
    const pior = gradeNiveis.pior
    resumoDaLia(userId, {
      dias,
      tempoMonitorado: descreverTempo(resumoNivel.minutosMonitorados),
      porNivel: ['baixo', 'moderado', 'alto'].map((n) => `${n} ${formatarPct(resumoNivel.pct[n])}`).join(', ')
        + (resumoNivel.contagens.sem_nivel ? `, sem nível ${formatarPct(resumoNivel.pct.sem_nivel)}` : ''),
      tempoEmAlto: descreverTempo(resumoNivel.minutos.alto),
      variacaoDoAlto: variacaoDoAlto && !variacaoDoAlto.igual
        ? `tempo em alto ${Math.abs(variacaoDoAlto.pontos)} pontos percentuais ${variacaoDoAlto.melhorou ? 'menor' : 'maior'}`
        : null,
      horarioMaisExposto: pior
        ? `${descreverHorario(pior).toLowerCase()} (mais tempo em risco ${NIVEL_VISUAL[pior.celula.predominante].rotulo.toLowerCase()})`
        : null,
      diasComRegistro: resumoNivel.diasComRegistro,
      alertas: alertas.length,
      preparo: pendentes.length ? pendentes.join(', ') : null,
    }).then((texto) => { if (ativo) setResumoLia({ chave: chaveResumo, texto }) })
    return () => { ativo = false }
    // O texto só muda quando muda o período ou o risco médio (chaveResumo); o resto é
    // contexto do mesmo cálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveResumo])
  const textoLia = resumoLia?.chave === chaveResumo ? resumoLia.texto : undefined

  const pontosComRisco = historico.filter((p) => p.risco != null)
  const horaDe = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const abrirAlerta = async (alerta) => {
    setEnderecoAlerta(null)
    setDetalhe({ tipo: 'alerta', alerta })
    if (alerta.latitude == null || alerta.longitude == null) return
    try {
      const { enderecos } = await buscarEnderecoReverso({ latitude: Number(alerta.latitude), longitude: Number(alerta.longitude), prioridade: 'relatorio', prazoMs: 10_000 })
      const e = enderecos?.[0]
      const texto = [e?.street && `${e.street}${e.streetNumber ? `, ${e.streetNumber}` : ''}`, e?.district, e?.city].filter(Boolean).join(' · ')
      setEnderecoAlerta({ id: alerta.id, texto: texto || null })
    } catch {
      setEnderecoAlerta({ id: alerta.id, texto: null })
    }
  }

  // Conteúdo do popup de acordo com o que foi tocado.
  let popup = null
  if (detalhe?.tipo === 'diaNivel') {
    const { d } = detalhe
    popup = {
      icone: 'calendar-outline',
      titulo: `${DIAS_SEMANA[d.data.getDay()].nome}, ${d.data.getDate()}/${d.data.getMonth() + 1}`,
      subtitulo: d.total ? `${descreverTempo(minutosDe(d.total))} monitorados` : 'Sem avaliações neste dia',
      conteudo: d.total ? (
        <>
          {['alto', 'moderado', 'baixo', 'sem_nivel'].filter((n) => d.contagens[n] > 0).map((n) => (
            <LinhaDoPopup
              key={n}
              icone={n === 'sem_nivel' ? 'help-circle-outline' : 'ellipse'}
              rotulo={n === 'sem_nivel' ? 'Sem nível (calculando ou sem dados da região)' : `Risco ${NIVEL_VISUAL[n].rotulo.toLowerCase()}`}
              valor={`${formatarPct(d.pct[n])} · ${descreverTempo(minutosDe(d.contagens[n]))}`}
              cor={NIVEL_VISUAL[n].cor}
            />
          ))}
        </>
      ) : (
        <Text style={styles.popupTexto}>Não há avaliação neste dia. Elas são gravadas a cada 30 s enquanto o monitoramento está ativo.</Text>
      ),
      acoes: [{ texto: 'Fechar', principal: true, onPress: () => setDetalhe(null) }],
    }
  } else if (detalhe?.tipo === 'horarioNivel') {
    const { dia, periodo, celula } = detalhe
    popup = {
      icone: 'time-outline',
      titulo: `${DIAS_SEMANA[dia].nome} · ${periodo.rotulo.toLowerCase()}`,
      subtitulo: `Das ${String(periodo.de).padStart(2, '0')}h às ${String(periodo.ate % 24).padStart(2, '0')}h${celula.total ? ` · ${descreverTempo(minutosDe(celula.total))} monitorados` : ''}`,
      conteudo: celula.total ? (
        <>
          {['alto', 'moderado', 'baixo', 'sem_nivel'].filter((n) => celula.contagens[n] > 0).map((n) => (
            <LinhaDoPopup
              key={n}
              icone={n === 'sem_nivel' ? 'help-circle-outline' : 'ellipse'}
              rotulo={n === 'sem_nivel' ? 'Sem nível' : `Risco ${NIVEL_VISUAL[n].rotulo.toLowerCase()}`}
              valor={`${formatarPct(celula.pct[n])} · ${descreverTempo(minutosDe(celula.contagens[n]))}`}
              cor={NIVEL_VISUAL[n].cor}
            />
          ))}
          <Text style={styles.popupTexto}>Soma de todas as vezes em que você esteve monitorada nesse dia da semana e parte do dia, no período escolhido.</Text>
        </>
      ) : (
        <Text style={styles.popupTexto}>Você não teve avaliações nesse horário no período.</Text>
      ),
    }
  } else if (detalhe?.tipo === 'dia') {
    const { d } = detalhe
    const doDia = pontosComRisco.filter((p) => new Date(p.created_at).toDateString() === d.data.toDateString())
    const pico = doDia.reduce((maior, p) => (!maior || p.risco > maior.risco ? p : maior), null)
    const nivel = nivelDoRisco(d.risco)
    popup = {
      icone: 'calendar-outline',
      titulo: `${DIAS_SEMANA[d.data.getDay()].nome}, ${d.data.getDate()}/${d.data.getMonth() + 1}`,
      subtitulo: d.risco == null ? 'Sem registros neste dia' : `Risco médio ${formatarRisco(d.risco)} · ${nivel.rotulo.toLowerCase()}`,
      conteudo: d.risco == null ? (
        <Text style={styles.popupTexto}>Não há risco registrado neste dia. O histórico só é gravado com o monitoramento ativo.</Text>
      ) : (
        <>
          <LinhaDoPopup icone="speedometer-outline" rotulo="Risco médio" valor={`${formatarRisco(d.risco)} de 10 (${nivel.rotulo.toLowerCase()})`} cor={nivel.cor} />
          {pico && <LinhaDoPopup icone="trending-up-outline" rotulo="Maior risco do dia" valor={`${formatarRisco(pico.risco)} às ${horaDe(pico.created_at)}`} />}
          <LinhaDoPopup icone="pulse-outline" rotulo="Registros" valor={`${doDia.length} ${doDia.length === 1 ? 'registro' : 'registros'} de risco`} />
        </>
      ),
      acoes: [
        { texto: 'Ver horários', icone: 'time-outline', onPress: () => { setDetalhe(null); setSecao('deslocamentos') } },
        { texto: 'Fechar', principal: true, onPress: () => setDetalhe(null) },
      ],
    }
  } else if (detalhe?.tipo === 'horario') {
    const { dia, periodo, risco } = detalhe
    const nivel = nivelDoRisco(risco)
    const doHorario = pontosComRisco.filter((p) => {
      const data = new Date(p.created_at)
      return data.getDay() === dia && data.getHours() >= periodo.de && data.getHours() < periodo.ate
    })
    popup = {
      icone: 'time-outline',
      titulo: `${DIAS_SEMANA[dia].nome} · ${periodo.rotulo.toLowerCase()}`,
      subtitulo: `Das ${String(periodo.de).padStart(2, '0')}h às ${String(periodo.ate % 24).padStart(2, '0')}h`,
      conteudo: risco == null ? (
        <Text style={styles.popupTexto}>Você não teve registros nesse horário no período.</Text>
      ) : (
        <>
          <LinhaDoPopup icone="speedometer-outline" rotulo="Risco médio" valor={`${formatarRisco(risco)} de 10 (${nivel.rotulo.toLowerCase()})`} cor={nivel.cor} />
          <LinhaDoPopup icone="pulse-outline" rotulo="Registros" valor={`${doHorario.length} ${doHorario.length === 1 ? 'registro' : 'registros'} nesse horário`} />
          <Text style={styles.popupTexto}>É a média do que foi registrado nesse dia da semana e parte do dia, durante o período escolhido.</Text>
        </>
      ),
    }
  } else if (detalhe?.tipo === 'alerta') {
    const { alerta } = detalhe
    // nivel_risco é o rótulo gravado no envio. Os níveis são só baixo, moderado e alto;
    // alertas de antes do score de 3 camadas guardaram "Crítico" e aparecem como "Alto".
    const nivelDoAlerta = String(alerta.nivel_risco ?? '').toLowerCase() === 'crítico' ? 'Alto' : alerta.nivel_risco
    const corDoNivel = { alto: Brand.danger, moderado: Brand.amber, baixo: Brand.green }[String(nivelDoAlerta ?? '').toLowerCase()]
    const temLocal = alerta.latitude != null && alerta.longitude != null
    const destinatarios = (alerta.recipient_names ?? '').split(',').map((t) => t.trim()).filter(Boolean).map((tel) => nomeDoTelefone(tel, contatos) || tel)
    const endereco = enderecoAlerta?.id === alerta.id ? enderecoAlerta.texto : undefined
    popup = {
      icone: 'alert-circle-outline',
      titulo: 'Alerta SOS',
      subtitulo: formatarDataHora(alerta.created_at),
      conteudo: (
        <>
          {temLocal && (
            <LinhaDoPopup icone="location-outline" rotulo="Onde foi acionado" valor={endereco === undefined ? 'Buscando endereço…' : endereco ?? `${Number(alerta.latitude).toFixed(5)}, ${Number(alerta.longitude).toFixed(5)}`} />
          )}
          {!!nivelDoAlerta && <LinhaDoPopup icone="speedometer-outline" rotulo="Risco no momento" valor={nivelDoAlerta} cor={corDoNivel} />}
          {destinatarios.length > 0 && <LinhaDoPopup icone="people-outline" rotulo="Enviado para" valor={destinatarios.join(', ')} />}
          {!!alerta.message && <LinhaDoPopup icone="chatbox-ellipses-outline" rotulo="Mensagem enviada" valor={alerta.message} />}
        </>
      ),
      acoes: temLocal ? [
        { texto: 'Fechar', onPress: () => setDetalhe(null) },
        {
          texto: 'Ver no mapa',
          icone: 'map-outline',
          principal: true,
          onPress: () => { setDetalhe(null); abrirNoMapa(navigation, { latitude: Number(alerta.latitude), longitude: Number(alerta.longitude), local_nome: 'Local do alerta' }) },
        },
      ] : undefined,
    }
  }

  if (carregando) {
    return (
      <View style={[styles.container, styles.centro]}>
        <ActivityIndicator size="large" color={TEMA.forte} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <HeaderComCurvas
          aba="Dashboard"
          direita={PERIODOS.map((p) => (
            <Pressable key={p} onPress={() => setDias(p)} style={[styles.periodo, dias === p && styles.periodoAtivo]} accessibilityRole="button" accessibilityState={{ selected: dias === p }}>
              <Text style={[styles.periodoTexto, dias === p && styles.periodoTextoAtivo]}>{p} dias</Text>
            </Pressable>
          ))}
        >
          <Text style={styles.titulo}>Relatório</Text>
          {!MOSTRAR_SCORE_DE_PONTOS ? (
            semNiveis ? (
              <Text style={styles.subtitulo}>Últimos {dias} dias</Text>
            ) : (
              <View style={styles.destaque}>
                <Text style={[styles.destaqueValor, { color: resumoNivel.contagens.alto ? Brand.danger : Brand.green }]}>
                  {descreverTempo(resumoNivel.minutos.alto)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.destaqueNivel}>em risco alto · {formatarPct(resumoNivel.pct.alto)} do tempo monitorado</Text>
                  {variacaoDoAlto && !variacaoDoAlto.igual ? (
                    <Text style={[styles.tendenciaTexto, { color: variacaoDoAlto.melhorou ? Brand.green : Brand.amber }]}>
                      <Ionicons name={variacaoDoAlto.melhorou ? 'trending-down' : 'trending-up'} size={13} /> {Math.abs(variacaoDoAlto.pontos)} {Math.abs(variacaoDoAlto.pontos) === 1 ? 'ponto percentual' : 'pontos percentuais'} {variacaoDoAlto.melhorou ? 'a menos' : 'a mais'} que no período anterior
                    </Text>
                  ) : (
                    <Text style={styles.subtitulo}>Últimos {dias} dias · {descreverTempo(resumoNivel.minutosMonitorados)} monitorados</Text>
                  )}
                </View>
              </View>
            )
          ) : semHistorico ? (
            <Text style={styles.subtitulo}>Últimos {dias} dias</Text>
          ) : (
            <View style={styles.destaque}>
              <Text style={[styles.destaqueValor, { color: nivelMedio.cor }]}>{formatarRisco(media)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.destaqueNivel}>risco médio · {nivelMedio.rotulo.toLowerCase()}</Text>
                {variacao && !variacao.igual ? (
                  <Text style={[styles.tendenciaTexto, { color: variacao.melhorou ? Brand.green : Brand.amber }]}>
                    <Ionicons name={variacao.melhorou ? 'trending-down' : 'trending-up'} size={13} /> {Math.abs(variacao.variacao)}% {variacao.melhorou ? 'menor' : 'maior'} que no período anterior
                  </Text>
                ) : (
                  <Text style={styles.subtitulo}>Últimos {dias} dias</Text>
                )}
              </View>
            </View>
          )}
        </HeaderComCurvas>

        <View style={styles.conteudo}>
        <View style={styles.abas} accessibilityRole="tablist">
          {SECOES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSecao(s.id)}
              style={[styles.aba, secao === s.id && styles.abaAtiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: secao === s.id }}
            >
              <Ionicons name={s.icone} size={15} color={secao === s.id ? '#FFF' : TEMA.forte} />
              <Text style={[styles.abaTexto, secao === s.id && styles.abaTextoAtiva]}>{s.rotulo}</Text>
            </Pressable>
          ))}
        </View>

        {secao === 'resumo' && (
          <>
            {!MOSTRAR_SCORE_DE_PONTOS ? (
              !semNiveis && textoLia !== null && (
                <View style={styles.lia}>
                  <LiaAvatar size={36} reaction="oi" showRing={false} showBadge={false} />
                  <View style={styles.liaBalao}>
                    <Text style={styles.liaRotulo}>Lia resume</Text>
                    {textoLia === undefined ? (
                      <Text style={styles.liaCarregando}>Lia está escrevendo…</Text>
                    ) : (
                      <Text style={styles.liaTexto}>{textoLia}</Text>
                    )}
                  </View>
                </View>
              )
            ) : semHistorico ? (
              <View style={styles.aviso}>
                <Ionicons name="time-outline" size={20} color={TEMA.forte} />
                <Text style={styles.avisoTexto}>
                  Ainda não há histórico no período. O relatório usa o mesmo risco da tela Proteção, registrado enquanto o monitoramento está ativo.
                </Text>
              </View>
            ) : (
              <>
                {/* Resumo em uma frase, escrito pela Lia a partir dos números acima. */}
                {textoLia !== null && (
                  <View style={styles.lia}>
                    <LiaAvatar size={36} reaction="oi" showRing={false} showBadge={false} />
                    <View style={styles.liaBalao}>
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

            {!MOSTRAR_SCORE_DE_PONTOS && (
            <View style={styles.secao}>
              <Titulo
                titulo="Risco por dia"
                explicacao="Quanto do tempo monitorado de cada dia ficou em risco baixo, moderado ou alto. É o mesmo nível da tela Proteção, que cruza a região e o horário com os sensores. Cinza é tempo sem nível (calculando ou sem dados da região). Toque numa barra para ver o dia. É um resumo do seu histórico no app, não uma previsão."
                onExplicar={explicar}
              />
              {niveis === null ? (
                <Vazio texto="Não foi possível carregar o risco por dia agora." />
              ) : semNiveis ? (
                <Vazio texto="Ainda não há avaliações no período. Elas são gravadas a cada 30 s enquanto o monitoramento está ativo." />
              ) : (
                <>
                  <View style={styles.barras} accessibilityLabel="Gráfico do risco por dia, em porcentagem do tempo">
                    {diasPorNivel.map((d) => (
                      <Pressable
                        key={d.data.toISOString()}
                        style={styles.barraDia}
                        onPress={() => setDetalhe({ tipo: 'diaNivel', d })}
                        accessibilityRole="button"
                        accessibilityLabel={`${DIAS_SEMANA[d.data.getDay()].nome}, ${d.data.getDate()}/${d.data.getMonth() + 1}: ${d.total ? ['alto', 'moderado', 'baixo'].map((n) => `${formatarPct(d.pct[n])} ${NIVEL_VISUAL[n].rotulo.toLowerCase()}`).join(', ') : 'sem avaliações'}. Ver detalhes`}
                      >
                        {d.total ? (
                          <View style={styles.barraEmpilhada}>
                            {ORDEM_NA_BARRA.filter((n) => d.contagens[n] > 0).map((n) => (
                              <View key={n} style={{ flex: d.contagens[n], backgroundColor: NIVEL_VISUAL[n].cor }} />
                            ))}
                          </View>
                        ) : (
                          <View style={styles.barraDiaVazia} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.barrasRotulos}>
                    {dias === 7
                      ? diasPorNivel.map((d) => <Text key={d.data.toISOString()} style={styles.barraDiaRotulo}>{DIAS_SEMANA[d.data.getDay()].curto}</Text>)
                      : [diasPorNivel[0], diasPorNivel[Math.floor(diasPorNivel.length / 2)], diasPorNivel[diasPorNivel.length - 1]].map((d) => (
                        <Text key={d.data.toISOString()} style={styles.barraDiaRotulo}>{d.data.getDate()}/{d.data.getMonth() + 1}</Text>
                      ))}
                  </View>
                  <View style={styles.legenda}>
                    {['baixo', 'moderado', 'alto', 'sem_nivel'].map((n) => (
                      <View key={n} style={styles.legendaItem}>
                        <View style={[styles.legendaCor, { backgroundColor: NIVEL_VISUAL[n].cor }]} />
                        <Text style={styles.legendaTexto}>{NIVEL_VISUAL[n].rotulo}</Text>
                      </View>
                    ))}
                  </View>
                  {modosDeSensores.length > 0 && (
                    <Text style={styles.nota} accessibilityLabel={`Sensores usados: ${modosDeSensores.map((m) => `${formatarPct(m.pct)} ${ROTULO_DO_MODO[m.modo] ?? m.modo}`).join(', ')}`}>
                      <Ionicons name="hardware-chip-outline" size={12} /> Sensores: {modosDeSensores.map((m) => `${ROTULO_DO_MODO[m.modo] ?? m.modo} ${formatarPct(m.pct)}`).join(' · ')}
                    </Text>
                  )}
                </>
              )}
            </View>
            )}

            {!MOSTRAR_SCORE_DE_PONTOS && (
            <View style={styles.secao}>
              <Titulo
                titulo="Contexto dos lugares por onde você passou"
                explicacao="Só a parte da região: a faixa do mapa de ocorrências da SSP (bairro × período do dia) dos lugares registrados no seu histórico, recalculada com o mapa atual. Não é o seu nível de risco, que também usa os sensores. O bairro é identificado no próprio celular e não é gravado."
                onExplicar={explicar}
              />
              {!historico.length ? (
                <Vazio texto="Seus lugares aparecem aqui depois de alguns registros com o monitoramento ativo." />
              ) : lugaresAtual === undefined ? (
                <Vazio texto="Identificando os bairros dos seus lugares…" />
              ) : !lugaresAtual.resumo?.total ? (
                <Vazio texto="Não foi possível identificar a região dos seus lugares agora." />
              ) : (
                <>
                  <View style={styles.faixaHorizontal} accessibilityLabel={`Contexto dos lugares: ${['alto', 'medio', 'baixo', 'sem_dados'].map((f) => `${formatarPct(lugaresAtual.resumo.pct[f])} ${FAIXA_VISUAL[f].rotulo.toLowerCase()}`).join(', ')}`}>
                    {['alto', 'medio', 'baixo', 'sem_dados'].filter((f) => lugaresAtual.resumo.contagens[f] > 0).map((f) => (
                      <View key={f} style={{ flex: lugaresAtual.resumo.contagens[f], backgroundColor: FAIXA_VISUAL[f].cor }} />
                    ))}
                  </View>
                  <View style={styles.legenda}>
                    {['baixo', 'medio', 'alto', 'sem_dados'].map((f) => (
                      <View key={f} style={styles.legendaItem}>
                        <View style={[styles.legendaCor, { backgroundColor: FAIXA_VISUAL[f].cor }]} />
                        <Text style={styles.legendaTexto}>{FAIXA_VISUAL[f].rotulo} {formatarPct(lugaresAtual.resumo.pct[f])}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.nota}>
                    {lugaresAtual.resumo.total} {lugaresAtual.resumo.total === 1 ? 'registro' : 'registros'} de localização no período
                    {lugaresAtual.resumo.pctDaCidade >= 1 ? ` · ${formatarPct(lugaresAtual.resumo.pctDaCidade)} pela estimativa da cidade` : ''}
                    {lugaresAtual.resumo.pontosDeFora ? ` · ${lugaresAtual.resumo.pontosDeFora} em lugares pouco visitados ficaram de fora` : ''}.
                    {' '}Contexto da região, não o nível completo.
                  </Text>
                </>
              )}
            </View>
            )}

            {MOSTRAR_SCORE_DE_PONTOS && (
            <View style={styles.secao}>
              <Titulo
                titulo="Risco por dia"
                explicacao="Média do risco de cada dia, na mesma escala da tela Proteção: quanto maior, mais risco. Dias sem registro aparecem vazios. Toque numa barra para ver o dia. É um resumo do seu histórico no app, não uma previsão."
                onExplicar={explicar}
              />
              <View style={styles.barras} accessibilityLabel="Gráfico do risco por dia">
                {porDia.map((d) => {
                  const nivel = nivelDoRisco(d.risco)
                  return (
                    <Pressable
                      key={d.data.toISOString()}
                      style={styles.barraDia}
                      onPress={() => setDetalhe({ tipo: 'dia', d })}
                      accessibilityRole="button"
                      accessibilityLabel={`${DIAS_SEMANA[d.data.getDay()].nome}, ${d.data.getDate()}/${d.data.getMonth() + 1}: ${d.risco == null ? 'sem registros' : `risco ${formatarRisco(d.risco)}`}. Ver detalhes`}
                    >
                      <View style={[
                        styles.barraDiaPreenchida,
                        d.risco == null
                          ? styles.barraDiaVazia
                          : { height: Math.max(6, (d.risco / 10) * ALTURA_BARRAS), backgroundColor: nivel.cor },
                      ]} />
                    </Pressable>
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
            )}

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
                    {!item.feito && item.tela && <Ionicons name="chevron-forward" size={16} color={TEMA.forte} />}
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
                      {MOSTRAR_SCORE_DE_PONTOS && (
                        <Numero valor={scoreExperimental == null ? 'sem dados' : `${formatarRisco(scoreExperimental)}/10`} rotulo="score experimental" />
                      )}
                    </View>
                    <Text style={styles.nota}>{leiturasBpm} leituras de batimento no período.</Text>
                  </>
                )}
              </View>
            )}
          </>
        )}

        {secao === 'deslocamentos' && (
          <>
            {!MOSTRAR_SCORE_DE_PONTOS && (
            <View style={styles.secao}>
              <Titulo
                titulo="Seus horários mais expostos"
                explicacao="Cada quadradinho mostra o nível de risco em que você passou mais tempo naquele dia da semana e parte do dia (o mesmo nível da tela Proteção). Quanto mais forte a cor, maior a parte do tempo nesse nível. Toque para ver as porcentagens."
                onExplicar={explicar}
              />
              {semNiveis ? (
                <Vazio texto="Ainda não há avaliações no período." />
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
                          const celula = gradeNiveis.grade[periodo.id][dia]
                          const n = celula.predominante
                          const estilo = !celula.total
                            ? styles.gradeVazia
                            : !n
                              ? { backgroundColor: NIVEL_VISUAL.sem_nivel.cor }
                              : { backgroundColor: NIVEL_VISUAL[n].cor, opacity: 0.35 + (celula.pct[n] / 100) * 0.65 }
                          return (
                            <Pressable
                              key={dia}
                              onPress={() => setDetalhe({ tipo: 'horarioNivel', dia, periodo, celula })}
                              style={[styles.gradeCelula, estilo]}
                              accessibilityRole="button"
                              accessibilityLabel={`${DIAS_SEMANA[dia].nome}, ${periodo.rotulo}: ${!celula.total ? 'sem avaliações' : n ? `mais tempo em risco ${NIVEL_VISUAL[n].rotulo.toLowerCase()}, ${formatarPct(celula.pct[n])}` : 'sem nível'}. Ver detalhes`}
                            />
                          )
                        })}
                      </View>
                    ))}
                  </View>
                  {gradeNiveis.pior && (
                    <Text style={styles.nota}>
                      {descreverHorario(gradeNiveis.pior)} foi o seu horário mais exposto: {formatarPct(gradeNiveis.pior.celula.pct[gradeNiveis.pior.celula.predominante])} do tempo em risco {NIVEL_VISUAL[gradeNiveis.pior.celula.predominante].rotulo.toLowerCase()}.
                    </Text>
                  )}
                </>
              )}
            </View>
            )}

            {!MOSTRAR_SCORE_DE_PONTOS && (
            <View style={styles.secao}>
              <Titulo
                titulo="Trajetos da sua rotina"
                explicacao="Os trajetos entre os compromissos da sua rotina, com o nível de risco em que você passou mais tempo nesse horário, nos dias em que eles acontecem (contando as horas cheias que o trajeto toca). Sem avaliação no horário, o app ainda não tem como dizer."
                onExplicar={explicar}
              />
              {compromissos.length === 0 ? (
                <TouchableOpacity style={styles.convite} onPress={() => navigation.navigate('Routine')}>
                  <Ionicons name="calendar-outline" size={20} color={TEMA.forte} />
                  <Text style={styles.conviteTexto}>Cadastre sua rotina para ver o risco dos seus trajetos.</Text>
                  <Ionicons name="chevron-forward" size={18} color={TEMA.forte} />
                </TouchableOpacity>
              ) : trajetosPorNivel.length === 0 ? (
                <Vazio texto="Cadastre sua Casa nos locais seguros e mais de um compromisso para ver os trajetos." />
              ) : (
                trajetosPorNivel.map((t) => {
                  const n = t.nivel.predominante
                  const visual = n ? NIVEL_VISUAL[n] : NIVEL_VISUAL.sem_nivel
                  return (
                    <View key={t.chave} style={styles.linhaLista}>
                      <Ionicons name={transporteDe(t.transporte).icone} size={18} color={TEMA.forte} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaNome} numberOfLines={1}>{t.origem} → {t.destino}</Text>
                        <Text style={styles.linhaDetalhe}>Sai às {horaDosMinutos(t.saida)}{n ? ` · ${formatarPct(t.nivel.pct[n])} do tempo nesse nível` : ''}</Text>
                      </View>
                      <View style={[styles.selo, { backgroundColor: visual.fundo }]}>
                        <Text style={[styles.seloTexto, { color: n ? visual.cor : Brand.muted }]}>{n ? visual.rotulo : 'Sem avaliações'}</Text>
                      </View>
                    </View>
                  )
                })
              )}
            </View>
            )}

            {MOSTRAR_SCORE_DE_PONTOS && (
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
                            <Pressable
                              key={dia}
                              onPress={() => setDetalhe({ tipo: 'horario', dia, periodo, risco })}
                              style={[styles.gradeCelula, risco == null ? styles.gradeVazia : { backgroundColor: nivelDoRisco(risco).cor, opacity: 0.35 + (risco / 10) * 0.65 }]}
                              accessibilityRole="button"
                              accessibilityLabel={`${DIAS_SEMANA[dia].nome}, ${periodo.rotulo}: ${risco == null ? 'sem registros' : `risco ${formatarRisco(risco)}`}. Ver detalhes`}
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
                  <Ionicons name="calendar-outline" size={20} color={TEMA.forte} />
                  <Text style={styles.conviteTexto}>Cadastre sua rotina para ver o risco dos seus trajetos.</Text>
                  <Ionicons name="chevron-forward" size={18} color={TEMA.forte} />
                </TouchableOpacity>
              ) : trajetos.length === 0 ? (
                <Vazio texto="Cadastre sua Casa nos locais seguros e mais de um compromisso para ver os trajetos." />
              ) : (
                trajetos.map((t) => {
                  const nivel = nivelDoRisco(t.risco)
                  return (
                    <View key={t.chave} style={styles.linhaLista}>
                      <Ionicons name={transporteDe(t.transporte).icone} size={18} color={TEMA.forte} />
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
            </>
            )}

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
                      <Ionicons name={detalhe?.icone ?? 'location-outline'} size={18} color={TEMA.forte} />
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
              <Titulo titulo="Histórico" explicacao="Os alertas SOS enviados no período e quem recebeu cada um. Toque num alerta para ver onde ele foi acionado e a mensagem enviada." onExplicar={explicar} />
              {alertas.length === 0 ? (
                <Vazio texto="Nenhum alerta enviado no período." />
              ) : (
                alertas.slice(-10).reverse().map((alerta) => (
                  <TouchableOpacity key={alerta.id} style={styles.linhaLista} onPress={() => abrirAlerta(alerta)} accessibilityRole="button" accessibilityLabel={`Alerta SOS de ${formatarDataHora(alerta.created_at)}. Ver detalhes`}>
                    <Ionicons name="alert-circle" size={20} color={Brand.danger} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome}>SOS enviado</Text>
                      {!!alerta.recipient_names && (
                        <Text style={styles.linhaDetalhe} numberOfLines={1}>
                          Para {alerta.recipient_names.split(',').map((t) => t.trim()).filter(Boolean).map((tel) => nomeDoTelefone(tel, contatos) || tel).join(', ')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.alertaData}>{formatarDataHora(alerta.created_at)}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#C9C2C6" />
                  </TouchableOpacity>
                ))
              )}
            </View>

            {rankingContatos.length > 0 && (
              <View style={styles.secao}>
                <Titulo titulo="Quem mais recebeu seus alertas" onExplicar={explicar} />
                {rankingContatos.map((c) => (
                  <TouchableOpacity key={c.telefone} style={styles.contato} onPress={() => navigation.navigate('EmergencyContacts')} accessibilityRole="button" accessibilityLabel={`${c.nome}, ${c.count} ${c.count === 1 ? 'alerta' : 'alertas'}. Ver contatos cadastrados`}>
                    <View style={styles.avatar}><Text style={styles.avatarTexto}>{c.nome?.charAt(0)?.toUpperCase()}</Text></View>
                    <Text style={styles.contatoNome}>{c.nome}</Text>
                    <Text style={styles.contatoContagem}>{c.count} {c.count === 1 ? 'alerta' : 'alertas'}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#C9C2C6" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
        </View>
      </ScrollView>

      <PopupAmpara
        aba="Dashboard"
        visible={Boolean(popup)}
        onClose={() => setDetalhe(null)}
        icone={popup?.icone}
        titulo={popup?.titulo}
        subtitulo={popup?.subtitulo}
        acoes={popup?.acoes}
      >
        {popup?.conteudo}
      </PopupAmpara>

      <LiaHelpModal aba="Dashboard" visible={Boolean(ajuda)} title={ajuda?.title} message={ajuda?.message} onClose={() => setAjuda(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centro: { justifyContent: 'center', alignItems: 'center' },
  conteudo: { paddingHorizontal: 20 },

  titulo: { fontSize: 22, fontWeight: '800', color: TEMA.forte },
  subtitulo: { fontSize: 13, color: '#776C73', marginTop: 2 },

  periodo: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#FFFFFF' },
  periodoAtivo: { backgroundColor: TEMA.forte },
  periodoTexto: { fontSize: 12, fontWeight: '700', color: TEMA.forte },
  periodoTextoAtivo: { color: '#FFF' },

  abas: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 6 },
  aba: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 20, backgroundColor: TEMA.fundo },
  abaAtiva: { backgroundColor: TEMA.forte },
  abaTexto: { color: TEMA.forte, fontSize: 12, fontWeight: '700' },
  abaTextoAtiva: { color: '#FFF' },

  destaque: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  destaqueValor: { fontSize: 34, fontWeight: '800', lineHeight: 40, fontVariant: ['tabular-nums'] },
  destaqueNivel: { fontSize: 14, color: Brand.ink },
  tendenciaTexto: { fontSize: 12, fontWeight: '600', marginTop: 1 },

  lia: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14 },
  liaBalao: { flex: 1, backgroundColor: '#F1F6F1', borderRadius: 18, borderTopLeftRadius: 4, paddingVertical: 11, paddingHorizontal: 14 },
  liaRotulo: { fontSize: 12, fontWeight: '700', color: TEMA.forte, marginBottom: 3 },
  liaTexto: { fontSize: 14, color: Brand.ink, lineHeight: 21 },
  liaCarregando: { fontSize: 13, color: Brand.muted, fontStyle: 'italic' },

  aviso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: TEMA.fundo, borderRadius: 20, padding: 14, marginTop: 10 },
  avisoTexto: { flex: 1, color: TEMA.forte, fontSize: 13, lineHeight: 19 },

  secao: { paddingVertical: 14 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  tituloSecao: { fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: '#8A8590' },
  vazio: { fontSize: 13, color: Brand.muted, lineHeight: 19 },
  nota: { fontSize: 12, color: Brand.muted, marginTop: 10, lineHeight: 17 },

  barras: { height: ALTURA_BARRAS, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barraDia: { flex: 1, height: ALTURA_BARRAS, justifyContent: 'flex-end' },
  barraDiaPreenchida: { borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barraEmpilhada: { height: ALTURA_BARRAS, borderTopLeftRadius: 5, borderTopRightRadius: 5, overflow: 'hidden' },
  faixaHorizontal: { height: 14, flexDirection: 'row', borderRadius: 7, overflow: 'hidden', backgroundColor: '#F3EFF1', marginTop: 4 },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaCor: { width: 10, height: 10, borderRadius: 3 },
  legendaTexto: { fontSize: 11, color: Brand.muted },
  barraDiaVazia: { height: 4, backgroundColor: '#E4EDE5', borderRadius: 2 },
  barrasRotulos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barraDiaRotulo: { flex: 1, textAlign: 'center', fontSize: 11, color: Brand.muted, fontWeight: '600' },

  preparoTopo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  preparoContagem: { fontSize: 22, fontWeight: '800', color: TEMA.forte },
  preparoTrilha: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F3EFF1', overflow: 'hidden' },
  preparoBarra: { height: 8, borderRadius: 4, backgroundColor: TEMA.forte },
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
  numero: { flexBasis: '47%', flexGrow: 1, paddingVertical: 8 },
  numeroValor: { fontSize: 26, fontWeight: '800', color: TEMA.forte },
  numeroRotulo: { fontSize: 12, color: Brand.muted, marginTop: 2 },

  tecnicosCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingVertical: 10 },
  tecnicosTitulo: { flex: 1, fontSize: 13, color: Brand.muted, fontWeight: '600' },
  tecnicos: { paddingBottom: 10 },

  convite: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: TEMA.fundo, borderRadius: 20, padding: 14 },
  conviteTexto: { flex: 1, color: Brand.ink, fontSize: 13 },
  linhaLista: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  linhaNome: { fontSize: 14, color: Brand.ink, fontWeight: '600' },
  linhaDetalhe: { fontSize: 12, color: Brand.muted, marginTop: 1 },
  selo: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  seloTexto: { fontSize: 11, fontWeight: '700' },

  alertaData: { fontSize: 11, color: Brand.muted },
  popupTexto: { fontSize: 13, color: '#776C73', lineHeight: 19, paddingVertical: 6 },
  contato: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: TEMA.fundo, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: TEMA.forte, fontWeight: '700' },
  contatoNome: { flex: 1, fontSize: 14, color: Brand.ink },
  contatoContagem: { fontSize: 13, color: Brand.muted },
})

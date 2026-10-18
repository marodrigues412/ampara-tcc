import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Keyboard, KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Linking,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import LiaAvatar from '../components/LiaAvatar'
import LiaHelpModal from '../components/LiaHelpModal'
import { conversarComLia } from '../services/chatService'
import { montarContextoDaLia, esquecerContextoDaLia } from '../services/contextoDaLia'
import { Brand, FonteDaLia, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'

const TEMA = TemaDaAba.Assistente

// Aberto ao tocar na Lia do cabeçalho. O modelo é o mesmo configurado em
// supabase/functions/ampara-chat (google/gemma-3-27b, via ia.maua.br).
const SOBRE_A_IA = 'As respostas da Lia são geradas pela Barô, a IA do Instituto Mauá de Tecnologia (ia.maua.br). O Ampara usa o modelo Gemma 3 27B, do Google, que roda na infraestrutura do próprio Instituto, e não em um serviço externo.\n\nO nome Barô vem da Baroneza, a primeira locomotiva do Brasil, que inaugurou em 1854 a ferrovia do Barão de Mauá.\n\nA Lia tira dúvidas sobre o app e dá orientações gerais de segurança, mas pode errar e não substitui ajuda de emergência. Em perigo, ligue 190. Para violência contra a mulher, ligue 180.'

// Respostas locais curtas para exibir quando a IA estiver indisponível.
const BASE_RESPOSTAS = [
  {
    palavras: ['sos', 'botão', 'botao', 'acionar', 'emergência', 'emergencia'],
    texto: 'Para pedir socorro, segure o botão SOS da tela inicial por 3 segundos. Seus contatos de emergência recebem uma mensagem no WhatsApp com sua localização.\n\nSe estiver em perigo imediato, ligue 190.',
  },
  {
    palavras: ['contato', 'contatos', 'cadastrar', 'adicionar'],
    texto: 'Você cadastra até 3 contatos de emergência em Perfil → Contatos de emergência.\n\nVale avisar essas pessoas que elas receberão alertas do Ampara, para que reconheçam a mensagem quando chegar.',
  },
  {
    palavras: ['mapa', 'crime', 'crimes', 'risco', 'score', 'perigo'],
    texto: 'O mapa mostra ocorrências registradas pela SSP-SP perto de onde você está, e os relatos feitos por outras usuárias.\n\nO score de risco combina a quantidade de ocorrências na região, o horário e se você está em um local seguro cadastrado.',
  },
  {
    palavras: ['local', 'locais', 'seguro', 'seguros', 'zona'],
    texto: 'Locais seguros são endereços onde você costuma estar em segurança, como casa, trabalho ou faculdade. Quando você está dentro de um deles, o app reduz o score de risco e evita alertas desnecessários.\n\nCadastre em Perfil → Locais seguros.',
  },
  {
    palavras: ['sozinha', 'noite', 'caminhar', 'andar', 'rua', 'dica', 'dicas'],
    texto: 'Algumas orientações para deslocamentos à noite:\n\n• Prefira ruas movimentadas e bem iluminadas\n• Evite usar o celular na mão enquanto caminha\n• Avise alguém sobre seu trajeto e horário previsto\n• Mantenha o modo monitoramento ativo no app',
  },
  {
    palavras: ['assédio', 'assedio', 'importun', 'denunciar', 'denúncia', 'denuncia'],
    texto: 'Importunação sexual é crime (Lei 13.718/2018). Você pode denunciar:\n\n• Ligue 180: Central de Atendimento à Mulher\n• Delegacia da Mulher ou delegacia comum\n• Delegacia Eletrônica da Polícia Civil\n\nSe acontecer no transporte público, procure um funcionário e peça para acionar a segurança.',
  },
  {
    palavras: ['registrar', 'relato', 'relatar', 'ocorrência', 'ocorrencia'],
    texto: 'Toque em REGISTRAR na tela inicial para relatar uma ocorrência. Informe o tipo, o local e o horário.\n\nSeu relato aparece no mapa de todas as usuárias, sem identificar quem registrou.',
  },
]

const RESPOSTA_PADRAO =
  'Ainda não sei responder isso. Posso ajudar com: como acionar o SOS, cadastrar contatos de emergência, entender o mapa de risco, locais seguros, dicas de segurança e como denunciar.\n\nEm situação de emergência, ligue 190.'

// O modelo às vezes responde em Markdown (**negrito**, listas com *), e o balão mostra
// texto puro: sem esta limpeza, os asteriscos apareciam na conversa.
const semMarkdown = (texto) => texto
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/__(.+?)__/g, '$1')
  .replace(/^\s*[*-]\s+/gm, '• ')
  .replace(/^#+\s*/gm, '')

// Guarda a escolha de "Personalizar com meus dados" entre uma conversa e outra.
const CHAVE_PERSONALIZAR = 'ampara:liaPersonalizar'

const SUGESTOES = [
  'Onde fica a delegacia da mulher mais perto?',
  'A região onde estou é tranquila?',
  'Como funciona o SOS?',
  'Dicas para andar à noite',
  'Como denunciar assédio?',
  'O que é o score de risco?',
]

const MENSAGEM_INICIAL = {
  id: 'inicial',
  autor: 'bot',
  texto: 'Oi! Eu sou a Lia, assistente do Ampara.\n\nPosso tirar dúvidas sobre o aplicativo e dar orientações de segurança pessoal. O que você quer saber?',
}

const semAcento = (texto) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function responder(pergunta) {
  const normalizada = semAcento(pergunta)
  const achada = BASE_RESPOSTAS.find((r) =>
    r.palavras.some((p) => normalizada.includes(semAcento(p)))
  )
  return achada ? achada.texto : RESPOSTA_PADRAO
}

export default function ChatBot({ navigation, route }) {
  const [mensagens, setMensagens] = useState([MENSAGEM_INICIAL])
  const [texto, setTexto] = useState('')
  const [digitando, setDigitando] = useState(false)
  const [sobreVisivel, setSobreVisivel] = useState(false)
  const [tecladoVisivel, setTecladoVisivel] = useState(false)
  // Com a chave ligada, cada pergunta vai com o contexto de services/contextoDaLia.js:
  // bairro e cidade, ocorrências da região, nível de risco atual (com origem e
  // sensores), próximo compromisso e data/hora. A coordenada vai para a função
  // ampara-chat só para buscar lugares e não chega à IA. Desligada (o padrão), vai só
  // a pergunta. O texto da chave na tela tem que dizer isso.
  const [personalizar, setPersonalizar] = useState(false)
  const listaRef = useRef(null)
  const reacaoLia = digitando ? 'pensando' : texto.trim() ? 'ouvindo' : mensagens.length === 1 ? 'oi' : 'ociosa'

  useEffect(() => {
    const eventoMostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const eventoOcultar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const mostrar = Keyboard.addListener(eventoMostrar, () => setTecladoVisivel(true))
    const ocultar = Keyboard.addListener(eventoOcultar, () => setTecladoVisivel(false))

    return () => {
      mostrar.remove()
      ocultar.remove()
    }
  }, [])

  useEffect(() => {
    listaRef.current?.scrollToEnd({ animated: true })
  }, [mensagens, digitando])

  useEffect(() => {
    AsyncStorage.getItem(CHAVE_PERSONALIZAR).then((v) => setPersonalizar(v === 'sim')).catch(() => {})
  }, [])

  const alternarPersonalizar = async (ligar) => {
    if (ligar) {
      // A localização é o dado mais sensível: pede a permissão na hora em que ela liga.
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setMensagens((atual) => [...atual, {
          id: `b${Date.now()}`,
          autor: 'bot',
          texto: 'Sem acesso à localização, eu ainda uso seu nível de risco e sua rotina, mas não sei seu bairro nem consigo buscar lugares perto de você.',
        }])
      }
    } else {
      esquecerContextoDaLia()
    }
    setPersonalizar(ligar)
    AsyncStorage.setItem(CHAVE_PERSONALIZAR, ligar ? 'sim' : 'nao').catch(() => {})
  }

  const enviar = async (pergunta) => {
    const conteudo = (pergunta ?? texto).trim()
    if (!conteudo || digitando) return

    setMensagens((atual) => [
      ...atual,
      { id: `u${Date.now()}`, autor: 'usuaria', texto: conteudo },
    ])
    setTexto('')
    setDigitando(true)

    try {
      const contexto = personalizar ? await montarContextoDaLia().catch(() => null) : null
      const { resposta, lugares } = await conversarComLia(conteudo, contexto)
      setMensagens((atual) => [
        ...atual,
        { id: `b${Date.now()}`, autor: 'bot', texto: semMarkdown(resposta), lugares },
      ])
    } catch {
      setMensagens((atual) => [
        ...atual,
        {
          id: `b${Date.now()}`,
          autor: 'bot',
          texto: `Não consegui acessar a IA da Mauá agora. Tente novamente mais tarde.\n\n${responder(conteudo)}`,
        },
      ])
    } finally {
      setDigitando(false)
    }
  }

  // Pergunta enviada por outra tela (a resposta rápida "Lugar aberto por perto" da
  // Proteção). pedidoEm muda a cada toque, para a mesma pergunta poder ir de novo.
  const pedidoEm = route?.params?.pedidoEm
  const perguntaPedida = route?.params?.pergunta
  // O foco volta a cada troca de aba: a ref garante que cada pedido vá uma vez só.
  const ultimoPedidoRef = useRef(null)
  useFocusEffect(useCallback(() => {
    if (!perguntaPedida || !pedidoEm || ultimoPedidoRef.current === pedidoEm) return
    ultimoPedidoRef.current = pedidoEm
    enviar(perguntaPedida)
    // Só um pedido novo deve enviar a pergunta, e não cada volta à aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoEm]))

  const renderMensagem = ({ item }) => {
    const daUsuaria = item.autor === 'usuaria'
    return (
      <View style={[styles.linha, daUsuaria && styles.linhaUsuaria]}>
        {!daUsuaria && (
          <View style={styles.avatarBot}>
            <LiaAvatar size={34} reaction={item.id === 'inicial' ? 'oi' : 'ociosa'} showRing={false} showBadge={false} />
          </View>
        )}
        <View style={[styles.balao, daUsuaria ? styles.balaoUsuaria : styles.balaoBot]}>
          <Text style={[styles.textoBalao, daUsuaria && styles.textoBalaoUsuaria]}>
            {item.texto}
          </Text>
          {/* Lugares buscados pela função (não pela IA): nome, distância e as ações. */}
          {item.lugares?.length > 0 && (
            <View style={styles.lugares}>
              {item.lugares.map((lugar) => (
                <View key={`${lugar.nome}${lugar.distanciaKm}`} style={styles.lugar}>
                  <Text style={styles.lugarNome}>{lugar.nome}</Text>
                  <Text style={styles.lugarDetalhe}>
                    {String(lugar.distanciaKm).replace('.', ',')} km
                    {lugar.abertoAgora === true ? ' · aberto agora' : lugar.abertoAgora === false ? ' · fechado agora' : ''}
                  </Text>
                  {!!lugar.endereco && <Text style={styles.lugarDetalhe} numberOfLines={2}>{lugar.endereco}</Text>}
                  <View style={styles.lugarAcoes}>
                    {!!lugar.mapsUrl && (
                      <TouchableOpacity style={styles.lugarBotao} onPress={() => Linking.openURL(lugar.mapsUrl)} accessibilityRole="button">
                        <Ionicons name="map-outline" size={14} color={TEMA.forte} />
                        <Text style={styles.lugarBotaoTexto}>Abrir no mapa</Text>
                      </TouchableOpacity>
                    )}
                    {!!lugar.telefone && (
                      <TouchableOpacity style={styles.lugarBotao} onPress={() => Linking.openURL(`tel:${lugar.telefone.replace(/[^\d+]/g, '')}`)} accessibilityRole="button">
                        <Ionicons name="call-outline" size={14} color={TEMA.forte} />
                        <Text style={styles.lugarBotaoTexto}>Ligar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              <Text style={styles.lugaresFonte}>Dados: Google</Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <HeaderComCurvas
        aba="Assistente"
        onVoltar={navigation.canGoBack() && navigation.getState()?.type === 'stack' ? () => navigation.goBack() : undefined}
        direita={
          <TouchableOpacity onPress={() => setSobreVisivel(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sobre a inteligência artificial da Lia">
            <Ionicons name="information-circle-outline" size={22} color={TEMA.forte} />
          </TouchableOpacity>
        }
      >
        <View style={styles.cabecalhoLia}>
          <LiaAvatar size={44} reaction={reacaoLia} showRing={false} showBadge={false} />
          <View style={styles.cabecalhoTextos}>
            <Text style={styles.cabecalhoNome}>Lia</Text>
            <Text style={styles.cabecalhoStatus}>Assistente do Ampara · IA da Mauá</Text>
          </View>
        </View>

        {/* Consentimento: sem a chave ligada, nenhum dado da usuária vai para a IA. */}
        <View style={styles.personalizar}>
          <Ionicons name={personalizar ? 'location' : 'location-outline'} size={18} color={TEMA.forte} />
          <View style={styles.flex}>
            <Text style={styles.personalizarTitulo}>Personalizar com meus dados</Text>
            <Text style={styles.personalizarTexto}>
              {personalizar
                ? 'A Lia recebe sua localização aproximada (bairro e cidade), as ocorrências da região, seu nível de risco atual e seu próximo compromisso. A posição exata só serve para buscar lugares perto e não vai para a IA.'
                : 'Ligue para a Lia considerar sua localização aproximada (bairro e cidade), seu nível de risco e sua rotina.'}
            </Text>
          </View>
          <Switch
            value={personalizar}
            onValueChange={alternarPersonalizar}
            trackColor={{ false: '#E6DCE0', true: TEMA.forte }}
            thumbColor="#FFF"
            accessibilityLabel="Personalizar as respostas da Lia com meus dados: compartilha sua localização aproximada, bairro e cidade, as ocorrências da região, seu nível de risco atual e seu próximo compromisso"
          />
        </View>
      </HeaderComCurvas>

      <LiaHelpModal
        aba="Assistente"
        visible={sobreVisivel}
        title="Sobre a IA da Lia"
        message={SOBRE_A_IA}
        image={require('../assets/images/baro-logo.png')}
        imageLabel="Logo da Barô, a IA da Mauá"
        onClose={() => setSobreVisivel(false)}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={listaRef}
          data={mensagens}
          renderItem={renderMensagem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listaConteudo}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          ListFooterComponent={
            digitando ? (
              <View style={styles.linha}>
                <View style={styles.avatarBot}>
                  <LiaAvatar size={34} reaction="pensando" showRing={false} showBadge={false} />
                </View>
                <View style={[styles.balao, styles.balaoBot, styles.balaoDigitando]}>
                  <ActivityIndicator size="small" color={TEMA.forte} />
                  <Text style={styles.textoDigitando}>digitando...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* As sugestões somem depois da primeira pergunta: elas servem para destravar o
            início da conversa, não para competir com o histórico. */}
        {mensagens.length === 1 && (
          <View style={styles.sugestoes}>
            {SUGESTOES.map((s) => (
              <TouchableOpacity key={s} style={styles.sugestao} onPress={() => enviar(s)}>
                <Text style={styles.sugestaoTexto}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.barraEnvio}>
          <TextInput
            style={styles.campo}
            placeholder="Escreva sua dúvida..."
            placeholderTextColor="#A69CB5"
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={() => enviar()}
            returnKeyType="send"
            multiline
          />
          {tecladoVisivel && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fechar teclado"
              style={styles.botaoTeclado}
              onPress={() => Keyboard.dismiss()}
            >
              <Ionicons name="chevron-down" size={22} color={TEMA.forte} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            style={[styles.botaoEnviar, (!texto.trim() || digitando) && styles.botaoEnviarInativo]}
            onPress={() => enviar()}
            disabled={!texto.trim() || digitando}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  cabecalhoLia: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cabecalhoTextos: { flex: 1 },
  cabecalhoNome: { color: TEMA.forte, fontSize: 28, lineHeight: 32, fontFamily: FonteDaLia },
  cabecalhoStatus: { color: '#776C73', fontSize: 12, marginTop: 1 },

  personalizar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  personalizarTitulo: { fontSize: 13, fontWeight: '700', color: Brand.ink },
  personalizarTexto: { fontSize: 12, color: '#776C73', marginTop: 1 },

  listaConteudo: { padding: 16, gap: 12 },
  linha: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' },
  linhaUsuaria: { justifyContent: 'flex-end' },
  avatarBot: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },

  balao: { maxWidth: '78%', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 20 },
  balaoBot: { backgroundColor: '#F4F1F8', borderBottomLeftRadius: 4 },
  balaoUsuaria: { backgroundColor: TEMA.forte, borderBottomRightRadius: 4 },
  balaoDigitando: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  textoBalao: { fontSize: 15, color: '#3A3150', lineHeight: 21 },
  textoBalaoUsuaria: { color: '#FFF' },
  textoDigitando: { fontSize: 13, color: TEMA.forte },

  lugares: { marginTop: 10, gap: 8 },
  lugar: { backgroundColor: TEMA.fundo, borderRadius: 16, padding: 11, gap: 2 },
  lugarNome: { fontSize: 14, fontWeight: '700', color: Brand.ink },
  lugarDetalhe: { fontSize: 12, color: '#776C73' },
  lugarAcoes: { flexDirection: 'row', gap: 14, marginTop: 6 },
  lugarBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3 },
  lugarBotaoTexto: { fontSize: 12.5, color: TEMA.forte, fontWeight: '700' },
  lugaresFonte: { fontSize: 10, color: '#8A8590', textAlign: 'right' },

  sugestoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  sugestao: { backgroundColor: TEMA.fundo, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 14 },
  sugestaoTexto: { fontSize: 13, color: TEMA.forte, fontWeight: '600' },

  barraEnvio: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12, backgroundColor: '#FFF' },
  campo: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    backgroundColor: '#F4F1F8',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Brand.ink,
  },
  botaoEnviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: TEMA.forte, alignItems: 'center', justifyContent: 'center' },
  botaoTeclado: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  botaoEnviarInativo: { backgroundColor: '#CFC6DD' },
})

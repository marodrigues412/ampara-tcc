import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, Image, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Respostas fixas enquanto a IA não está conectada. A troca acontece em responder():
// basta substituir a busca local por uma chamada ao serviço, mantendo o mesmo formato.
const BASE_RESPOSTAS = [
  {
    palavras: ['sos', 'botão', 'botao', 'acionar', 'emergência', 'emergencia'],
    texto: 'Para pedir socorro, segure o botão SOS da tela inicial por 3 segundos. Seus contatos de emergência recebem uma mensagem no WhatsApp com sua localização em tempo real.\n\nSe estiver em perigo imediato, ligue 190.',
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
    texto: 'Importunação sexual é crime (Lei 13.718/2018). Você pode denunciar:\n\n• Ligue 180 — Central de Atendimento à Mulher\n• Delegacia da Mulher ou delegacia comum\n• Delegacia Eletrônica da Polícia Civil\n\nSe acontecer no transporte público, procure um funcionário e peça para acionar a segurança.',
  },
  {
    palavras: ['registrar', 'relato', 'relatar', 'ocorrência', 'ocorrencia'],
    texto: 'Toque em REGISTRAR na tela inicial para relatar uma ocorrência. Informe o tipo, o local e o horário.\n\nSeu relato aparece no mapa de todas as usuárias, sem identificar quem registrou.',
  },
]

const RESPOSTA_PADRAO =
  'Ainda não sei responder isso. Posso ajudar com: como acionar o SOS, cadastrar contatos de emergência, entender o mapa de risco, locais seguros, dicas de segurança e como denunciar.\n\nEm situação de emergência, ligue 190.'

const SUGESTOES = [
  'Como funciona o SOS?',
  'Dicas para andar à noite',
  'Como denunciar assédio?',
  'O que é o score de risco?',
]

const MENSAGEM_INICIAL = {
  id: 'inicial',
  autor: 'bot',
  texto: 'Oi! Eu sou a Ampara, sua assistente de segurança.\n\nPosso tirar dúvidas sobre o aplicativo e dar orientações de segurança pessoal. O que você quer saber?',
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

export default function ChatBot({ navigation }) {
  const [mensagens, setMensagens] = useState([MENSAGEM_INICIAL])
  const [texto, setTexto] = useState('')
  const [digitando, setDigitando] = useState(false)
  const listaRef = useRef(null)
  const timeoutRef = useRef(null)

  // Limpa o temporizador da resposta se a tela fechar antes de ela chegar.
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  useEffect(() => {
    listaRef.current?.scrollToEnd({ animated: true })
  }, [mensagens, digitando])

  const enviar = (pergunta) => {
    const conteudo = (pergunta ?? texto).trim()
    if (!conteudo || digitando) return

    setMensagens((atual) => [
      ...atual,
      { id: `u${Date.now()}`, autor: 'usuaria', texto: conteudo },
    ])
    setTexto('')
    setDigitando(true)

    // A pausa é proposital: resposta instantânea passa a sensação de texto pronto, e
    // some com o indicador de "digitando" antes de ele ser percebido.
    timeoutRef.current = setTimeout(() => {
      setMensagens((atual) => [
        ...atual,
        { id: `b${Date.now()}`, autor: 'bot', texto: responder(conteudo) },
      ])
      setDigitando(false)
    }, 700)
  }

  const renderMensagem = ({ item }) => {
    const daUsuaria = item.autor === 'usuaria'
    return (
      <View style={[styles.linha, daUsuaria && styles.linhaUsuaria]}>
        {!daUsuaria && (
          <View style={styles.avatarBot}>
            <Image
              source={require('../assets/images/maos-ampara-rosa.png')}
              style={styles.avatarImagem}
              resizeMode="contain"
            />
          </View>
        )}
        <View style={[styles.balao, daUsuaria ? styles.balaoUsuaria : styles.balaoBot]}>
          <Text style={[styles.textoBalao, daUsuaria && styles.textoBalaoUsuaria]}>
            {item.texto}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.cabecalho}>
        {/* A tela vive na barra de abas, mas também pode ser aberta pelo Perfil: a seta
            de voltar só aparece quando existe para onde voltar. */}
        {navigation.canGoBack() && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.voltar}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
        )}
        <View style={styles.avatarCabecalho}>
          <Image
            source={require('../assets/images/maos-ampara-rosa.png')}
            style={styles.avatarImagem}
            resizeMode="contain"
          />
        </View>
        <View style={styles.cabecalhoTextos}>
          <Text style={styles.cabecalhoNome}>Ampara</Text>
          <Text style={styles.cabecalhoStatus}>Assistente de segurança</Text>
        </View>
      </View>

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
          ListFooterComponent={
            digitando ? (
              <View style={styles.linha}>
                <View style={styles.avatarBot}>
                  <Image
                    source={require('../assets/images/maos-ampara-rosa.png')}
                    style={styles.avatarImagem}
                    resizeMode="contain"
                  />
                </View>
                <View style={[styles.balao, styles.balaoBot, styles.balaoDigitando]}>
                  <ActivityIndicator size="small" color="#5A8FAF" />
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
            placeholderTextColor="#A0B8C8"
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={() => enviar()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
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
  container: { flex: 1, backgroundColor: '#F5EFE6' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1B3A6B',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  voltar: { padding: 4 },
  avatarCabecalho: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImagem: { width: '70%', height: '70%' },
  cabecalhoTextos: { flex: 1 },
  cabecalhoNome: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  cabecalhoStatus: { color: '#8EB4D0', fontSize: 12, marginTop: 1 },

  listaConteudo: { padding: 16, gap: 12 },
  linha: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' },
  linhaUsuaria: { justifyContent: 'flex-end' },
  avatarBot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },

  balao: { maxWidth: '78%', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 18 },
  balaoBot: { backgroundColor: '#FFF', borderBottomLeftRadius: 4 },
  balaoUsuaria: { backgroundColor: '#C4687A', borderBottomRightRadius: 4 },
  balaoDigitando: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  textoBalao: { fontSize: 15, color: '#1B3A6B', lineHeight: 21 },
  textoBalaoUsuaria: { color: '#FFF' },
  textoDigitando: { fontSize: 13, color: '#5A8FAF' },

  sugestoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  sugestao: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E0D8',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  sugestaoTexto: { fontSize: 13, color: '#5A8FAF', fontWeight: '600' },

  barraEnvio: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E0D8',
  },
  campo: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    backgroundColor: '#F5EFE6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: '#1B3A6B',
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#C4687A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoEnviarInativo: { backgroundColor: '#D8C4C9' },
})

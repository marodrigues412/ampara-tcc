import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand, TemaDaAba } from '../constants/brandTheme'
import HeaderComCurvas from '../components/HeaderComCurvas'

// Cores da seção de onde a tela é aberta.
const TEMA = TemaDaAba.Perfil

// Avisos que a usuária precisa conhecer antes de confiar no app. Escrito para quem usa,
// não para quem desenvolve: diz o que o Ampara faz, o que ele não faz e quando ele pode
// falhar. Ao mudar uma regra do app (raio, período dos dados, cidades), atualize aqui.
const ATUALIZADO_EM = 'outubro de 2026'

const SECOES = [
  {
    icone: 'alert-circle-outline',
    titulo: 'O Ampara não é um serviço de emergência',
    itens: [
      'O app não aciona a polícia, a ambulância nem nenhum serviço público.',
      'Em perigo imediato, ligue 190. Para violência contra a mulher, ligue 180.',
      'O Ampara é uma ferramenta de apoio e não garante a sua segurança.',
    ],
  },
  {
    icone: 'megaphone-outline',
    titulo: 'Alerta SOS',
    itens: [
      'O alerta é enviado aos seus contatos de emergência (até 3) com a sua localização.',
      'Ele precisa de internet. Sem conexão, o alerta não é enviado.',
      'A entrega depende de serviços externos de mensagem e da operadora, e pode atrasar ou falhar. O app informa quando não consegue confirmar o envio.',
      'Avise seus contatos de que eles podem receber alertas do Ampara.',
    ],
  },
  {
    icone: 'map-outline',
    titulo: 'Mapa de ocorrências',
    itens: [
      'Os dados vêm dos registros abertos da Secretaria da Segurança Pública de SP (SSP-SP).',
      'Cobrem só 9 cidades: São Paulo, Guarulhos, Osasco, Barueri, Santo André, São Bernardo do Campo, São Caetano do Sul, Diadema e Mauá. Fora delas, o mapa fica sem informação.',
      'Mostram os últimos 6 meses publicados pela SSP, que divulga os dados com alguns meses de atraso. O mês atual nunca aparece.',
      'Só aparecem crimes que viraram boletim de ocorrência. Muitos casos não são registrados, principalmente os de violência contra a mulher.',
      'Crimes sexuais não aparecem no mapa, porque a SSP não divulga a localização deles. Isso não quer dizer que eles não aconteçam na região.',
      'O mapa mostra a quantidade de registros, não a chance de algo acontecer com você. Lugares com muita gente circulando tendem a ter mais registros.',
      'A localização de cada ocorrência é aproximada.',
      'Área verde quer dizer menos registros, e não que o lugar é seguro.',
    ],
  },
  {
    icone: 'speedometer-outline',
    titulo: 'Score de risco',
    itens: [
      'É uma estimativa calculada por regras definidas pela equipe do projeto, a partir dos registros num raio de 1 km, do horário, dos seus locais seguros e dos sensores do celular.',
      'Não é uma previsão. Um score baixo não garante que o lugar ou o momento são seguros.',
      'O local seguro vale num raio de 80 m. Com o GPS impreciso, por exemplo dentro de prédios, o app pode não reconhecer que você está nele.',
    ],
  },
  {
    icone: 'pulse-outline',
    titulo: 'Monitoramento automático',
    itens: [
      'Só funciona com o Ampara aberto. Com o app fechado ou em segundo plano, não há detecção automática nem alertas.',
      'A localização é atualizada a cada 50 m ou 5 minutos, para economizar bateria.',
      'A detecção de movimentos bruscos pode dar alarme falso (uma queda do celular, um exercício) ou não perceber uma situação real.',
      'Os compromissos de exercício da rotina também só ligam o modo atividade com o app aberto.',
    ],
  },
  {
    icone: 'watch-outline',
    titulo: 'Smartwatch',
    itens: [
      'A leitura cardíaca e o acelerômetro do relógio funcionam só no Android, com Galaxy Watch e Health Connect.',
      'A frequência cardíaca é usada só como sinal de apoio ao score. O Ampara não é um dispositivo médico e não faz diagnóstico.',
    ],
  },
  {
    icone: 'chatbubble-ellipses-outline',
    titulo: 'Lia, a assistente',
    itens: [
      'As respostas são geradas por inteligência artificial (Barô, a IA do Instituto Mauá) e podem conter erros.',
      'A Lia dá orientações gerais. Não substitui orientação jurídica, médica, psicológica ou atendimento de emergência.',
      'Não envie à Lia dados pessoais, endereços, senhas ou informações de saúde.',
      'Com "Personalizar com meus dados" ligado no chat, cada pergunta vai com seu bairro, seu risco atual, seu próximo compromisso e um resumo do seu histórico. Sua localização exata vai só até o servidor do Ampara, para buscar lugares próximos (pelo Google), e não é enviada à IA. Desligado, vai só a pergunta.',
      'Se a IA estiver fora do ar, a Lia responde só com um conjunto pequeno de respostas prontas.',
    ],
  },
  {
    icone: 'lock-closed-outline',
    titulo: 'Seus dados',
    itens: [
      'Para funcionar, o Ampara guarda: seu nome e e-mail, seus contatos de emergência, seus locais seguros, os compromissos da sua rotina (lugares e horários), o histórico de localização e de score, o status do modo atividade, os alertas enviados e as ocorrências que você registrar.',
      'Com o smartwatch conectado, também são usadas as leituras de frequência cardíaca.',
      'Esses dados ficam num banco de dados na nuvem (Supabase) e são usados só para as funções do app: score, alertas, dashboard e histórico.',
      'As ocorrências que você registra podem ser usadas, sem identificar você, para as funções do app.',
      'Você pode pedir a exclusão dos seus dados à equipe do projeto.',
    ],
  },
  {
    icone: 'school-outline',
    titulo: 'Projeto acadêmico',
    itens: [
      'O Ampara é um Trabalho de Conclusão de Curso do Instituto Mauá de Tecnologia, em fase de testes.',
      'É oferecido como está, sem garantia de funcionamento contínuo ou livre de falhas.',
    ],
  },
]

export default function LegalNotice({ navigation }) {
  return (
    <View style={styles.container}>
      <HeaderComCurvas
        aba="Perfil"
        onVoltar={() => navigation.goBack()}
        titulo="Avisos e limitações"
        subtitulo="Leia antes de usar o Ampara. Aqui está o que o app faz, o que ele não faz e quando ele pode falhar."
        style={styles.header}
      />

      <ScrollView contentContainerStyle={styles.conteudo} showsVerticalScrollIndicator={false}>

        <View style={styles.emergencia}>
          <TouchableOpacity style={styles.botaoLigar} onPress={() => Linking.openURL('tel:190')} accessibilityRole="button">
            <Ionicons name="call" size={18} color="#FFF" />
            <Text style={styles.botaoLigarTexto}>Ligar 190</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.botaoLigar, styles.botaoLigar180]} onPress={() => Linking.openURL('tel:180')} accessibilityRole="button">
            <Ionicons name="call" size={18} color={TEMA.forte} />
            <Text style={[styles.botaoLigarTexto, { color: TEMA.forte }]}>Ligar 180</Text>
          </TouchableOpacity>
        </View>

        {SECOES.map((secao) => (
          <View key={secao.titulo} style={styles.secao}>
            <View style={styles.secaoTopo}>
              <Ionicons name={secao.icone} size={20} color={TEMA.forte} />
              <Text style={styles.secaoTitulo} accessibilityRole="header">{secao.titulo}</Text>
            </View>
            {secao.itens.map((item) => (
              <View key={item} style={styles.item}>
                <View style={styles.marcador} />
                <Text style={styles.itemTexto}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.rodape}>Última atualização: {ATUALIZADO_EM}.</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  // O header vai de ponta a ponta: as margens negativas desfazem o padding da tela.
  header: { marginHorizontal: -22, marginBottom: 14 },
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 22 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 6 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voltarTexto: { color: TEMA.forte, fontSize: 15, fontWeight: '600' },
  logo: { width: 36, height: 36 },
  conteudo: { paddingBottom: 60 },
  titulo: { fontSize: 26, fontWeight: '700', color: TEMA.forte, marginTop: 8 },
  subtitulo: { color: Brand.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },

  emergencia: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 6 },
  botaoLigar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TEMA.forte, borderRadius: 20, paddingVertical: 13 },
  botaoLigar180: { backgroundColor: TEMA.fundo },
  botaoLigarTexto: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  secao: { paddingVertical: 16 },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  secaoTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: Brand.ink },
  item: { flexDirection: 'row', gap: 10, marginBottom: 8, paddingLeft: 4 },
  marcador: { width: 5, height: 5, borderRadius: 3, backgroundColor: TEMA.forte, marginTop: 8 },
  itemTexto: { flex: 1, fontSize: 14, lineHeight: 21, color: Brand.ink },
  rodape: { color: Brand.muted, fontSize: 12, marginTop: 18, textAlign: 'center' },
})

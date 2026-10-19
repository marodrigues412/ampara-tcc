import React from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import HeaderComCurvas from '../components/HeaderComCurvas'
import { Brand, TemaDaAba, CremeDoSite } from '../constants/brandTheme'

// Aberta depois do envio do SOS. Segue o tema da Proteção, de onde o alerta parte.
const TEMA = TemaDaAba['Proteção']

const secoes = [
  {
    titulo: 'Faça agora',
    icone: 'heart-outline',
    cor: TEMA.forte,
    fundo: TEMA.fundo,
    itens: [
      'Respire fundo. Manter a calma ajuda a tomar decisões melhores.',
      'Seus contatos de emergência já foram avisados com sua localização.',
      'Mantenha o celular na mão e a tela visível.',
      'Ligue para 190 (Polícia) se estiver em perigo imediato.',
    ],
  },
  {
    titulo: 'Vá para um local seguro',
    icone: 'navigate-outline',
    cor: TemaDaAba.Mapa.forte,
    fundo: TemaDaAba.Mapa.fundo,
    itens: [
      'Farmácias, supermercados e lojas abertas são bons pontos de apoio.',
      'Postos de gasolina costumam ter funcionários 24h.',
      'Delegacias da Mulher (DEAM) são especializadas no seu atendimento.',
      'Evite locais desertos, becos ou áreas mal iluminadas.',
      'Se estiver num veículo, trave as portas e vá a um lugar movimentado.',
    ],
  },
  {
    titulo: 'Peça ajuda por perto',
    icone: 'people-outline',
    cor: TemaDaAba.Assistente.forte,
    fundo: TemaDaAba.Assistente.fundo,
    itens: [
      'Sinalize discretamente para alguém de confiança próximo.',
      'Você pode pedir para ficar em uma loja ou estabelecimento até se sentir segura.',
      'Se possível, fique em grupo: não fique sozinha enquanto espera ajuda.',
    ],
  },
  {
    titulo: 'Evite',
    icone: 'hand-left-outline',
    cor: Brand.amber,
    fundo: Brand.amberSoft,
    itens: [
      'Não confronte o agressor: sair da situação é sempre prioridade.',
      'Não volte para casa sozinha se sentir que está sendo seguida.',
      'Não ignore sua intuição: se algo parece errado, confie nesse sinal.',
    ],
  },
]

const NUMEROS = [
  ['190', 'Polícia Militar'],
  ['180', 'Central de Atendimento à Mulher (24h, gratuito)'],
  ['192', 'SAMU (emergências médicas)'],
  ['193', 'Bombeiros'],
  ['197', 'Polícia Civil'],
]

export default function HelpGuide({ navigation }) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeaderComCurvas
          aba="Proteção"
          onVoltar={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          titulo="Precisa de ajuda?"
          subtitulo="Seu alerta foi enviado. Aqui estão orientações para os próximos momentos."
        />

        {secoes.map((secao) => (
          <View key={secao.titulo} style={styles.secao}>
            <View style={styles.secaoTopo}>
              <View style={[styles.icone, { backgroundColor: secao.fundo }]}>
                <Ionicons name={secao.icone} size={18} color={secao.cor} />
              </View>
              <Text style={[styles.secaoTitulo, { color: secao.cor }]}>{secao.titulo}</Text>
            </View>
            {secao.itens.map((item) => (
              <View key={item} style={styles.item}>
                <View style={[styles.ponto, { backgroundColor: secao.cor }]} />
                <Text style={styles.itemTexto}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.secao}>
          <View style={styles.secaoTopo}>
            <View style={[styles.icone, { backgroundColor: TemaDaAba.Dashboard.fundo }]}>
              <Ionicons name="call-outline" size={18} color={TemaDaAba.Dashboard.forte} />
            </View>
            <Text style={[styles.secaoTitulo, { color: TemaDaAba.Dashboard.forte }]}>Números de emergência</Text>
          </View>
          {NUMEROS.map(([numero, nome]) => (
            <TouchableOpacity
              key={numero}
              style={styles.numero}
              onPress={() => Linking.openURL(`tel:${numero}`)}
              accessibilityRole="button"
              accessibilityLabel={`Ligar para ${numero}, ${nome}`}
            >
              <Text style={[styles.numeroValor, { color: TemaDaAba.Dashboard.forte }]}>{numero}</Text>
              <Text style={styles.numeroNome}>{nome}</Text>
              <Ionicons name="call" size={16} color={TemaDaAba.Dashboard.forte} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.rodape, { color: TEMA.forte }]}>Você não está sozinha. O Ampara está com você.</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CremeDoSite },
  content: { paddingBottom: 48 },
  secao: { marginHorizontal: 20, marginTop: 22 },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  icone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  secaoTitulo: { fontSize: 16, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5, paddingLeft: 13 },
  ponto: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  itemTexto: { flex: 1, fontSize: 14, color: Brand.ink, lineHeight: 21 },
  numero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingLeft: 13 },
  numeroValor: { fontSize: 17, fontWeight: '800', width: 40 },
  numeroNome: { flex: 1, fontSize: 14, color: Brand.ink },
  rodape: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 18, textAlign: 'center', marginTop: 30, marginHorizontal: 30 },
})

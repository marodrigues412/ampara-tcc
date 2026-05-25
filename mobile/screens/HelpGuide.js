import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const secoes = [
  {
    titulo: 'Faça agora',
    cor: '#C4687A',
    corFundo: '#FFF0F0',
    itens: [
      'Respire fundo. Manter a calma ajuda a tomar decisões melhores.',
      'Seus contatos de emergência já foram avisados com sua localização.',
      'Mantenha o celular na mão e a tela visível.',
      'Ligue para 190 (Polícia) se estiver em perigo imediato.',
    ]
  },
  {
    titulo: 'Vá para um local seguro',
    cor: '#1B3A6B',
    corFundo: '#EFF6FF',
    itens: [
      'Farmácias, supermercados e lojas abertas são bons pontos de apoio.',
      'Postos de gasolina costumam ter funcionários 24h.',
      'Delegacias da Mulher (DEAM) são especializadas no seu atendimento.',
      'Evite locais desertos, becos ou áreas mal iluminadas.',
      'Se estiver num veículo, trave as portas e vá a um lugar movimentado.',
    ]
  },
  {
    titulo: 'Peça ajuda por perto',
    cor: '#6B21A8',
    corFundo: '#FAF0FF',
    itens: [
      'Sinalize discretamente para alguém de confiança próximo.',
      'Você pode pedir para ficar em uma loja ou estabelecimento até se sentir segura.',
      'Se possível, fique em grupo — não fique sozinha enquanto espera ajuda.',
    ]
  },
  {
    titulo: 'Evite',
    cor: '#92400E',
    corFundo: '#FFFBEB',
    itens: [
      'Não confronte o agressor — sair da situação é sempre prioridade.',
      'Não volte para casa sozinha se sentir que está sendo seguida.',
      'Não ignore sua intuição: se algo parece errado, confie nesse sinal.',
    ]
  },
  {
    titulo: 'Números de emergência',
    cor: '#065F46',
    corFundo: '#F0FDF4',
    itens: [
      '190 — Polícia Militar',
      '192 — SAMU (emergências médicas)',
      '193 — Bombeiros',
      '180 — Central de Atendimento à Mulher (24h, gratuito)',
      '197 — Polícia Civil',
    ]
  }
]

export default function HelpGuide({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color="#1B3A6B" />
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>
          <Image source={require('../assets/images/maos-ampara-azul.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
        </View>

        <Text style={styles.title}>Precisa de Ajuda?</Text>
        <Text style={styles.subtitle}>
          Seu alerta foi enviado. Aqui estão orientações para os próximos momentos.
        </Text>

        {secoes.map((secao, i) => (
          <View key={i} style={[styles.card, { backgroundColor: secao.corFundo, borderLeftColor: secao.cor }]}>
            <Text style={[styles.cardTitulo, { color: secao.cor }]}>{secao.titulo}</Text>
            {secao.itens.map((item, j) => (
              <View key={j} style={styles.itemRow}>
                <Text style={[styles.bullet, { color: secao.cor }]}>•</Text>
                <Text style={styles.itemTexto}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.rodape}>
          <Text style={styles.rodapeTexto}>
            Você não está sozinha. O Ampara está com você.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE6'
  },
  content: {
    padding: 20,
    paddingBottom: 50
  },
  backButton: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 16,
    color: '#1B3A6B',
    fontWeight: '600'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#C4687A',
    marginTop: 8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
    lineHeight: 22
  },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderLeftWidth: 4
  },
  cardTitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 12
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start'
  },
  bullet: {
    fontSize: 18,
    marginRight: 8,
    lineHeight: 22
  },
  itemTexto: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 21
  },
  rodape: {
    marginTop: 10,
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#D4E9F7',
    borderRadius: 18
  },
  rodapeTexto: {
    fontSize: 15,
    color: '#1B3A6B',
    fontWeight: '600',
    textAlign: 'center'
  }
})

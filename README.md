# 🛡️ Ampara

Sistema inteligente para detecção de situações de vulnerabilidade para a segurança de mulheres, utilizando dados de sensores de smartwatches e aprendizado de máquina.

---

## 📌 Sobre o Projeto

O Ampara é um sistema que monitora dados fisiológicos, comportamentais e contextuais para identificar possíveis situações de risco durante deslocamentos e atividades do dia a dia.

Diferente de soluções tradicionais baseadas apenas em acionamento manual, o sistema utiliza inteligência computacional para identificar padrões anômalos e oferecer suporte à usuária de forma discreta e preventiva.

Além disso, o sistema incorpora mecanismos de personalização, permitindo que o comportamento da usuária seja interpretado de forma mais precisa e contextualizada.

---

## 🚨 Problema

A violência contra a mulher é um problema global de grande escala, afetando milhões de mulheres todos os anos.

Grande parte das soluções atuais:

* dependem exclusivamente da ação da usuária
* não utilizam análise inteligente de dados
* apresentam alta taxa de falsos positivos
* não consideram o contexto da situação

---

## 💡 Proposta

O Ampara propõe um sistema que:

* realiza monitoramento contínuo via smartwatch
* analisa padrões de comportamento da usuária
* detecta anomalias com base em aprendizado de máquina
* considera contexto (localização, horário, histórico)
* permite personalização por meio de atividades e locais seguros
* atua de forma não invasiva

---

## ⚙️ Como Funciona

1. Coleta de dados via sensores:

   * localização (GPS)
   * frequência cardíaca
   * movimento (acelerômetro)
   * padrões de deslocamento

2. Processamento dos dados:

   * análise de séries temporais
   * modelagem de comportamento padrão

3. Detecção de anomalias:

   * identificação de desvios significativos

4. Interação com a usuária:

   * alerta discreto via vibração
   * possibilidade de cancelamento

5. Ação:

   * envio de alerta e localização para contatos de emergência

---

## ⚠️ Diferencial

O sistema adota uma abordagem híbrida entre detecção automática e validação da usuária, reduzindo significativamente falsos positivos.

O botão possui duas funções:

* acionamento manual de emergência
* cancelamento de alertas automáticos

Além disso, o sistema incorpora mecanismos de contexto para melhorar a precisão:

* cadastro de atividades (ex: academia, corrida, caminhada)
* definição de locais seguros (ex: casa, trabalho)
* adaptação ao comportamento individual da usuária ao longo do tempo

---

## 📊 Funcionalidades adicionais

* 📍 Cadastro de locais seguros
* 🏃 Cadastro de atividades recorrentes
* 📈 Aba de relatórios com histórico de eventos
* 🧠 Score de vulnerabilidade baseado em comportamento
* 🕒 Histórico de deslocamentos e ocorrências

---

## 🧠 Tecnologias Envolvidas

* Wearables (smartwatch)
* Sensores (acelerômetro, GPS, batimentos)
* Machine Learning (detecção de anomalias)
* Backend em nuvem

---

## 🔐 Segurança e Privacidade

O sistema lida com dados altamente sensíveis, como localização e informações fisiológicas, sendo necessário:

* criptografia de dados
* controle de acesso
* armazenamento seguro
* conformidade com LGPD

---

## 🚀 Como rodar o projeto

### Pré-requisitos

* Node.js instalado
* Expo (via npx ou app Expo Go)
* Celular ou emulador

### Passos

```
# 1. Clone o repositório
git clone https://github.com/marodrigues412/ampara-tcc.git

# 2. Entre na pasta do projeto
cd ampara-tcc

# 3. Entre na pasta do aplicativo mobile
cd mobile

# 4. Instale as dependências
npm install

# 5. Inicie o projeto
npx expo start
```

### Executando o app

* Abra o app Expo Go no celular
* Escaneie o QR Code exibido
* Ou rode em um emulador

---

## 🎯 Objetivo

Desenvolver um sistema capaz de auxiliar na identificação de situações de vulnerabilidade, aumentando a segurança e o suporte à usuária sem substituir sua autonomia.

---

## 📊 Status

🚧 Em desenvolvimento (TCC – Instituto Mauá de Tecnologia)

---

## 👩‍💻 Autoras

<p align="center">
  <a href="https://github.com/amandaherculano">
    <img src="https://github.com/amandaherculano.png" width="120px;" alt="Amanda Herculano"/>
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/marodrigues412">
    <img src="https://github.com/marodrigues412.png" width="120px;" alt="Maria Eduarda Rodrigues"/>
  </a>
</p>

<p align="center">
  <b>Amanda Herculano</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Maria Eduarda Rodrigues</b>
</p>

<p align="center">
  <a href="https://github.com/amandaherculano">GitHub</a> • 
  <a href="https://www.linkedin.com/in/amanda-herculano/">LinkedIn</a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/marodrigues412">GitHub</a> • 
  <a href="https://www.linkedin.com/in/marodrigu3s/">LinkedIn</a>
</p>

<p align="center">
Desenvolvido como Trabalho de Conclusão de Curso – Instituto Mauá de Tecnologia (2026)
</p>

---

## 📚 Referências

* WHO – Violence against women
* Fórum Brasileiro de Segurança Pública
* Estudos sobre wearable computing e segurança

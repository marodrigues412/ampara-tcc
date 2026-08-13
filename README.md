# 🛡️ Ampara

Sistema inteligente de apoio à segurança feminina, utilizando dados contextuais, sensores móveis e wearables para identificação de possíveis situações de vulnerabilidade.

---

## 📌 Sobre o Projeto

O Ampara é um sistema desenvolvido como Trabalho de Conclusão de Curso do Instituto Mauá de Tecnologia que busca oferecer suporte preventivo à segurança de mulheres durante deslocamentos e atividades do cotidiano.

A solução utiliza informações comportamentais, contextuais e futuramente dados fisiológicos provenientes de smartwatch para identificar situações potencialmente vulneráveis de maneira discreta e não invasiva.

Diferente de aplicativos tradicionais baseados apenas em acionamentos manuais, o Ampara propõe uma abordagem híbrida: combinação entre análise automática de contexto e validação da usuária, reduzindo falsos positivos.

---

## 🚨 Problema

A violência contra a mulher permanece um problema social de grande escala.

Grande parte das soluções existentes:

- dependem exclusivamente da ação manual da usuária
- utilizam apenas botões de emergência
- não consideram contexto
- apresentam alta ocorrência de falsos positivos
- não personalizam o comportamento individual

---

## 💡 Proposta

O Ampara propõe um sistema capaz de:

- analisar informações contextuais e comportamentais
- identificar situações potencialmente vulneráveis
- considerar localização, horário e ambiente
- permitir personalização por atividades e locais seguros
- validar alertas antes do acionamento
- atuar de maneira preventiva e não invasiva

---

## ⚙️ Como funciona

### 1. Coleta de dados

Atualmente:

- GPS
- localização em tempo real
- movimentação do dispositivo
- informações de contexto

Próxima etapa:

- frequência cardíaca
- acelerômetro do smartwatch
- sensores fisiológicos

---

### 2. Análise contextual

O sistema considera:

- horário
- localização
- proximidade de locais seguros
- modo alerta
- atividades informadas
- dados regionais de criminalidade (SSP-SP)

---

### 3. Geração do score de vulnerabilidade

As informações são combinadas para gerar um score contextual que representa possíveis níveis de vulnerabilidade.

Exemplo:

- região com maior incidência criminal
- horário crítico
- movimentação incomum
- distância de locais seguros

→ score aumenta

---

### 4. Fluxo de confirmação

Ao detectar um comportamento potencialmente anômalo:

- aplicativo realiza confirmação discreta
- usuária pode cancelar
- caso necessário ocorre acionamento do SOS

---

### 5. Ação

Em situações críticas:

- envio de localização
- acionamento de contatos de emergência
- registro de ocorrência

---

## 📱 Funcionalidades implementadas

### Conta e perfil

- cadastro
- login
- edição de perfil

### Segurança

- cadastro de até 3 contatos de emergência
- cadastro de locais seguros
- modo alerta

### Mapa e contexto

- visualização de crimes próximos
- integração com dados SSP
- ocorrências da comunidade
- análise geográfica contextual

### Alertas

- fluxo de falso alerta
- cancelamento de alerta
- orientação pós-SOS

---

## 🚧 Em desenvolvimento

- integração com smartwatch (Galaxy Watch)
- Health Connect
- sensores fisiológicos
- envio automático de SMS
- integração AWS
- algoritmo refinado de score
- histórico de eventos
- simulador de risco

---

## ⚠️ Diferenciais

O Ampara utiliza uma abordagem híbrida:

- detecção automática
- análise contextual
- confirmação da usuária

Além disso:

- reduz falsos positivos
- considera comportamento individual
- utiliza locais seguros
- adapta-se ao contexto
- evita experiências invasivas

---

## 🧠 Tecnologias

### Mobile

- React Native
- Expo

### Backend

- Supabase
- PostgreSQL

### Dados

- SSP-SP
- PostGIS

### Cloud (em evolução)

- AWS
- API Gateway
- Lambda
- DynamoDB
- S3

### Futuro

- Health Connect
- Smartwatch Samsung
- Machine Learning

---

## 🔐 Segurança e privacidade

O sistema lida com dados sensíveis como localização e informações comportamentais.

Princípios considerados:

- LGPD
- criptografia de dados
- autenticação segura
- controle de acesso
- armazenamento seguro

---

## 🚀 Como executar

### Clone:

```bash
git clone https://github.com/marodrigues412/ampara-tcc.git
```

### Entre no projeto:

```bash
cd ampara-tcc/mobile
```

### Instale dependências:

```bash
npm install
```

### Execute:

```bash
npx expo start
```

Abra no:

- Expo Go
- Emulador Android
- dispositivo físico

---

## 📊 Atualizar dados da SSP-SP no Supabase

O app lê os crimes da tabela `crime_occurrences`. Para atualizar essa tabela automaticamente com os arquivos da SSP-SP:

### 1. Instale as dependências Python

Na raiz do projeto:

```bash
python3 -m pip install -r data-processing/requirements.txt
```

### 2. Configure a conexão do Supabase

Crie um arquivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Preencha os dados de conexão do Supabase em campos separados. Esse formato evita erro quando a senha tem caracteres especiais:

```text
SUPABASE_DB_HOST=aws-1-us-east-2.pooler.supabase.com
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.hhlxgtwvoxpvyvejvxwt
SUPABASE_DB_PASSWORD=sua_senha
SUPABASE_DB_SSLMODE=require
```

O `.env` não deve ser enviado ao Git, porque contém senha.

### 3. Importe os meses novos

Exemplo para verificar 2026:

```bash
python data-processing/importar_ssp_supabase.py --anos 2026
```

O script baixa o arquivo mais recente da SSP-SP, aplica os mesmos filtros usados no processamento manual e insere apenas meses ainda não registrados em `ssp_imported_months`.

Se a SSP retificar algum mês e for necessário recarregar:

```bash
python data-processing/importar_ssp_supabase.py --anos 2026 --replace-existing
```

---

## 📊 Status

🚧 Em desenvolvimento — TCC Instituto Mauá de Tecnologia

Pré-banca: MVP funcional em evolução

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

- Organização Mundial da Saúde (WHO)
- Fórum Brasileiro de Segurança Pública
- Secretaria de Segurança Pública do Estado de São Paulo
- Estudos sobre wearables e detecção de anomalias

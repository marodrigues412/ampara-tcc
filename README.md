# Ampara

O Ampara é um aplicativo acadêmico desenvolvido como Trabalho de Conclusão de Curso em Ciência da Computação no Instituto Mauá de Tecnologia. A proposta é apoiar mulheres durante deslocamentos e atividades do cotidiano, combinando informações de contexto, recursos de acompanhamento e uma rede de confiança escolhida pela própria usuária.

O projeto investiga uma questão importante: como a tecnologia pode contribuir para mais autonomia e apoio sem transferir para a mulher a responsabilidade pela violência e sem prometer uma segurança que nenhum aplicativo pode garantir?

> **Importante:** o Ampara é um protótipo em desenvolvimento. Seu índice é experimental, não é uma avaliação validada de risco e não prevê crimes. O aplicativo não substitui os serviços de emergência e não chama a polícia. Em perigo imediato, ligue para **190**. Para orientação e denúncias de violência contra a mulher, ligue para **180**.

## O problema

A violência contra a mulher afeta a liberdade de circular e realizar atividades cotidianas. Ferramentas baseadas apenas em um botão de emergência podem depender de a pessoa conseguir perceber o perigo, pegar o celular e pedir ajuda naquele momento. O projeto explora uma forma complementar de apoio, considerando contexto e sinais disponíveis, com checagens que mantêm a usuária no controle.

## A proposta

O Ampara reúne informações úteis para o deslocamento, permite que cada pessoa configure sua rotina e sua rede de apoio e oferece formas de pedir ajuda. O aplicativo pode considerar contexto da região, horário, rotina, locais seguros e, quando disponíveis, sinais de movimento e batimentos cardíacos. Esses sinais alimentam recursos experimentais do protótipo, não uma previsão de segurança.

## Como funciona

1. **A usuária configura o app:** cria uma conta, cadastra contatos de confiança, locais seguros e compromissos da rotina.
2. **O acompanhamento considera os sinais disponíveis:** localização, contexto da região e movimento do celular. Em aparelhos compatíveis, o protótipo também pode receber leituras de um smartwatch.
3. **O app apresenta informações e checagens:** a tela Proteção mostra o estado do acompanhamento e pode pedir que a usuária confirme se está tudo bem.
4. **A usuária pode pedir ajuda:** o SOS manual é acionado ao segurar o botão. O app tenta compartilhar a localização com os contatos cadastrados e informa se conseguiu confirmar o envio.
5. **A pessoa consulta outras áreas do app:** mapa de ocorrências, apoio por perto, relatórios e a assistente virtual Lia.

O comportamento depende de conexão, permissões, aparelho e disponibilidade dos serviços integrados. O acompanhamento pode exigir que o aplicativo permaneça aberto. Um alerta pode falhar; em uma emergência, use os canais oficiais.

## O que o protótipo reúne

- **Proteção e acompanhamento:** tela principal com estado do monitoramento, sinais disponíveis e checagens.
- **SOS e rede de confiança:** cadastro de contatos e tentativa de envio de alerta com localização. O serviço não garante a entrega e não aciona órgãos públicos.
- **Mapa:** busca por endereço, filtros por categorias de ocorrência e visualização de dados históricos publicados pela Secretaria da Segurança Pública de São Paulo (SSP-SP).
- **Apoio por perto:** busca de locais de apoio próximos, quando o serviço de lugares está configurado.
- **Rotina e locais seguros:** cadastro de compromissos e endereços escolhidos pela usuária.
- **Relatórios:** histórico e indicadores construídos a partir dos registros do protótipo.
- **Lia:** assistente virtual para dúvidas sobre o app e orientações gerais. A aparência da Lia pode ser personalizada no perfil.
- **Sensores e smartwatch:** integração experimental com movimento do celular e leituras compatíveis de batimentos e movimento do relógio.
- **Registros da comunidade:** envio e consulta de relatos conforme as funções disponíveis no app e as políticas do banco.

### Limites dos dados

O mapa apresenta registros históricos da SSP-SP nas cidades cobertas pela base. Os dados podem ter atraso, lacunas ou classificações imprecisas. Eles não representam todos os acontecimentos e não permitem inferir que um local é seguro ou perigoso. O índice experimental também não é uma avaliação validada de risco: um resultado baixo não significa que o trajeto seja seguro.

## Tecnologias

- **Aplicativo móvel:** React Native, Expo e React Navigation.
- **Mapas e localização:** Apple Maps no iOS, MapLibre no Android, geolocalização do Expo e busca de endereços.
- **Sensores:** Expo Sensors e integração Android com Health Connect e Galaxy Watch, conforme o aparelho e as permissões.
- **Backend e autenticação:** Supabase, PostgreSQL e PostGIS.
- **Assistente:** Supabase Edge Function conectada à IA da Mauá (Barô); Google Places pode ser usado para busca de lugares.
- **Alertas:** AWS Lambda para encaminhar alertas aos contatos cadastrados.
- **Processamento de dados:** Python para baixar, normalizar e agregar dados públicos da SSP-SP.
- **Site institucional:** Astro.

## Estrutura do repositório

```text
artigo/          Materiais do trabalho acadêmico
aws/             Serviço AWS de encaminhamento de alertas
backend/         Componentes e materiais de backend
data/            Dados e resultados usados pelo projeto
data-processing/ Scripts de processamento, importação e testes
docs/            Documentação técnica, análises e decisões
ia-model/        Materiais relacionados aos modelos de IA e sensores
midia-app/       Telas e materiais de demonstração do aplicativo
mobile/          Aplicativo React Native e Expo
site/            Site institucional em Astro
supabase/        Funções Edge do Supabase
watch/           Aplicativo Android complementar para smartwatch
```

## Executar o aplicativo

Requisitos: Node.js e npm compatíveis com as versões definidas em `mobile/package.json`, além do ambiente nativo Android ou iOS para compilar um development build. Como o projeto usa módulos nativos, o Expo Go não oferece todos os recursos, como integrações de smartwatch e mapas.

```bash
cd mobile
npm install
npx expo run:android
```

Em um Mac com Xcode configurado, também é possível compilar para iOS:

```bash
npx expo run:ios
```

Depois da primeira compilação, inicie o servidor para o development build:

```bash
npx expo start --dev-client
```

Autenticação, chat, mapa e alertas dependem dos serviços configurados no projeto e das permissões concedidas no dispositivo.

## Executar o site

```bash
cd site
npm install
npm run dev
```

Build e pré-visualização de produção:

```bash
npm run build
npm run preview
```

## Processar e importar dados da SSP-SP

Os scripts em `data-processing/` preparam dados públicos para as análises e agregações utilizadas no projeto. Para instalar as dependências Python:

```bash
python3 -m pip install -r data-processing/requirements.txt
```

O importador Supabase usa as variáveis de conexão descritas em `.env.example`. Crie uma cópia local, preencha as credenciais e não envie o arquivo `.env` ao Git:

```bash
cp .env.example .env
```

Exemplo de importação de um ano:

```bash
python3 data-processing/importar_ssp_supabase.py --anos 2026
```

Para substituir meses que tenham sido retificados pela SSP-SP:

```bash
python3 data-processing/importar_ssp_supabase.py --anos 2026 --replace-existing
```

Leia as opções do script antes de executar uma carga: a importação altera dados no banco remoto. Use credenciais apropriadas e confirme o destino.

## Testes

Testes do aplicativo:

```bash
cd mobile
node --test __tests__/*.test.mjs
```

Testes do processamento de dados:

```bash
cd data-processing
python3 -m unittest discover -p 'test_*.py'
```

## Segurança e privacidade

O app pode tratar dados de conta, localização, contatos escolhidos e sinais de sensores quando esses recursos são ativados. Desenvolva com contas e dados de teste, mantenha senhas e chaves privadas fora do Git e revise permissões, políticas de acesso e serviços externos antes de qualquer implantação. Consulte também a página **O projeto** no site para conhecer os limites e compromissos de transparência do protótipo.

## Equipe

<table>
  <tr>
    <td align="center" width="50%">
      <img src="site/public/maria-site.webp" width="220" alt="Maria Eduarda Rodrigues" /><br />
      <strong>Maria Eduarda Rodrigues</strong><br />
      <a href="https://github.com/marodrigues412">GitHub</a> · <a href="https://www.linkedin.com/in/marodrigu3s/">LinkedIn</a>
    </td>
    <td align="center" width="50%">
      <img src="site/public/amanda-site.webp" width="220" alt="Amanda Herculano" /><br />
      <strong>Amanda Herculano</strong><br />
      <a href="https://github.com/amandaherculano">GitHub</a> · <a href="https://www.linkedin.com/in/amanda-herculano/">LinkedIn</a>
    </td>
  </tr>
</table>

### Agradecimentos

- **Orientadores:** Milkes Yone Alvarenga e Rodrigo Bossini Tavares Moreira.
- **Professores que nos apoiaram:** Ana Paula Goncalves Serra, Evandro Catelani Ferraz, Everaldo Pereira, Everson Denis e Sérgio Genciauskas.
- **Coordenação e professores de TCC:** Rudolf Theoderich Buhler, Jhonny Frank Sousa Joca e Alexsander Tressino de Carvalho.
- **Design:** Giovana Pavanato, Pedro Henrique Carvalho e Tiago Perrella.

## Contato e referências

- **Site:** [ampara.info](https://ampara.info)
- **Instagram:** [@amparainfo](https://www.instagram.com/amparainfo/)
- **E-mail:** [amparainfo2026@gmail.com](mailto:amparainfo2026@gmail.com)
- **Dados públicos:** Secretaria da Segurança Pública do Estado de São Paulo (SSP-SP)
- **Referências acadêmicas:** Organização Mundial da Saúde, Fórum Brasileiro de Segurança Pública e estudos documentados em `docs/` e `data-processing/`.

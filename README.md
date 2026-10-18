# Ampara

O Ampara é um aplicativo móvel acadêmico criado por estudantes de Ciência da Computação do Instituto Mauá de Tecnologia. O projeto pesquisa como a tecnologia pode apoiar mulheres em seus deslocamentos, reunindo informação, autonomia e uma rede de confiança.

O Ampara é um protótipo em desenvolvimento, não um serviço de emergência nem uma garantia de segurança. O índice exibido pelo aplicativo é experimental e não representa uma avaliação validada de risco. Em perigo imediato, ligue para 190. Para orientação e denúncias de violência contra a mulher, ligue para 180.

## O aplicativo

O protótipo reúne:

- **Proteção:** acompanhamento durante o trajeto, checagens com a usuária e acionamento manual de SOS.
- **Mapa:** busca por endereço e visualização de ocorrências publicadas pela Secretaria da Segurança Pública de São Paulo (SSP-SP), com filtros e área de apoio por perto.
- **Rede de confiança:** cadastro de contatos de emergência e compartilhamento de alerta e localização quando o envio está disponível.
- **Rotina e locais seguros:** organização de compromissos e endereços escolhidos pela usuária.
- **Relatórios:** histórico e indicadores dos registros de acompanhamento.
- **Lia:** assistente virtual para dúvidas sobre o aplicativo e orientações gerais. Sua aparência pode ser personalizada no perfil.
- **Smartwatch:** integração experimental com leituras compatíveis de batimentos e movimento. A disponibilidade depende do relógio, do celular e das permissões concedidas.

O mapa usa registros históricos, sujeitos a atraso e cobertura desigual. Ocorrências não permitem prever crimes nem afirmar que um lugar é seguro ou inseguro. O SOS depende de conexão, permissões e serviços externos; o Ampara não chama a polícia e não garante que uma mensagem seja entregue. No protótipo, algumas funções de acompanhamento podem exigir que o aplicativo permaneça aberto.

## Tecnologias

- **Aplicativo:** React Native com Expo, React Navigation e módulos nativos para localização, mapas, sensores e smartwatch.
- **Serviços e dados:** Supabase, PostgreSQL e PostGIS.
- **Assistente:** função Edge do Supabase integrada à IA da Mauá (Barô); a busca por lugares usa Google Places quando configurada.
- **Alertas:** função AWS Lambda para encaminhamento a contatos cadastrados.
- **Site institucional:** Astro.
- **Processamento de dados:** Python para importar e preparar dados públicos da SSP-SP e gerar agregações utilizadas pelo mapa.

## Estrutura do repositório

```text
mobile/          Aplicativo React Native e Expo
site/            Site institucional Astro
supabase/        Funções Edge
aws/             Serviço de encaminhamento de alertas
data-processing/ Scripts de processamento, importação e testes dos dados
data/            Arquivos e resultados de dados do projeto
docs/            Decisões, análises e documentação técnica
watch/           Aplicativo Android complementar para smartwatch
```

## Executar o aplicativo

Requisitos: Node.js compatível com a versão do Expo definida em `mobile/package.json`, npm e ambiente nativo Android ou iOS para criar um development build. Recursos que dependem de módulos nativos, incluindo mapas e smartwatch, não estão todos disponíveis no Expo Go.

```bash
cd mobile
npm install
npx expo run:android
```

Em um Mac com Xcode configurado, também é possível iniciar no iOS:

```bash
npx expo run:ios
```

Depois da primeira compilação, inicie o servidor de desenvolvimento com `npx expo start --dev-client` e abra o aplicativo compilado no dispositivo ou emulador. O uso do mapa, localização, chat e alertas depende dos serviços e permissões correspondentes.

## Executar o site

```bash
cd site
npm install
npm run dev
```

Para gerar e conferir a versão de produção:

```bash
npm run build
npm run preview
```

## Dados da SSP-SP

Os scripts em `data-processing/` baixam, normalizam e agregam dados públicos para as análises do projeto. A importação no banco exige Python, as dependências do arquivo `data-processing/requirements.txt` e credenciais de banco Supabase. Configure os valores localmente em um arquivo `.env` conforme os nomes esperados pelo script; nunca compartilhe nem versione senhas ou chaves privadas.

```bash
python3 -m pip install -r data-processing/requirements.txt
python3 -m unittest discover -s data-processing -p 'test_*.py'
```

O processamento e a importação podem alterar dados ou o banco remoto. Leia as opções e confirme o destino antes de executar scripts de carga. Os dados públicos também têm limitações de cobertura, classificação e atualização.

## Testes

Os testes automatizados disponíveis podem ser executados separadamente:

```bash
cd mobile
node --test __tests__/*.test.mjs
```

```bash
cd data-processing
python3 -m unittest discover -p 'test_*.py'
```

## Privacidade e segurança

O aplicativo pode tratar dados de conta, localização, contatos escolhidos e sinais de sensores quando esses recursos são ativados. Use apenas dados de demonstração ou contas de teste ao desenvolver. Não inclua credenciais em commits, não use dados pessoais reais em testes e revise as permissões e políticas do Supabase e dos serviços externos antes de qualquer implantação.

O site institucional descreve os limites do protótipo e os canais de contato. Antes de uma distribuição pública do aplicativo, a equipe deve manter informações de privacidade, retenção de dados e suporte adequadas à versão que será lançada.

## Projeto acadêmico

Desenvolvido como Trabalho de Conclusão de Curso em Ciência da Computação no Instituto Mauá de Tecnologia.

- Site: [ampara.info](https://ampara.info)
- Instagram: [@amparainfo](https://www.instagram.com/amparainfo/)
- Contato: [amparainfo2026@gmail.com](mailto:amparainfo2026@gmail.com)

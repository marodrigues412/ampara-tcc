# Como retomar o projeto

Anotações de onde o Ampara parou, o que já está pronto e o que falta. Escrito em
2026-09-27.

---

## 1. Como rodar

```bash
cd mobile
npm install
npx expo start --tunnel     # o --tunnel importa, ver secao 5
```

No iPhone, abra pelo Expo Go. O APK Android mais recente está em
https://expo.dev/accounts/amanda.herculano/projects/ampara-app

### Scripts de dados (Python)

```bash
python -m pip install -r data-processing/requirements.txt
python data-processing/aplicar_sql.py data/arquivo.sql        # aplica SQL no Supabase
python data-processing/importar_ssp_supabase.py --anos 2026   # importa crimes da SSP
```

Os dois leem o `.env` da raiz, que **não vai para o git**. Se ele sumir, recrie a partir
do `.env.example`; a senha do banco está em *Supabase → Settings → Database*.

---

## 2. O que já funciona

| Área | Situação |
|---|---|
| Mapa de crimes | Busca por proximidade real via função `nearby_crimes` no banco |
| Filtros | Tipo (Roubo/Furto/Violência/Trânsito) e ano; abre em 2026 + Roubo |
| Relatos da comunidade | Visíveis para todas, sem identificar quem registrou |
| SOS | Grava status real de entrega; modal mostra quem recebeu e quem falhou |
| Lambda | Exige login do Supabase, lê contatos do banco, envia SMS + WhatsApp |
| Login com Google | Funcionando, cria o perfil automaticamente no primeiro acesso |
| APK Android | Gerado pela EAS, com mapa e login funcionando |

---

## 3. O que falta

1. **Modelo do WhatsApp** — `ampara_alerta_seguranca` ficou em análise na Meta. Conferir em
   *WhatsApp Manager → Modelos de mensagem*. Enquanto não aprovar, o SOS sai só por SMS.
2. **Sair do sandbox do SNS** — hoje o SMS só chega em número verificado, e o limite de
   gasto é US$ 1/mês. Pedido em *SNS → Text messaging (SMS) → Exit SMS sandbox* (região
   Ohio), somado a um aumento do limite para 10.
3. **Santo André** — a tabela `crime_occurrences` tem **zero** registros da cidade. A causa
   já está corrigida no importador (a SSP escreve `S.ANDRE`, não `SANTO ANDRE`), mas falta
   reimportar. Precisa de `--replace-existing`, senão o script pula os meses que já têm
   dados:
   ```bash
   python data-processing/importar_ssp_supabase.py --anos 2026 --skip-download --replace-existing
   ```
4. **Trocar credenciais** — a senha do banco, a chave secreta do Supabase e a chave secreta
   do Google passaram por conversa e devem ser regeradas.
5. **Restringir a chave do Maps** — hoje está sem restrição. Depois de confirmar que o mapa
   funciona no APK, limitar por pacote (`com.anonymous.amparaapp`) e pela impressão digital
   SHA-1, que sai de `npx eas credentials`.
6. **Login com Apple** — botão removido da tela; exige o Apple Developer Program
   (US$ 99/ano). O `authService` é genérico, então voltar é só reativar o provedor no
   Supabase e chamar `handleProvedor('apple')`.

---

## 4. Onde está cada coisa

| O quê | Onde |
|---|---|
| Projeto Supabase | `hhlxgtwvoxpvyvejvxwt` |
| Conta AWS | `471112979531`, região **us-east-2** (Ohio) |
| Lambda | `ampara-alert-trigger`; código versionado em `aws/ampara-alert-trigger/` |
| URL do alerta | `https://qmlbzb5gholsqef7ggyzc74wle0lweya.lambda-url.us-east-2.on.aws/` |
| WhatsApp — Phone number ID | `131494578416846` |
| WhatsApp — Business Account ID | `2022874905094748` |
| Projeto EAS | `@amanda.herculano/ampara-app` |
| SQL do banco | `data/*.sql` (todos já aplicados) |

Segredos ficam **fora do git**: `.env` na raiz e variáveis de ambiente da Lambda
(`WHATSAPP_TOKEN`, `SUPABASE_*`).

---

## 5. Armadilhas que já custaram tempo

**O Supabase recusa endereço de retorno com IP.** É uma regra de segurança anterior à lista
de permitidos ([supabase/auth#2039](https://github.com/supabase/auth/issues/2039)). Como o
Expo Go usa `exp://192.168.x.x:8081/--/auth-callback`, o login social **nunca** funciona na
rede local — não adianta cadastrar o endereço, nem com curinga. Por isso o `--tunnel`, que
troca o IP por um nome (`*.exp.direct`). No APK o endereço é `mobile://auth-callback`, sem
host, e funciona sempre.

**O Supabase corta em 1.000 linhas por consulta** (`db-max-rows`). Pedir mais devolve 1.000
do mesmo jeito. Por isso a ordenação por distância é feita no banco: sem `ORDER BY`, o corte
devolvia uma faixa estreita de latitude, e o mapa mostrava os crimes numa reta.

**A Lambda antiga respondia HTTP 200 mesmo em erro.** Se for mexer nela, mantenha o status
correto — foi o que fazia o app dizer "Alerta Enviado" sem nada ter sido enviado.

**O número do WhatsApp na API não funciona mais no aplicativo do celular.** É um caminho
sem volta fácil.

**O Norton intercepta HTTPS** nesta máquina, o que quebra `curl` e AWS CLI. A CLI foi
apontada para um pacote de certificados que inclui o do Norton (`~/.aws/ca-bundle-com-norton.pem`).
Se voltar a dar erro de SSL, é isso.

---

## 6. Roteiro de teste

1. Login com Google (cria conta e perfil no primeiro acesso)
2. Mapa com os pinos; trocar filtros de tipo e ano
3. Registrar uma ocorrência e conferir se aparece para outra usuária
4. Segurar o SOS por 3 segundos e verificar `alert_logs`:
   ```sql
   select created_at, status, recipient_names, detalhe
   from alert_logs order by created_at desc limit 5;
   ```
   `status` deve ser `enviado` ou `falhou` **com o motivo** — nunca "enviado" sem confirmação.

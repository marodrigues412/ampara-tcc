import pandas as pd

print("Carregando CSV...")

df = pd.read_csv(
    "ssp.csv",
    sep=";",
    encoding="utf-8",
    low_memory=False
)

print("CSV carregado!")

# =========================
# FILTRAR RMSP
# =========================

cidades_rmsp = [
    "S.PAULO",
    "S.CAETANO DO SUL",
    "S.BERNARDO DO CAMPO",
    "SANTO ANDRE",
    "DIADEMA",
    "MAUA",
    "OSASCO",
    "GUARULHOS",
    "BARUERI"
]

df = df[df["NOME_MUNICIPIO"].isin(cidades_rmsp)]

print("Após filtro RMSP:", len(df))

# =========================
# REMOVER SEM COORDENADAS
# =========================

df = df.dropna(subset=["LATITUDE", "LONGITUDE"])

# =========================
# CONVERTER LAT/LONG
# =========================

df["LATITUDE"] = (
    df["LATITUDE"]
    .astype(str)
    .str.replace(",", ".", regex=False)
)

df["LONGITUDE"] = (
    df["LONGITUDE"]
    .astype(str)
    .str.replace(",", ".", regex=False)
)

df["LATITUDE"] = pd.to_numeric(
    df["LATITUDE"],
    errors="coerce"
)

df["LONGITUDE"] = pd.to_numeric(
    df["LONGITUDE"],
    errors="coerce"
)

# =========================
# REMOVER INVÁLIDOS
# =========================

df = df.dropna(subset=["LATITUDE", "LONGITUDE"])

df = df[
    (df["LATITUDE"] != 0) &
    (df["LONGITUDE"] != 0)
]

print("Após limpar coordenadas:", len(df))

# =========================
# REMOVER REGISTROS PROTEGIDOS
# =========================

df = df[
    ~df["LOGRADOURO"]
    .astype(str)
    .str.contains(
        "VEDAÇÃO DA DIVULGAÇÃO",
        case=False,
        na=False
    )
]

print("Após remover registros protegidos:", len(df))

# =========================
# SELECIONAR COLUNAS
# =========================

df_final = df[[
    "DATA_OCORRENCIA_BO",
    "HORA_OCORRENCIA_BO",

    "DESC_PERIODO",
    "DESCR_TIPOLOCAL",
    "DESCR_SUBTIPOLOCAL",

    "NOME_DEPARTAMENTO",
    "NOME_SECCIONAL",
    "NOME_DELEGACIA",

    "NOME_MUNICIPIO",
    "BAIRRO",
    "LOGRADOURO",
    "NUMERO_LOGRADOURO",

    "LATITUDE",
    "LONGITUDE",

    "RUBRICA",
    "DESCR_CONDUTA",
    "NATUREZA_APURADA",

    "ANO_BO",
    "MES_ESTATISTICA",
    "ANO_ESTATISTICA"
]]

# =========================
# RENOMEAR
# =========================

df_final.columns = [
    "data_ocorrencia",
    "hora_ocorrencia",

    "periodo",
    "tipo_local",
    "subtipo_local",

    "departamento",
    "seccional",
    "delegacia",

    "cidade",
    "bairro",
    "logradouro",
    "numero_logradouro",

    "latitude",
    "longitude",

    "rubrica",
    "conduta",
    "natureza_apurada",

    "ano_bo",
    "mes_estatistica",
    "ano_estatistica"
]

# =========================
# AJUSTAR DATAS
# =========================

df_final["data_ocorrencia"] = pd.to_datetime(
    df_final["data_ocorrencia"],
    format="%d/%m/%Y",
    errors="coerce"
)

df_final["data_ocorrencia"] = (
    df_final["data_ocorrencia"]
    .dt.strftime("%Y-%m-%d")
)

# =========================
# EXPORTAR CSV
# =========================

df_final.to_csv(
    "ssp_filtrado.csv",
    index=False,
    encoding="utf-8"
)

print("CSV filtrado criado com sucesso 🚀")
print("Total final:", len(df_final))

print("\nAMOSTRA FINAL:")

print(
    df_final[[
        "cidade",
        "bairro",
        "latitude",
        "longitude"
    ]].head()
)
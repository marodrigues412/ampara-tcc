# Ampara ML: privacy and data readiness

This note records the first implementation gate for the model work. It is a
technical research checklist, not a legal opinion or a claim of LGPD compliance.

## Current findings

- The checked-in `data-processing/ssp.csv` snapshot has 279,994 rows for
  statistical months January to March 2026. The repo also has an SSP downloader
  and incremental Supabase importer that fetch yearly files and track imported
  months. The checked-in snapshot is therefore not evidence that the full
  available/API dataset stops in March.
- The user-provided `public.ssp_imported_months` results confirm monthly imports
  from January 2022 through July 2026. A targeted backfill added Santo André
  (`S.ANDRE`) without replacing existing months. The post-backfill audit
  confirms all 55 months in each of the nine selected municipalities and
  2,177,992 records total, including 87,011 from Santo André. This is a selected
  nine-municipality subset, not all 39 municipalities of the RMSP. August 2026
  is not present in the supplied results.
- May 2022 has only 3,482 logged rows, much lower than adjacent months; treat it
  as a data-quality item to investigate, not a valid low-crime signal.
- The Supabase monthly audit reports no missing/zero coordinates in the imported
  table. This is a selection effect: `importar_ssp_supabase.py` drops rows with
  missing or zero latitude/longitude before insertion. Do not infer that the raw
  SSP source has complete geocoding or use this imported table to estimate the
  share of all SSP incidents that can be mapped.
- The pre-backfill audit reports substantial missing `periodo` values for most
  months, with unusually low missingness in January 2026. Preserve unknown periods explicitly
  and investigate this month-to-month discontinuity before using time-of-day in
  contextual features. Zero counts and sharp changes in some category filters
  also need label-level review; they are not evidence that no such incidents
  occurred.
- The supplied pre-backfill label audit confirms period values vary in
  capitalization and accent formatting. Normalize only to the broad SSP periods (madrugada, manhã,
  tarde, noite); keep missing values and "em hora incerta" as distinct unknowns.
  January 2026 had just 124 missing-period rows in the prior monthly summary,
  unlike roughly 23k–30k in neighboring months. Recalculate this audit against
  the current nine-municipality dataset before using temporal distributions.
- The broad candidate-label query can produce false positives when `rubrica`
  and `natureza_apurada` disagree (for example, a robbery rubric paired with a
  nature label for theft). Do not use either-field substring matches as final
  incident labels. Review field disagreements and define a documented mapping
  based on the source taxonomy and the study's stated scope. The current label output did not establish validated
  occurrence counts for rape or threat; zero matches are not proof of zero cases.
- The crime taxonomy also includes occurrence types that may not represent
  intentional violence relevant to the Ampara risk question, such as traffic
  incidents. Review them separately: retain directly relevant violence,
  consider other contextual hazards as a distinct layer, and exclude out-of-scope
  types from the violence signal. The traffic keyword flag in
  `data/ssp_crime_taxonomy_audit.sql` is only a review aid, not a final label.
- The annual audit found `tipo_local` absent in all 2022–2024 rows and present
  from 2025 onward. Source-workbook headers confirm `DESCR_TIPOLOCAL` is missing
  from 2022–2024 SSP files and first appears in 2025. The historical gap is
  therefore structural in the source, not an importer failure. A zero count for
  robbery on public roads in those years is not evidence of no robberies.
  `DESCR_SUBTIPOLOCAL` exists in the older workbooks, but must be assessed as a
  separate field rather than assumed equivalent to place type.
- `subtipo_local` contains “Via Pública” in every year. The exploratory
  robbery-keyword query returned approximately 154k such candidate records in
  2022, 153k in 2023, 130k in 2024, 110k in 2025, and 59k in partial 2026.
  Because it used a match in either `rubrica` or `natureza_apurada`, these are
  not validated robbery totals. Compare agreement and disagreements between
  the two source fields before adopting a historical public-place indicator.
- Within public-place subtypes, both fields had a robbery keyword in 153,947
  records in 2022, 152,509 in 2023, 129,924 in 2024, 109,243 in 2025, and
  59,225 in partial 2026. Among records flagged by either field, annual field
  agreement is approximately 99.7%–100%; this checks label consistency, not
  whether all robbery subtypes belong in the study's safety signal.
- The label-pair audit identified concordant `ROUBO - OUTROS`, `ROUBO DE
  VEÍCULO`, and `ROUBO DE CARGA` groups. `LATROCÍNIO` appears as the nature
  paired with a robbery rubric and should be treated as a separate category,
  not lost because the nature lacks the string "roubo". Rubric/nature conflicts
  (including theft, attempted homicide, and vehicle recovery labels) remain
  unresolved rather than being silently forced into a category. These are
  provisional taxonomy decisions only; no weights or score are applied.
- The public-place nature inventory includes high-volume theft, robbery, and
  intentional-injury groups as well as traffic-related injury/homicide and
  drug/firearm categories. Keep theft and drug/firearm labels separate from
  interpersonal violence; treat culpable traffic incidents as a separate road
  hazard layer; do not automatically include administrative drug seizures or
  possession labels in the violence signal. Verify the corresponding rubric
  pairs before finalizing the mapping.
- The supplied monthly completeness audit is a pre-backfill baseline for
  2,090,981 records from 2022 through July 2026 (eight municipalities). Its
  missingness totals must be recalculated for the current 2,177,992-record,
  nine-municipality dataset. In that baseline, 1,439,054 have an empty `periodo`
  but a parseable `hora_ocorrencia`; 44,755 have neither and must remain unknown, and
  23,002 are explicitly marked "em hora incerta" and must remain unknown even
  where another field happens to contain a time. The remaining 584,170 have a
  recognized period label. May 2022 remains a coverage outlier.
- In the pre-backfill January 2026 audit, 24,670 records with both fields present
  agreed exactly on boundaries 00–05 madrugada, 06–11 manhã, 12–17 tarde, and 18–23 noite. The
  exploratory resolver in `derive_ssp_period.py` preserves source labels and
  returns provenance (`informado`, `derivado_da_hora`, or an explicit unknown
  status); it does not update Supabase or feed the app score. Applying the same
  boundaries to older releases remains an explicit analytical assumption to
  document and test against the current dataset, not a validated ground truth.
- The file contains occurrence addresses and coordinates. The new offline risk
  layer must emit only aggregated municipality/neighborhood/time-period values;
  do not export street, house number, report number, or exact occurrence point.
- The current file has substantial missingness in `DESC_PERIODO`; unknown
  periods must remain unknown or be excluded with a reported count, never guessed.
- DDM is represented by the reporting station (`NOME_DELEGACIA`), not as a
  separate incident label. Keep it as a separate aggregate indicator unless a
  documented definition and rationale support including it in the score.
- The mobile app reads recent heart-rate values from the watch/Health Connect,
  but does not currently persist BPM history in Ampara's database. Raw watch
  readings are held locally for the live UI. Existing location history is a
  separate dataset and is not a substitute for the seven-window features.
- The phone acceleration hook still feeds only the existing rule-based score.
  A pure, non-persistent extractor for the seven-feature window is now in
  `mobile/services/sensorFeatureWindows.js`; it is not yet wired into app
  collection or the current score. It treats missing/stale inputs as `null`,
  needs 20 valid prior heart-rate samples within one hour before calculating the
  personal z-score, and uses a window-centered acceleration proxy that still
  needs validation against real device recordings.
- UCI-HAR has labeled smartphone movement windows, but does not include heart
  rate or GPS. It can support movement-feature prototyping, not training all
  seven features as if those missing measurements existed.
- An offline Isolation Forest training/evaluation entry point now exists at
  `data-processing/train_sensor_anomaly_model.py`. It requires the seven real
  features, a condition label, pseudonymous participant/session IDs, and
  exclusive window exposure duration. It
  splits by participant, fits only normal training windows, calibrates an
  anomaly threshold on separate normal participants, and evaluates on held-out
  participants. It does not persist a model unless an output path is explicitly
  requested. Synthetic records in its unit tests verify code behavior only;
  they are not evidence of model quality. After an approved research CSV
  exists, run it locally with
  `python3 data-processing/train_sensor_anomaly_model.py --input /caminho/local/features.csv`.
  The header-only schema is in `data-processing/sensor_feature_template.csv`;
  it contains no example or participant data.

Run `python3 data-processing/audit_ml_inputs.py` to regenerate aggregate SSP
coverage counts for the checked-in CSV snapshot. It does not query Supabase or
the SSP download endpoint, and does not write a report file or print row-level
locations. Run the read-only `data/ssp_ml_quality_audit.sql` in Supabase to
inspect monthly completeness and target-category counts directly from the
imported table. Run the local feature tests with
`cd mobile && node --test __tests__/sensorFeatureWindows.test.mjs`.

## Privacy-first implementation gates

1. Keep raw BPM and raw accelerometer samples on-device by default. Calculate
   rolling features locally and discard source samples after the window is
   complete unless a separately approved study protocol requires otherwise.
2. Do not upload precise GPS to the ML pipeline. Derive speed locally; resolve
   contextual risk from an aggregated neighborhood/time-period table.
3. Before any research collection or server persistence of health-derived
   features, define the specific purpose, appropriate legal basis, clear
   participant notice, opt-in/withdrawal flow, retention period, deletion path,
   access controls, and a research/ethics review with the advisor. Consent is
   not assumed merely because the app requests a sensor permission.
4. If feature rows are needed for evaluation, use pseudonymous identifiers,
   separate identity mapping from measurements, per-user row-level access
   policies, minimal timestamps, encryption, and an explicit retention/deletion
   process. Do not train or debug from production users' health data by default.
5. Keep missing sensors explicit. On iPhone or without a watch, do not invent
   BPM values or silently fill missing features with population averages; use a
   separately validated model/input path or report that this model is
   unavailable.
6. Treat anomaly as “outside the observed routine,” not as an assault
   probability. Validate false alerts and misses in controlled, consented
   scenarios before connecting model output to emergency actions.

## Method decisions still open

- Document the SSP release and coverage period, exact crime-category mapping,
  handling of missing neighborhoods/time periods, DDM indicator, and severity
  weights. The example weights in the professor's note do not specify a weight
  for every target category; any adopted mapping and weights must be described
  as study choices and evaluated, not presented as validated facts.
- Review every frequent source crime type against the study's risk definition;
  do not let traffic incidents or unrelated administrative labels silently
  contribute to a violent-crime signal.
- The professor's map description names period and weekday, while the proposed
  aggregation step names neighborhood by period. Decide whether weekday is a
  required grouping dimension and ensure there is enough data per cell.
- Define the window duration `X`, feature units, personal heart-rate baseline
  warm-up, and behavior when the user lacks a watch or has gaps in measurements.
- UCI-HAR cannot supply the heart-rate z-score or GPS speed/delta features. Keep
  training and evaluation claims limited to the features actually present.
- Define the score calibration and thresholds before fusing layers. In
  scikit-learn, `contamination="auto"` does not estimate real-world anomaly
  prevalence, and native Isolation Forest outputs are not directly the
  professor's proposed 0–1 risk scale.
- Create a labeled, controlled validation set for evaluation only; report
  precision/recall/F1 and false alerts per monitoring hour, with subject/session
  separation to avoid leakage.
- Do not run the sensor trainer with production app data. Before the first
  real training run, define and approve the study protocol, recruit consenting
  participants, collect ordinary and controlled test scenarios, and verify
  participant IDs are pseudonymous. The input columns are the seven feature
  names in `sensorFeatureWindows.js`, plus `participante_id`, `sessao_id`,
  `condicao` (`normal` or `anomalia_controlada`), and `exposicao_segundos`.
  Incomplete feature windows are excluded rather than imputed. The output anomaly score is not a probability,
  an assault prediction, or a value ready for the context/body fusion matrix.
- The trainer reports normal windows flagged per monitored hour, not alert
  episodes. Defining when adjacent flagged windows form one alert requires a
  temporal aggregation rule and should be validated separately. Exposure
  seconds must represent exclusive, non-overlapping monitored time.

# Piloto móvel do Guardião

Contrato preparado para o aplicativo Android atuar como fonte própria de GPS durante o piloto. Todas as sessões são obrigatoriamente criadas em modo sombra: o servidor analisa e registra, mas não envia comandos ao motorista nem altera a rota.

## Autenticação

Use o token JWT do motorista no cabeçalho `Authorization: Bearer <token>`.

## 1. Iniciar sessão

`POST /piloto-mobile/sessoes/iniciar`

```json
{
  "composicao": {
    "tipo": "cegonha carregada",
    "carga": "8 veículos",
    "altura": 4.7,
    "largura": 2.6,
    "comprimento": 22.4,
    "peso": 32.5,
    "eixos": 6
  },
  "dispositivo": {
    "plataforma": "android",
    "versao_app": "1.0.0",
    "modelo": "SM-A155M",
    "id_instalacao": "uuid-gerado-na-instalacao"
  },
  "gps_ativo": true
}
```

O servidor identifica motorista, placa, empresa e viagem ativa. Uma sessão anterior do mesmo motorista é marcada como interrompida. Guarde o `id` retornado como `sessao_piloto_id`.

## 2. Enviar posição

`POST /localizacao`

```json
{
  "lat": -19.391,
  "lon": -40.064,
  "velocidade_kmh": 72.4,
  "direcao_graus": 185,
  "precisao_m": 6,
  "altitude_m": 32,
  "timestamp_dispositivo": "2026-09-10T14:30:00.000Z",
  "origem_coleta": "piloto_mobile",
  "sessao_piloto_id": 123,
  "sequencia": 145,
  "bateria_percentual": 78,
  "carregando": true,
  "tipo_rede": "4g",
  "gps_ativo": true,
  "app_segundo_plano": true
}
```

`sequencia` deve crescer a cada leitura. Repetições e posições atrasadas são aceitas sem erro, mas ignoradas e retornam `duplicada: true`. Quando não houver internet, o Android deve persistir os pontos e reenviá-los na ordem original.

No piloto móvel, `sequencia`, `timestamp_dispositivo` e `precisao_m` são obrigatórios. Uma posição com mais de 120 segundos, precisão pior que 100 metros ou marcada como `offline_sync` continua sendo preservada no histórico, mas não participa de uma decisão em tempo real. Consulte `qualidade_telemetria` na resposta.

Quando existe uma viagem ativa com geometria, o Guardião encaixa a posição nessa rota e avalia somente o corredor adiante (`metodo_analise: "corredor_rota"`). Sem uma rota conhecida, permanece em modo sombra com o radar por direção (`metodo_analise: "radar_direcional"`). Nenhum dos métodos confirma automaticamente uma restrição.

Com `ORS_API_KEY` configurada, o servidor utiliza até oito posições recentes do GPS para estimar um corredor sobre a malha rodoviária, mesmo sem rota prévia (`metodo_analise: "corredor_historico_estimado"`). Essa primeira consulta é neutra: as dimensões do caminhão são aplicadas somente depois, na análise das restrições. A resposta informa a quantidade de amostras e a confiança do corredor. O resultado é reutilizado por até 90 segundos; se o serviço ou a cota estiverem indisponíveis, o sistema volta imediatamente ao radar direcional. Esse corredor reduz ambiguidades, mas não deve ser apresentado como rota confirmada.

Alertas são persistidos em `notificacoes_outbox` antes da entrega. Configure `ALERT_WEBHOOK_URL` e/ou `ALERT_EMAIL_TO`; falhas são tentadas novamente com espera progressiva. O painel sempre permanece como canal local.

## 3. Heartbeat sem nova posição

`POST /piloto-mobile/sessoes/:id/heartbeat`

```json
{
  "bateria_percentual": 76,
  "carregando": false,
  "tipo_rede": "sem_internet",
  "gps_ativo": true,
  "app_segundo_plano": true
}
```

Use apenas quando o aparelho estiver parado e não houver uma posição nova para enviar.

## 4. Recuperar sessão ativa

`GET /piloto-mobile/sessoes/ativa`

Permite que o Android retome uma sessão depois de reiniciar o processo.

## 5. Encerrar sessão

`POST /piloto-mobile/sessoes/:id/encerrar`

```json
{ "motivo": "viagem_finalizada" }
```

## 6. Supervisão administrativa

`GET /piloto-mobile/sessoes?limite=100`

Estados calculados pela central:

- `online`: comunicação nos últimos 45 segundos;
- `instavel`: sem comunicação entre 45 segundos e 3 minutos;
- `sem_sinal`: mais de 3 minutos sem comunicação;
- `gps_desligado`: aparelho informou GPS desativado;
- `encerrada` ou `interrompida`: sessão não está mais ativa.

## Regras do piloto

- Sempre `modo_sombra=true`.
- Nenhum alerta é confirmado automaticamente.
- O motorista não precisa receber alertas nesta fase.
- A composição informada na sessão prevalece na análise radar livre.
- A placa é obtida do vínculo autenticado do motorista, não do corpo da requisição.
- O painel registra bateria, rede, GPS, segundo plano, posições, análises e riscos observados.

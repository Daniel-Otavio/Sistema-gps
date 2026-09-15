# Privacidade e retenção

O sistema guarda posições, payloads de GPS, análises, alertas, notificações,
logs técnicos e histórico de alterações para permitir rastreabilidade
operacional. A empresa deve informar essa coleta aos usuários e definir uma
base legal adequada antes do uso em produção.

## Prazos padrão

- Posições GPS brutas: 180 dias.
- Payload original enviado pelo dispositivo: 30 dias.
- Logs técnicos: 90 dias.
- Requisições das integrações: 90 dias.
- Alertas encerrados: 365 dias.

Os prazos podem ser configurados por empresa. Depois do prazo do payload, o
conteúdo original é minimizado e substituído por um marcador de retenção. A
rotina diária também remove sessões expiradas, entregas antigas e contadores
de limite vencidos.

## Direitos e atendimento

O portal empresarial permite abrir solicitações de exportação, anonimização ou
exclusão. O administrador geral analisa a solicitação e registra o estado
pendente, em processamento, concluído ou rejeitado. Exclusões não devem ser
executadas automaticamente: obrigações legais, segurança e necessidade de
preservação de evidências precisam ser avaliadas por uma pessoa responsável.

## Produção

- Limitar o acesso aos dados pelo perfil e pela empresa vinculada.
- Evitar dados pessoais desnecessários nos campos livres e payloads.
- Não registrar chaves, senhas ou tokens em logs.
- Manter backup, restauração, aviso de privacidade e processo de incidente.
- Revisar os prazos com apoio jurídico antes de contratar clientes.

Este documento descreve o comportamento técnico e não substitui orientação
jurídica sobre LGPD.

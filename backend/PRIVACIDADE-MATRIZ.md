# Matriz operacional de privacidade

Esta matriz deve ser aplicada pelo executor de solicitações e revisada com assessoria jurídica antes da operação comercial.

| Dado | Exportação | Anonimização | Exclusão | Justificativa quando preservado |
|---|---|---|---|---|
| Cadastro de usuário/motorista | Incluído | Nome, login, e-mail e credencial substituídos | Anonimizado | Integridade de viagens e auditoria |
| Cadastro do veículo | Incluído | Placa, frota e modelo substituídos | Anonimizado | Integridade referencial e registros legais |
| GPS bruto e localização atual | Incluído até o limite informado | Não aplicável | Excluído | Nenhuma após deferimento válido |
| Trajeto processado | Incluído | Geometria removida | Geometria removida | Métricas anônimas podem ser preservadas |
| Alertas e reportes | Incluído | Identificadores pessoais minimizados | Excluídos quando ligados diretamente ao titular | Evidência operacional somente quando exigida |
| Viagens | Incluído | Carga pessoal removida | Registro operacional preservado e minimizado | Obrigações contratuais, fiscais e segurança |
| Logs de integração | Resumo seguro | Placa e payload removidos | Minimizado | Segurança, prevenção a fraude e diagnóstico |
| Auditoria administrativa | Não contém payload bruto | Preservada | Preservada | Responsabilização e comprovação das operações |

Toda execução deve registrar a quantidade tratada, os dados preservados, a justificativa e o responsável. Uma solicitação sem titular ou sem registros afetados não pode ser concluída.

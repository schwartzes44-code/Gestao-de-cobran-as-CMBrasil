GESTÃO DE COBRANÇAS CMBRASIL v1.0 ALPHA 2

Objetivo desta versão:
- Base central Supabase como fonte de dados para Gestor e Agentes.
- Gestor importa PDF e os clientes/parcelas são gravados no Supabase.
- Agentes visualizam automaticamente somente as carteiras liberadas pelo RLS.
- Observações e agendamentos já são gravados na tabela central cobrancas.
- Exclusão de observação central preservada conforme permissões.
- Importar PDF fica visível somente para Gestor.
- Dados financeiros do PDF são atualizados sem apagar o histórico de cobranças.

Fluxo de teste recomendado:
1. Entrar como Gestor.
2. Importar o PDF da XAMA3.
3. Conferir totais e alguns clientes/parcelas.
4. Sair e entrar como Agente Treinador.
5. Confirmar que XAMA3 aparece com os mesmos clientes.
6. Registrar uma observação/agendamento no agente.
7. Entrar novamente como Gestor e verificar o histórico central.

Observação:
- A função "Marcar como pago" está temporariamente desabilitada na base central nesta Alpha 2.

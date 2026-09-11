GESTÃO DE COBRANÇAS CMBRASIL — v1.0 Alpha 3

Objetivo desta Alpha:
- forçar carregamento de arquivos novos com nomes exclusivos, evitando mistura da v0.6/Alpha 2;
- gravar PDF do Gestor diretamente no Supabase;
- validar a quantidade de clientes efetivamente gravada antes de informar sucesso;
- carregar clientes da base central para Gestor e Agente;
- ocultar Importar PDF para perfil Agente;
- limpar mensagens locais ao trocar de usuário.

Teste recomendado:
1. Substitua TODOS os arquivos da raiz do GitHub pelos deste pacote.
2. Confirme no topo: v1.0 Alpha 3 e “Base central conectada • Alpha 3”.
3. Entre como Gestor e importe o PDF XAMA3 UMA VEZ.
4. A mensagem correta deve começar com “Base central confirmada”.
5. Confira public.clientes no Supabase.
6. Saia e entre como Agente Treinador. Ele deve receber XAMA3 da base central.

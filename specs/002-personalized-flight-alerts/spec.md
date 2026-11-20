# Feature Specification: Personalized Flight Alerts

**Feature Branch**: `002-personalized-flight-alerts`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "Contruiremos um backend sólido tendo como base as informações dos sites que você mesmo já encontrou. Frontend limpo,fluido e moderno que permite organizar por conmpanhia aéreas,aeroportos e tipos de avisos. Salvar essas preferencias para quando logar novamente. Observar o plano de negócio principal - Arremetidas,órbitas e alternados - que acontecem normalmente devido mal tempo, o que faz a aeronave mudar seu plano de voo, ou no caso da arremetida, aumentar sua velocidade e altitude após aproximação para pouso"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizar eventos por filtros (Priority: P1)

Como observador, quero filtrar eventos por companhia aérea, aeroporto e tipo de aviso, para encontrar rapidamente as atividades que me interessam.

**Why this priority**: A organização por esses três critérios é o principal valor solicitado para a experiência.

**Independent Test**: Com eventos de teste de diferentes companhias, aeroportos e categorias, selecionar combinações de filtros e verificar a lista resultante e os estados sem resultados ou sem dados suficientes.

**Acceptance Scenarios**:

1. **Given** que existem eventos com companhia, aeroporto e categoria identificados, **When** seleciono valores em um ou mais filtros, **Then** vejo somente eventos que correspondem a pelo menos um valor selecionado em cada filtro ativo.
2. **Given** que não seleciono valores para um dos filtros, **When** aplico os demais filtros, **Then** esse critério não restringe os resultados.
3. **Given** que não há eventos para a combinação selecionada, **When** aplico os filtros, **Then** vejo um estado vazio claro e posso alterar ou limpar os filtros.
4. **Given** que a companhia de um evento não pôde ser identificada, **When** filtro por companhia, **Then** posso distinguir esse evento como companhia desconhecida, sem atribuir uma companhia por suposição.
5. **Given** que uma seleção está sendo aplicada, **When** aguardo os resultados, **Then** vejo um estado de carregamento e não confundo resultados anteriores com os da seleção atual.

---

### User Story 2 - Recuperar preferências ao entrar (Priority: P1)

Como usuário com conta, quero que meus filtros e categorias de interesse permaneçam associados à minha conta, para recuperá-los quando entrar novamente, inclusive em outro dispositivo compatível.

**Why this priority**: Preferências que desaparecem ao fechar o app ou trocar de dispositivo não atendem ao pedido de continuidade.

**Independent Test**: Entrar em uma conta, alterar e salvar os filtros, sair, entrar novamente em outra sessão ou dispositivo e verificar que as mesmas escolhas foram restauradas.

**Acceptance Scenarios**:

1. **Given** que entrei em uma conta e alterei filtros, **When** as alterações forem salvas, **Then** o app confirma o salvamento e associa as preferências à minha conta.
2. **Given** que as preferências da conta já foram salvas, **When** entro novamente em um navegador ou dispositivo Android compatível, **Then** encontro os filtros e categorias salvos.
3. **Given** que a conexão está indisponível durante uma alteração, **When** tento salvar, **Then** o app informa que a alteração ainda não foi sincronizada e não a apresenta como salva.
4. **Given** que uma pessoa sai da conta e outra entra no mesmo dispositivo, **When** a segunda pessoa abre os filtros, **Then** não vê as preferências privadas da conta anterior.
5. **Given** que saio da conta em um dispositivo, **When** a sessão é encerrada, **Then** esse dispositivo deixa de receber avisos associados à conta, sem apagar as preferências salvas na conta.
6. **Given** que inicio sessão com Google na web ou no Android, **When** a identidade é validada, **Then** o sistema associa a conta ao identificador estável da Conta Google e rejeita credenciais inválidas.

---

### User Story 3 - Receber avisos relevantes (Priority: P2)

Como observador, quero receber avisos apenas dos eventos que correspondem às minhas escolhas, para acompanhar arremetidas, órbitas/esperas e alternâncias sem receber notificações irrelevantes.

**Why this priority**: Avisos personalizados complementam a consulta filtrada, mas dependem de dados suficientes, permissões e suporte à notificação na plataforma.

**Independent Test**: Salvar filtros, autorizar notificações em um dispositivo compatível e processar eventos de teste correspondentes e não correspondentes; verificar entrega, conteúdo, ausência de duplicatas e estado de permissão.

**Acceptance Scenarios**:

1. **Given** que habilitei avisos, autorizei notificações e selecionei ao menos um aeroporto e uma categoria, **When** um evento corresponde aos filtros ativos, **Then** recebo um aviso com a classificação, o aeroporto, o horário, a fonte disponível e a indicação de que a classificação pode ser inferida.
2. **Given** que um evento não corresponde a um filtro ativo ou não há dados suficientes para classificá-lo, **When** o sistema avalia o evento, **Then** não recebo um aviso que o apresente como correspondência confirmada.
3. **Given** que desabilitei avisos ou revoguei a permissão de notificações, **When** ocorre um evento correspondente, **Then** não recebo uma notificação e consigo ver que os avisos estão desabilitados ou sem permissão.
4. **Given** que um aviso foi entregue, **When** abro esse aviso, **Then** vejo os detalhes do evento e as fontes e horários disponíveis para conferência.
5. **Given** que vejo um evento e informações meteorológicas sem uma fonte que estabeleça relação causal, **When** consulto os detalhes, **Then** o clima aparece apenas como contexto e o produto não afirma que causou a manobra nem oferece orientação operacional.
6. **Given** que uma fonte está indisponível, atrasada ou não permite determinado uso, **When** consulto os eventos, **Then** o app indica a limitação e não apresenta os dados como atuais nem como utilizáveis.
7. **Given** que um evento já gerou um aviso e depois é atualizado, **When** o sistema processa a atualização, **Then** não recebo uma duplicata apresentada como um novo evento.
8. **Given** que não selecionei aeroporto ou categoria de evento, **When** tento habilitar avisos, **Then** o app explica quais escolhas são necessárias e não ativa notificações para todos os aeroportos implicitamente.

### Edge Cases

- Um evento pode não conter informação confiável de companhia; não inferir nem inventar a companhia.
- Um evento pode estar relacionado a mais de um aeroporto ou não ter aeroporto claramente associado; mostrar a informação disponível e evitar uma correspondência silenciosa.
- Dados atrasados, ausentes ou incompletos não devem ser apresentados como atuais nem como confirmação de uma manobra.
- Uma arremetida, órbita/espera ou alternância não prova por si só que o clima foi sua causa; condições meteorológicas são contexto, não atribuição causal.
- Fontes podem limitar cobertura, frequência de consulta, retenção ou redistribuição; respeitar seus termos e informar indisponibilidade quando afetar os resultados.
- Duas sessões podem alterar as preferências da mesma conta; alterações ainda não sincronizadas devem ser identificadas e não podem substituir silenciosamente uma versão salva.
- Permissões de notificação podem variar por dispositivo ou navegador; a preferência de interesse pode ser da conta, mas a autorização para entrega deve refletir o estado do dispositivo.
- Eventos repetidos ou atualizados não devem gerar avisos duplicados apresentados como novos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário autenticado MUST poder filtrar a atividade por companhia aérea, aeroporto e categoria de aviso.
- **FR-002**: O sistema MUST combinar filtros ativos por critérios distintos, e MUST incluir resultados correspondentes a qualquer valor selecionado dentro de um mesmo critério.
- **FR-003**: O usuário MUST poder limpar filtros individualmente ou todos de uma vez e MUST receber um estado vazio compreensível quando não houver correspondências.
- **FR-004**: O sistema MUST permitir as categorias arremetida, órbita/espera e alternância, identificando cada uma como observada ou inferida conforme a evidência disponível.
- **FR-005**: O sistema MUST indicar companhia, aeroporto, horário, fonte e confiança quando esses dados estiverem disponíveis, e MUST indicar explicitamente quando informações relevantes forem desconhecidas ou insuficientes.
- **FR-006**: O sistema MUST salvar as preferências de filtros e categorias na conta do usuário e restaurá-las quando a mesma conta entrar novamente em uma sessão web ou Android compatível.
- **FR-007**: O sistema MUST indicar se uma alteração de preferência foi salva, está pendente de sincronização ou falhou ao salvar; não MUST apresentar uma alteração não confirmada como persistida.
- **FR-008**: O sistema MUST impedir que uma conta leia ou altere preferências pertencentes a outra conta.
- **FR-009**: Os avisos MUST iniciar desabilitados; o usuário MUST poder habilitá-los somente após consentir, selecionar ao menos um aeroporto e uma categoria, e MUST poder desabilitá-los; notificações MUST respeitar também a autorização concedida para cada dispositivo ou navegador.
- **FR-010**: O sistema MUST enviar avisos somente para eventos que correspondam às preferências aplicáveis e MUST evitar que o mesmo evento seja apresentado repetidamente como um novo aviso.
- **FR-011**: Cada aviso MUST identificar a categoria e o aeroporto, incluir horário e fonte quando disponíveis e deixar claro quando a classificação for inferida.
- **FR-012**: O sistema MUST apresentar condições meteorológicas como contexto, sem afirmar que causaram uma arremetida, órbita/espera ou alternância, salvo quando uma fonte explícita sustentar essa relação.
- **FR-013**: O sistema MUST tratar dados públicos e metadados de fonte de acordo com sua cobertura, limites e termos de uso, sem apresentar dado atrasado como atual.
- **FR-014**: A interface MUST permitir localizar, aplicar e limpar os filtros sem perder a indicação da companhia, aeroporto e categoria selecionados, e MUST comunicar estados de carregamento, vazio, indisponibilidade e sincronização.
- **FR-015**: O produto MUST permanecer informativo e MUST NOT orientar decisões de operação, controle de tráfego, despacho ou segurança de voo.
- **FR-016**: Ao encerrar a sessão de uma conta, o sistema MUST desassociar ou desabilitar a entrega de avisos dessa conta no dispositivo atual, sem apagar as preferências da conta.
- **FR-017**: O sistema MUST oferecer autenticação com Google na web e no Android, verificar a identidade no backend e associar a conta ao identificador estável do Google, nunca ao e-mail; MUST rejeitar credenciais inválidas.

### Key Entities *(include if feature involves data)*

- **Conta de usuário**: Identidade autenticada à qual as preferências são associadas.
- **Preferências de atividade**: Companhias, aeroportos e categorias selecionados pelo usuário, além do estado de avisos desejado.
- **Autorização de notificação**: Estado de permissão para entrega de avisos em um dispositivo ou navegador específico.
- **Evento de atividade aérea**: Categoria, aeronave quando identificável, companhia e aeroporto quando disponíveis, horário, estado de atualização, fontes e confiança da classificação.
- **Fonte de dados**: Origem, cobertura, horário da informação e limitações relevantes para apresentação e uso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em testes com combinações representativas de companhias, aeroportos e categorias, 100% dos resultados exibidos correspondem às seleções ativas segundo as regras de combinação definidas.
- **SC-002**: Pelo menos 90% dos participantes de teste conseguem localizar um evento usando os três filtros em até 30 segundos, sem ajuda.
- **SC-003**: Em 100% dos testes de retomada de sessão, preferências confirmadas são restauradas na conta correta; alterações não sincronizadas são identificadas como pendentes ou falhas.
- **SC-004**: Em testes controlados, 100% dos avisos enviados correspondem às preferências ativas e incluem a indicação de evento inferido e os dados de horário e fonte disponíveis.
- **SC-005**: Pelo menos 95% das interações de aplicar ou limpar filtros apresentam o novo estado em até 1 segundo quando os dados necessários já estão carregados.
- **SC-006**: Em testes de compreensão, pelo menos 90% dos participantes identificam que dados de clima são contexto e não prova da causa de uma manobra.

## Assumptions

- Esta funcionalidade complementa o Flight Activity Monitor definido em `specs/001-flight-activity-monitor/spec.md`; ela não substitui o mapa, a ingestão de atividade aérea ou os detalhes meteorológicos desse escopo.
- A autenticação inicial de contas será feita com Google na web e no Android. A conta será identificada pelo `sub` validado; credenciais e recuperação da Conta Google permanecem sob responsabilidade do Google.
- Os filtros e categorias escolhidos ficam associados à conta; a autorização para receber notificações continua específica a cada dispositivo ou navegador.
- Avisos começam desabilitados e exigem ao menos um aeroporto e uma categoria escolhidos; não selecionar companhias significa aceitar eventos de qualquer companhia nos aeroportos selecionados.
- A primeira versão oferece web e Android. Outros sistemas móveis ficam fora do escopo inicial.
- As fontes de atividade e meteorologia serão públicas ou contratadas, e sua cobertura, licença, limites de consulta, retenção e redistribuição serão validados antes do uso. A existência de um site ou API pública não será tratada como autorização da companhia aérea.
- Arremetidas, órbitas/esperas e alternâncias podem ser classificações inferidas a partir de dados incompletos; a aplicação não garante sua detecção nem atribui automaticamente uma causa meteorológica.
- O objetivo de uma interface limpa e fluida será validado por tarefas observáveis de filtro, leitura de estado e recuperação de preferências, sem presumir uma solução visual específica.

# Feature Specification: Flight Activity Monitor

**Feature Branch**: `001-flight-activity-monitor`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: Aplicativo informativo para acompanhar atividade aérea em aeroportos escolhidos, inicialmente SBBR, com mapa ao vivo, alertas de eventos inferidos, METAR e áudio público quando disponível.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acompanhar aeronaves em um aeroporto (Priority: P1)

Como observador, quero escolher um aeroporto e ver aeronaves próximas em um mapa atualizado, para acompanhar a atividade aérea em um só lugar.

**Why this priority**: O mapa ao vivo é a experiência central e fornece contexto para os demais recursos.

**Independent Test**: Selecionar SBBR e verificar aeronaves, estado de carregamento, fonte e horário da última atualização; repetir sem conexão para confirmar a indicação de dados desatualizados.

**Acceptance Scenarios**:

1. **Given** que o serviço de dados está disponível, **When** seleciono um aeroporto, **Then** o mapa mostra aeronaves recebidas para sua área e indica a atualização mais recente.
2. **Given** que não há dados novos ou a conexão falha, **When** consulto o mapa, **Then** o app informa claramente que os dados estão indisponíveis ou desatualizados e não os apresenta como atuais.
3. **Given** que o app está aberto em um dispositivo Android ou navegador compatível, **When** movo ou amplio o mapa, **Then** os controles permanecem responsivos e legíveis.

---

### User Story 2 - Receber alertas personalizados (Priority: P2)

Como observador, quero escolher aeroportos e tipos de evento para receber alertas, mesmo quando o app não estiver aberto, para acompanhar mudanças sem manter a tela ativa.

**Why this priority**: Alertas em segundo plano são a forma solicitada de acompanhar eventos oportunamente.

**Independent Test**: Configurar um aeroporto e categorias de alerta, simular eventos de teste e verificar que apenas os eventos selecionados geram notificações; confirmar também a abertura do detalhe correspondente.

**Acceptance Scenarios**:

1. **Given** que permiti notificações e configurei categorias e aeroportos, **When** um evento elegível é observado, **Then** recebo uma notificação com aeroporto, categoria, horário e indicação de que a classificação é inferida.
2. **Given** que desativei uma categoria ou revoguei a permissão de notificações, **When** ocorre um evento, **Then** não recebo alerta dessa categoria e consigo ver o estado da configuração.
3. **Given** que um alerta foi entregue, **When** o abro, **Then** o app apresenta o evento com fonte, horário e dados disponíveis para conferência.

---

### User Story 3 - Consultar condições meteorológicas e áudio disponível (Priority: P3)

Como observador, quero consultar METAR, previsão meteorológica disponível e ouvir uma transmissão pública quando houver uma fonte autorizada, para entender o contexto do aeroporto observado.

**Why this priority**: Meteorologia e áudio complementam a observação, mas dependem de cobertura e disponibilidade de fontes externas.

**Independent Test**: Carregar METAR e previsão com horários e fontes distintos e, separadamente, testar feed de áudio disponível, indisponível e interrompido.

**Acceptance Scenarios**:

1. **Given** que há METAR ou previsão disponível para o aeroporto, **When** abro o painel meteorológico, **Then** vejo cada produto com horário, validade e fonte, sem confundir observação com previsão.
2. **Given** que existe um feed público autorizado para o aeroporto, **When** inicio a reprodução, **Then** o áudio é reproduzido e seu estado é indicado.
3. **Given** que não há feed autorizado ou o feed falha, **When** tento consultar áudio, **Then** o app informa que está indisponível e não simula nem substitui a transmissão.
4. **Given** que as condições indicam possível impacto meteorológico, **When** consulto o aeroporto, **Then** vejo um indicador informativo com fontes e limitações, sem afirmar que uma aeronave alternará por causa dessas condições.

### Edge Cases

- Dados ADS-B podem estar ausentes, atrasados, duplicados ou ter cobertura incompleta; mostrar idade e disponibilidade em vez de extrapolar uma posição atual.
- Um sinal de trajetória pode ser insuficiente para distinguir arremetida, órbita ou alternância; marcar como inferência de baixa confiança ou não emitir alerta.
- METAR pode estar ausente ou antigo; preservar o horário da observação e não rotulá-lo como atual.
- O aeroporto selecionado pode não ter feed ADS-B ou de áudio com cobertura autorizada; apresentar essa limitação sem falha geral do mapa.
- Permissões de push podem ser negadas, expiradas ou revogadas; manter a configuração visível e explicar que alertas não serão entregues.
- O provedor de push pode atrasar ou descartar uma notificação; mostrar o evento no histórico do app quando disponível e não prometer entrega instantânea.
- A alternância entre navegador e Android pode ocorrer sem conta; preferências locais não são presumidas como sincronizadas entre dispositivos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário MUST poder selecionar e pesquisar aeroportos para observar, incluindo SBBR como opção inicial.
- **FR-002**: O app MUST mostrar em um mapa as aeronaves reportadas na área do aeroporto selecionado, com os dados de posição recebidos e o horário da última atualização.
- **FR-003**: O app MUST identificar claramente estados de carregamento, indisponibilidade, dados antigos e cobertura limitada.
- **FR-004**: O app MUST apresentar arremetida, órbita/espera e alternância como eventos inferidos, exibindo fonte, horário e nível de confiança quando houver dados suficientes.
- **FR-005**: O app MUST permitir configurar aeroporto observado, categorias de evento e permissões de notificação.
- **FR-006**: Com consentimento do usuário e serviço de notificação disponível, o app MUST poder enviar push para eventos selecionados enquanto fechado, tanto no Android quanto em navegadores que ofereçam suporte a push.
- **FR-007**: O app MUST apresentar METAR e previsões aeronáuticas disponíveis com fonte e horário/validade, distinguindo observações de previsões.
- **FR-008**: O app MUST apresentar um indicador meteorológico contextual baseado em observações e previsões disponíveis e MUST NOT afirmar causalidade entre clima e comportamento de uma aeronave sem fonte explícita que sustente essa afirmação.
- **FR-009**: O app MUST oferecer áudio apenas quando houver uma transmissão pública cujo uso esteja autorizado para o produto; quando indisponível, MUST indicar essa condição.
- **FR-010**: O app MUST permitir visualizar os detalhes e a atualização de um evento alertado.
- **FR-011**: O app MUST identificar o produto como informativo e MUST NOT apresentar instruções de controle, recomendações operacionais, autorização de tráfego ou substituto para fontes oficiais.
- **FR-012**: O app MUST solicitar consentimento antes de ativar push ou reproduzir áudio e MUST permitir revogar essas permissões.
- **FR-013**: O app MUST operar em navegador web compatível e Android, mantendo fluxos principais equivalentes e informando limitações específicas da plataforma.

### Key Entities *(include if feature involves data)*

- **Aeroporto observado**: Identificador, nome, localização e seleção/favorito do usuário.
- **Relato de aeronave**: Identificador disponível, posição, movimento, origem e instante de observação.
- **Evento inferido**: Categoria, aeroporto relacionado, intervalo observado, confiança, fontes e estado de atualização.
- **Observação meteorológica**: Aeroporto/estação, valores reportados, horário e fonte do METAR.
- **Previsão meteorológica**: Aeroporto/estação, período de validade, conteúdo reportado e fonte da previsão.
- **Preferência de alerta**: Aeroportos e categorias escolhidos, estado de consentimento e destino de notificação associado ao dispositivo.
- **Feed de áudio**: Aeroporto, origem pública, autorização de uso, disponibilidade e estado de reprodução.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma rede funcional, 95% das atualizações recebidas de aeronaves aparecem no mapa em até 5 segundos após serem disponibilizadas pelo provedor.
- **SC-002**: Em teste com pelo menos 50 aeronaves e dispositivos de referência acordados, 95% das interações de mover e ampliar o mapa respondem em até 100 ms.
- **SC-003**: Pelo menos 90% dos participantes de teste conseguem selecionar um aeroporto e identificar se os dados estão atuais ou desatualizados em até 30 segundos, sem ajuda.
- **SC-004**: Em testes controlados, 100% dos alertas identificam claramente os eventos inferidos e incluem aeroporto, categoria, fonte e horário.
- **SC-005**: Em testes de notificação em plataformas suportadas e com permissão concedida, pelo menos 95% das notificações de teste chegam em até 60 segundos; atrasos e falhas são registrados como limitações, não como sucesso.
- **SC-006**: Para cada tela testada, indisponibilidade de fonte, previsão vencida ou dado antigo é comunicada em até 3 segundos após a condição ser detectada.

## Assumptions

- O público-alvo é de observadores e entusiastas; o produto não será usado para despacho, separação, controle ou decisões operacionais de aviação.
- A primeira versão oferece web e Android. Outros sistemas móveis ficam fora do escopo inicial.
- Fontes de ADS-B e meteorologia serão públicas ou contratadas, e sua cobertura, licença, limites de consulta e disponibilidade serão validados antes da integração.
- Eventos de arremetida, órbita e alternância são heurísticas baseadas em dados observados e podem estar incorretos; não há garantia de completude ou latência.
- A entrega de push em segundo plano requer um serviço remoto para acompanhar dados e destinos de notificação; o app local mantém dados úteis para consulta e tolerância à desconexão.
- Preferências podem permanecer por dispositivo na primeira versão; sincronização entre dispositivos não é garantida sem uma decisão explícita de conta/sincronização.
- A visualização de áudio é condicionada à confirmação de uma fonte e de termos que autorizem seu uso. Sem essa confirmação, o recurso não é ativado.
- O indicador meteorológico é informativo; não prediz decisão de piloto, companhia aérea ou controle de tráfego.
- Metas de desempenho são objetivos de validação a confirmar com os dispositivos, aeroportos, fornecedores e volume de dados de referência.

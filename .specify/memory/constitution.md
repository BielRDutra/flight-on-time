<!--
Sync Impact Report:
- Version change: 0.0.0 -> 1.0.0
- Modified principles: none (all placeholders replaced)
- Added sections: Core Principles, Additional Constraints, Development Workflow
- Removed sections: none
- Follow-up TODOs: TODO(RATIFICATION_DATE): confirmar a data oficial de adoção desta constituição
-->

# Flight On Time Constitution

## Core Principles

### I. Código claro e expressivo

O código deve revelar intenção por meio de nomes precisos, funções pequenas e estrutura previsível.
Abstrações, comentários e arquivos devem existir somente quando reduzirem a complexidade. Duplicação
de conhecimento deve ser eliminada, mas abstrações prematuras são proibidas. Nenhuma alteração pode
usar nomes enigmáticos, estado global implícito ou efeitos colaterais não documentados.

### II. Responsabilidades únicas e baixo acoplamento

Cada módulo, classe e função deve possuir uma responsabilidade bem definida e depender do mínimo
necessário de outros componentes. Interfaces devem ser pequenas, explícitas e orientadas ao domínio.
Dependências concretas devem ser isoladas por abstrações adequadas quando houver risco de
instabilidade. Toda violação de fronteira arquitetural deve ser justificada e registrada.

### III. Testes antes da implementação (NÃO NEGOCIÁVEL)

Comportamentos novos devem ser especificados por testes que falhem antes da implementação, exceto
trabalho de infraestrutura que não possa ser testado de forma determinística. O ciclo obrigatório é
red-green-refactor: confirmar a falha, implementar a menor correção que passe e depois melhorar o
desenho. A correção de defeitos deve incluir um teste de regressão que reproduza o problema.

### IV. Qualidade verificável e integração segura

Toda mudança deve preservar ou ampliar a cobertura dos contratos públicos e dos fluxos críticos. Testes
unitários devem cobrir decisões isoladas; testes de integração devem validar limites, persistência e
comunicação entre componentes. Lint, compilação, testes e verificações disponíveis devem passar
antes da integração. Falhas externas devem ser tratadas sem vazamento de detalhes sensíveis.

### V. Simplicidade, segurança e evolução controlada

Implementações devem começar pela solução mais simples que satisfaça os requisitos conhecidos.
Complexidade adicional deve ser motivada por um requisito mensurável. Dependências, APIs e formatos
compatíveis devem evitar alterações incompatíveis quando possível; mudanças incompatíveis exigem
versão, migração e documentação. Dados sensíveis não podem ser registrados em texto claro e entradas
não confiáveis devem ser validadas na fronteira.

## Restrições Técnicas

- O projeto deve manter uma descrição reproduzível de ferramentas, comandos de instalação,
  compilação e teste.
- Configuração específica de ambiente deve ser externa ao código-fonte e validada na inicialização.
- O código deve operar sem dependências não registradas no gerenciador do projeto.
- Erros esperados devem ser tratados com mensagens acionáveis; erros inesperados devem ser registrados
  com contexto suficiente sem expor credenciais ou dados pessoais.
- Logs, métricas e identificadores de execução devem permitir diagnosticar o fluxo sem exigir acesso
  direto ao estado interno em produção.

## Fluxo de Desenvolvimento

- Toda mudança deve partir de um requisito ou defeito verificável e terminar em evidência de validação.
- Revisões devem verificar comportamento, legibilidade, segurança, testes e conformidade com esta
  constituição.
- Código sem teste aplicável deve incluir justificativa explícita na revisão.
- Regras locais derivadas desta constituição devem ser registradas junto ao repositório e não podem
  contradizer seus princípios.
- Complexidade, exceções e decisões arquiteturais devem ser documentadas no momento da decisão.

## Governance

Esta constituição prevalece sobre práticas pessoais e convenções não documentadas. Alterações exigem
descrição da motivação, revisão de impacto, atualização da versão e registro da migração necessária.
Propostas que removam ou redefinam princípios exigem uma revisão de compatibilidade e uma versão
MAJOR. Novos princípios ou expansões materiais exigem uma versão MINOR. Esclarecimentos,
correções e refinamentos sem mudança de semântica exigem uma versão PATCH.

Toda revisão de pull request deve verificar conformidade por meio dos princípios aplicáveis, dos testes
executados e das evidências de qualidade. Dúvidas de interpretação devem ser registradas e resolvidas
por alteração explícita desta constituição.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2026-11-18

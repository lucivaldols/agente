# 🧠 Agente Inteligente de Aprendizado e Raciocínio Lógico (Llama & SQLite Local)

Bem-vindo ao mapa completo do **Agente de Aprendizado Contínuo e Raciocínio Lógico**. Este ecossistema full-stack moderno foi projetado para rodar modelos de inteligência artificial de forma **totalmente local (offline-first)** via `llama.cpp` com persistência de dados estruturada (simulando SQLite) para rastreamento progressivo do usuário.

A aplicação atua dinamicamente tanto como um **Mentor de Engenharia de Software Sênior** (com revisão de código, análise de redundâncias e diagnóstico de produção) quanto como um **Tutor de Lógica Adaptativa** (com trilhas de aprendizado e geração dinâmica de desafios).

---

## 🗺️ Mapa Arquitetural do Sistema

O sistema é construído sobre uma arquitetura híbrida de alta performance dividida em três camadas principais:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Navegador (Frontend SPA)                        │
│   ┌────────────────────┐   ┌────────────────────────┐   ┌──────────┐   │
│   │ UI React & Tailwind│ ◄─┤ motion/react (Fades)   │ ◄─┤ Highlight│   │
│   └─────────┬──────────┘   └────────────────────────┘   └──────────┘   │
└─────────────┼──────────────────────────────────────────────────────────┘
              │ Fetch HTTPS (Requests) / SSE (Event Stream)
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Servidor Node.js (Proxy API)                     │
│   ┌─────────────────┐   ┌─────────────────┐   ┌────────────────────┐   │
│   │ Express App     │ ◄─┤ JSON DB Handler │ ◄─┤ SQLite DB Simulator│   │
│   │ (Endpoints)     │   │ (chat_history)  │   │ (userProgress)     │   │
│   └────────┬────────┘   └─────────────────┘   └────────────────────┘   │
└────────────┼──────────────────────────────────────────────────────────┘
             │ Loopback Interno Portas 8080/v1
             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Engine de IA Local & Cloud                      │
│   ┌───────────────────────────┐         ┌──────────────────────────┐   │
│   │ Llama.cpp Command Process │  ◄Or/──►│ Google Gemini API Cloud  │   │
│   │ (tinyllama.gguf @ 8080)   │         │ (gemini-3.5-flash)       │   │
│   └───────────────────────────┘         └──────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura de Arquivos (Mapeamento Físico)

Aqui está a árvore completa das pastas do repositório e suas responsabilidades individuais dentro do ecossistema:

```
├── .env.example             # Documentação de variáveis de ambiente do applet (chaves de fallback)
├── index.html               # Ponto de montagem HTML5 principal da SPA
├── metadata.json            # Metadados de permissão do AI Studio (Camera, Audio, Capabilities)
├── package.json             # Definição de scripts de build (esbuild + vite) e dependências npm
├── server.ts                # Servidor backend Express: gerencia llama.cpp, SQLite simulado e proxy SSE
├── tsconfig.json            # Configurações globais do compilador do TypeScript
├── vite.config.ts           # Configuração de bundler e plugins do Vite (React + Tailwind CSS)
├── src/
│   ├── main.tsx             # Arquivo de inicialização e montagem do React 19 no DOM
│   ├── index.css            # Folha de estilo global integrando as diretivas de utilidades do Tailwind v4
│   ├── types.ts             # Declarações estritas de interfaces de dados (Conversas, Mensagens, Progresso)
│   ├── App.tsx              # Componente principal de tela, lógicas de SSE Streaming e gerenciamento de estados
│   └── components/
│       ├── Sidebar.tsx      # Barra lateral: navegação de sessões e ficha visual do progresso do aluno (SQLite)
│       ├── ToolCard.tsx     # Visualizador de ferramentas executadas (logs de salvamento de arquivos/memória)
│       └── MarkdownRenderer.tsx # Renderizador customizado de markdown e syntax-highlight de códigos com cópia
```

---

## ⚙️ Fluxos de Funcionamento (Mechanics)

### 1. Inicialização do llama-server
Ao iniciar o backend do Node.js, o método `initLlamaServer()` executa um processo filho em segundo plano de forma automática, chamando o comando exato configurado pelo usuário:
```bash
cd ~/llama.cpp && ./build/bin/llama-server -m ~/models/tinyllama.gguf --host 127.0.0.1 --port 8080 -t 4 -c 2048 -np 1 --flash-attn on
```
*   O servidor Express monitora de forma constante os logs de `stdout` e `stderr` do processo do llama.cpp para depuração instantânea no console do desenvolvedor.

### 2. Fluxo de Transmissão em Alta Velocidade (SSE Streaming)
A conexão de streaming entre o Frontend e o Llama.cpp não sofre buffering em proxies intermediários devido à injeção dos headers de desativação de cache e aceleração:
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.setHeader("X-Accel-Buffering", "no"); // Impede buffering do Nginx / Cloud Run
```

No frontend (`App.tsx`), os pacotes em rede são lidos sequencialmente usando a API `ReadableStream` de forma assíncrona, tratando quebras de linhas incompletas no buffer de bytes de caracteres `utf-8`.

### 3. Loop de Persistência Dinâmica (Auto-Upgrade do Estudante)
Quando o modelo de linguagem detecta evolução, correções bem sucedidas de bugs ou novos conceitos estudados, ele gera em linha única no final absoluto de sua transmissão o marcador formatado `[UPDATE_PROGRESS]`:
```json
[UPDATE_PROGRESS]{"level": "intermediário", "topic": "Busca Ordenada", "mistakes": ["SyntaxError"], "achievements": ["Resolveu desafio de BFS"], "notes": "Evoluiu para conceitos de complexidade de tempo."}
```
O backend extrai este JSON usando expressões regulares (`progressRegex`), intercepta os dados, salva permanentemente os novos dados no arquivo simulando SQLite (`chat_history.json`) e remove a string técnica antes de exibir a resposta final limpa para o usuário.

---

## 📡 Detalhamento dos Endpoints da API

O servidor Express disponibiliza uma interface REST limpa para sincronização rápida de dados:

| Método | Endpoint | Descrição | Corpo da Requisição / Query |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/conversations` | Lista de sessões de chats ordenadas por data de criação. | Nenhum |
| **POST** | `/api/conversations` | Cria uma nova sessão de chat com dados de baseline limpos. | `{ "title": "Opcional" }` |
| **DELETE** | `/api/conversations/:id` | Remove permanentemente uma conversa específica do disco do host. | `:id` no parâmetro de URL |
| **GET** | `/api/user-progress` | Obtém o perfil de evolução persistido do SQLite (nível, tópicos, conquistas, erros). | Nenhum |
| **POST** | `/api/user-progress` | Reseta ou altera manualmente todo o progresso do usuário no SQLite. | `{ "level": "iniciante", "topic": "Exemplo", ... }` |
| **GET** | `/history` | Retorna o histórico de mensagens completo de uma determinada sessão ativa. | `?conversationId=id` |
| **POST** | `/chat` | Envia entrada do usuário (com opcionais de arquivo drag-and-drop e portas customizadas do Llama). | `{ "message": "texto", "file": FileData, "port": 8080 }` |

---

## 🗃️ Estruturas de Dados Estritas (TypeScript)

As estruturas operacionais básicas são reguladas no arquivo `/src/types.ts` sob tipagem explícita do TypeScript:

### 1. Progresso do Estudante (`UserProgress`)
Representa a ficha de progresso de lógica e programação atualizada pelo robô:
```typescript
export interface UserProgress {
  id: string;
  topic: string; // Tópico atual em estudo (ex: BFS Graph Search, Algoritmos, Git, etc)
  level: "iniciante" | "intermediário" | "avançado";  // Fases de desenvolvimento adaptativo
  last_interaction: string; // Timestamp em formato ISO do último contato
  mistakes: string[];       // Lista de pequenos deslizes lógicos ou sintáticos detectados
  achievements: string[];   // Lista de conquistas técnicas e medalhas desbloqueadas
  notes: string;            // Anotações dinâmicas feitas pelo sistema sobre o comportamento do estudante
}
```

### 2. Mensagens do Chat (`Message`)
Estrutura cada balão e conteúdo de resposta inteligente:
```typescript
export interface Message {
  id: string;
  user_message: string;
  ai_response: string;
  timestamp: string;
  tools?: { icon: string; label: string; text?: string }[]; // Ferramenta que a IA executou no host
  file?: { name: string; size: number; type: string; url?: string }; // Arquivo anexo enviado
}
```

---

## ⚡ Detalhes Tecnológicos e UI do Frontend

A interface gráfica de alta performance é focada em usabilidade imediata:
1.  **Suporte Completo Drag-and-Drop:** Se o usuário arrasta qualquer arquivo para o chat, ele é codificado dinamicamente em Base64 no navegador e anexado ao prompt.
2.  **Sistema de Controle das Portas da IA:** Na seção de configurações, o usuário pode apontar o frontend para qualquer porta do servidor de GGUF ativo (Ex: `8080`, `11434`, etc).
3.  **Transições com `motion/react`:** Todos os elementos visuais contam com suavização de estado físico e micro-animações (staggering nos balões e fades sutis).
4.  **Syntax Highlighting:** Códigos fonte em linguagens como JavaScript, Python e C++ retornados pela IA são destacados sob o padrão de coloração escura de alta fidelidade do `highlight.js`, acompanhados de botões de cópia interativos de clique rápido.

---

## 🚀 Como Executar o Sistema em Produção

### Requisitos e Instalação
Garanta que você possui os tempos de execução do Node.js instalados e o compilador C++ de llama.cpp compilado no seu dispositivo.

1. Instale as dependências integradas do projeto:
   ```bash
   npm install
   ```
2. Crie uma build de produção otimizada que compila o bundle de frontend do Vite e empacota o servidor TypeScript em um único arquivo standalone do esbuild (`dist/server.cjs`):
   ```bash
   npm run build
   ```
3. Execute o ecossistema integrado:
   ```bash
   npm start
   ```
4. Se preferir rodar em modo de desenvolvimento com hot-reload local ativo para depuração ágil:
   ```bash
   npm run dev
   ```

*Obs: Certifique-se de iniciar seu modelo com o context size estendido (ex: `-c 2048`) em máquinas com restrições de memória de CPU/GPU para garantir melhor estabilidade do histórico de mensagens.*

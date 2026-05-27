/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import os from "os";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Local JSON DB file paths to simulate SQLite persistence
const DB_PATH = path.join(os.tmpdir(), "chat_history.json");

interface Message {
  id: string;
  user_message: string;
  ai_response: string;
  timestamp: string;
  tools?: Array<{ icon: string; label: string; text?: string }>;
  file?: { name: string; size: number; type: string; url?: string };
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

interface UserProgress {
  id: string;
  topic: string;
  level: "iniciante" | "intermediário" | "avançado";
  last_interaction: string;
  mistakes: string[];
  achievements: string[];
  notes: string;
}

interface DatabaseSchema {
  conversations: Record<string, Conversation>;
  activeConversationId: string;
  userProgress?: UserProgress;
}

// Initial structural database state
const initialDb: DatabaseSchema = {
  conversations: {
    "default-session": {
      id: "default-session",
      title: "Chat Inicial",
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: "welcome-msg",
          user_message: "Iniciei o agente de IA local",
          ai_response: "Olá! Sou o seu **Agente de Aprendizado Contínuo e Raciocínio Lógico** rodando via `llama.cpp` e banco de dados SQLite simulado.\n\nEstou equipado com a sua **ficha de evolução permanente** para guiar você do nível iniciante até o nível avançado de forma adaptativa. Pergunte qualquer dúvida técnica, nos envie códigos ou peça desafios para começarmos! 🧠✨",
          timestamp: new Date().toISOString(),
          tools: [
            { icon: "🧠", label: "Sistema de Memória SQLite Ativo" },
            { icon: "⚡", label: "Auto-Evolução Ativada" }
          ]
        }
      ]
    }
  },
  activeConversationId: "default-session",
  userProgress: {
    id: "user-1",
    topic: "Lógica Geral",
    level: "iniciante",
    last_interaction: new Date().toISOString(),
    mistakes: [],
    achievements: ["Iniciou a jornada de aprendizado"],
    notes: "Ficha de progresso inicializada pelo Agente de Aprendizado."
  }
};

// Database utility helper methods
function readDB(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), "utf8");
      return initialDb;
    }
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Erro ao ler o histórico local:", error);
    return initialDb;
  }
}

function writeDB(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Erro ao salvar o histórico local:", error);
  }
}

// Initiates the llama-server in the background on port 8080 as requested
function initLlamaServer() {
  console.log("[Llama Manager] Iniciando llama-server local em segundo plano...");
  
  // Exact user command requested:
  // cd ~/llama.cpp && ./build/bin/llama-server -m ~/models/tinyllama.gguf --host 127.0.0.1 --port 8080 -t 4 -c 512 -np 1 --flash-attn on
  const llamaCommandLine = `cd ~/llama.cpp && ./build/bin/llama-server -m ~/models/tinyllama.gguf --host 127.0.0.1 --port 8080 -t 4 -c 512 -np 1 --flash-attn on`;
  
  try {
    const llamaChild = spawn(llamaCommandLine, {
      shell: true,
      detached: false
    });

    llamaChild.stdout.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[llama.cpp stdout]: ${line}`);
      }
    });

    llamaChild.stderr.on("data", (errors) => {
      const errLine = errors.toString().trim();
      if (errLine) {
        console.log(`[llama.cpp stderr]: ${errLine}`);
      }
    });

    llamaChild.on("error", (err) => {
      console.error("[Llama Manager Error] Falha ao tentar spawnar o processo llama-server:", err);
    });

    llamaChild.on("close", (code) => {
      console.log(`[Llama Manager Info] Processo llama-server finalizou com código: ${code}`);
    });
  } catch (err) {
    console.error("[Llama Manager Error] Exceção ao iniciar o processo llama-server:", err);
  }
}

async function startServer() {
  // Start llama-server immediately as the express dev/prod script begins
  initLlamaServer();

  const app = express();
  const PORT = 3000;

  // Elevate body limit for handling file base64 uploads easily
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Initialize Gemini Client with fallback verification
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    console.log("Gemini API Client configurado com sucesso.");
  } else {
    console.warn("Aviso: GEMINI_API_KEY não encontrada ou com valor padrão. Usando respostas simuladas locais.");
  }

  // ==========================================
  // CONVERSATION & CHAT HISTORY ENDPOINTS
  // ==========================================

  // GET /api/conversations - List all sessions
  app.get("/api/conversations", (req, res) => {
    const db = readDB();
    const list = Object.values(db.conversations).map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      lastMessage: c.messages[c.messages.length - 1]?.user_message || "Sem mensagens"
    }));
    // Sort by latest
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(list);
  });

  // POST /api/conversations - Create a new session
  app.post("/api/conversations", (req, res) => {
    const db = readDB();
    const id = "session_" + Math.random().toString(36).substr(2, 9);
    const newConv: Conversation = {
      id,
      title: req.body.title || "Nova Conversa",
      createdAt: new Date().toISOString(),
      messages: []
    };
    db.conversations[id] = newConv;
    db.activeConversationId = id;
    writeDB(db);
    res.json(newConv);
  });

  // DELETE /api/conversations/:id - Delete a session
  app.delete("/api/conversations/:id", (req, res) => {
    const { id } = req.params;
    const db = readDB();
    if (db.conversations[id]) {
      delete db.conversations[id];
      // Re-assign active if needed
      if (db.activeConversationId === id) {
        const remaining = Object.keys(db.conversations);
        db.activeConversationId = remaining[0] || "";
      }
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Sessão não encontrada" });
    }
  });

  // GET /api/user-progress - Retrieve the user's persist progress data
  app.get("/api/user-progress", (req, res) => {
    const db = readDB();
    if (!db.userProgress) {
      db.userProgress = {
        id: "user-1",
        topic: "Lógica Geral",
        level: "iniciante",
        last_interaction: new Date().toISOString(),
        mistakes: [],
        achievements: ["Iniciou a jornada de aprendizado"],
        notes: "Ficha de progresso inicializada pelo Agente de Aprendizado."
      };
      writeDB(db);
    }
    res.json(db.userProgress);
  });

  // POST /api/user-progress - Overwrite/Reset user's progress data
  app.post("/api/user-progress", (req, res) => {
    const db = readDB();
    db.userProgress = {
      id: "user-1",
      topic: req.body.topic || "Lógica Geral",
      level: req.body.level || "iniciante",
      last_interaction: new Date().toISOString(),
      mistakes: req.body.mistakes || [],
      achievements: req.body.achievements || ["Iniciou a jornada de aprendizado"],
      notes: req.body.notes || "Ficha de progresso atualizada pelo usuário."
    };
    writeDB(db);
    res.json(db.userProgress);
  });

  // GET /history - Get message history of the current active conversation
  // Matches exact prompt request: GET /history
  app.get("/history", (req, res) => {
    const db = readDB();
    const activeId = (req.query.conversationId as string) || db.activeConversationId;
    const conversation = db.conversations[activeId];
    if (conversation) {
      res.json(conversation.messages);
    } else {
      // Fallback empty list
      res.json([]);
    }
  });

    // POST /chat - Chat endpoint processing the request
  // Matches exact request payload {"message": "Olá"} and response {"reply": "Olá humano"}
  app.post("/chat", async (req, res) => {
    const { message, conversationId, file, port, model } = req.body;
    if (!message) {
      return res.status(400).json({ error: "A mensagem é obrigatória." });
    }

    const selectedPort = port || 8080;
    const selectedModel = model || "tinyllama";

    const db = readDB();
    const activeId = conversationId || db.activeConversationId || "default-session";
    let conversation = db.conversations[activeId];

    if (!conversation) {
      // Lazy-create conversation if missing
      conversation = {
        id: activeId,
        title: message.substring(0, 30) + (message.length > 30 ? "..." : ""),
        createdAt: new Date().toISOString(),
        messages: []
      };
      db.conversations[activeId] = conversation;
      db.activeConversationId = activeId;
    }

    // Initialize or load current userProgress profile
    if (!db.userProgress) {
      db.userProgress = {
        id: "user-1",
        topic: "Lógica Geral",
        level: "iniciante",
        last_interaction: new Date().toISOString(),
        mistakes: [],
        achievements: ["Iniciou a jornada de aprendizado"],
        notes: "Ficha de progresso inicializada pelo Agente de Aprendizado."
      };
      writeDB(db);
    }

    // Auto update title if still default or empty list
    if (conversation.messages.length === 0) {
      conversation.title = message.substring(0, 40) + (message.length > 40 ? "..." : "");
    }

    // Set streaming and event headers immediately
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Prepare simulated tools based on prompt content
    const simulatedTools: Array<{ icon: string; label: string }> = [];
    const lowerMsg = message.toLowerCase();

    if (file) {
      simulatedTools.push({ icon: "📁", label: `Arquivo recebido: ${file.name}` });
    }
    if (lowerMsg.includes("salvar") || lowerMsg.includes("escrever") || lowerMsg.includes("arquivo")) {
      simulatedTools.push({ icon: "💾", label: "Arquivo salvo localmente no disco" });
    }
    if (lowerMsg.includes("roda") || lowerMsg.includes("executa") || lowerMsg.includes("script")) {
      simulatedTools.push({ icon: "⚙️", label: "Ferramenta executada no servidor" });
    }
    if (lowerMsg.includes("lembre") || lowerMsg.includes("salve na memoria") || lowerMsg.includes("memorize")) {
      simulatedTools.push({ icon: "🧠", label: "Memória de longo prazo atualizada no SQLite" });
    }
    if (lowerMsg.includes("tempo") || lowerMsg.includes("clima") || lowerMsg.includes("previsao")) {
      simulatedTools.push({ icon: "☁️", label: "Ferramenta clima executada" });
    }

    // Write initial tools back immediately
    res.write(`data: ${JSON.stringify({ type: "tools", tools: simulatedTools })}\n\n`);

    let aiReply = "";
    let fetchedFromLlama = false;

    // Build OpenAI-compatible messaging sequence including full local history memory with developer instructions
    const systemPrompt = `
      Você é um Agente Inteligente de Aprendizado Contínuo e Raciocínio Lógico de Alta Performance, combinando Engenharia de Software Sênior, Tutoria Inteligente e Mentor de Tecnologia, equipado com banco de dados SQLite real para persistência e memória de longo prazo do usuário.
      Seu objetivo é ensinar lógica de forma progressiva, analisar erros em produção, e conduzir o usuário rumo à maestria técnica.

      ================================================================================
      💻 FICHA DO ALUNO PERSISTIDA VIA SQLITE (SEU CONTEXTO):
      - Nível de Experiência Atual: ${db.userProgress.level.toUpperCase()}
      - Conteúdo/Tema em Estudo: ${db.userProgress.topic}
      - Histórico de Erros Registrados: ${JSON.stringify(db.userProgress.mistakes)}
      - Conquistas e Medalhas: ${JSON.stringify(db.userProgress.achievements)}
      - Notas Complementares de Evolução: ${db.userProgress.notes}
      ================================================================================

      Você atua dinamicamente sob duas especialidades principais, dependendo do contexto da mensagem do usuário:

      ================================================================================
      Especialidade A: AGENTE DE ENGENHARIA DE SOFTWARE SÊNIOR E CODE REVIEWER
      ================================================================================
      Ativado quando o usuário solicita análise de código, resolução de erros, integrações ou fluxos GIT.

      🔎 1. DETECÇÃO DE ERROS
      * Identificar erros de sintaxe, lógica, segurança e execução.
      * Apontar bugs que podem quebrar o sistema em produção.
      * Explicar rapidamente o problema e sugerir e aplicar a correção correspondente.

      ♻️ 2. DETECÇÃO DE CÓDIGO DUPLICADO
      * Encontrar trechos repetidos no código do usuário.
      * Sugerir refatoração estrutural (como funções reutilizáveis, hooks ou modularização).
      * Indicar impactos de duplicação na escalabilidade e manutenção.

      ⚙️ 3. BOAS PRÁTICAS
      * Sugerir melhorias de performance e consumo de CPU/módulo memoria.
      * Reduzir complexidades desnecessárias em código local.
      * Melhorar a organização das pastas e arquivos.

      📦 4. CONTEXTO GIT (MOBILE / PRODUÇÃO)
      * O usuário trabalha frequentemente no celular com fluxos remotos (ex: git pull no celular, Termux/Ubuntu proot, ambiente de produção no servidor e atualizações rápidas via GitHub).
      * Sugerir boas práticas de branch antes do git pull, instruir sobre como resolver conflitos de merge de forma segura, e sugerir pipelines estáveis (branch -> pull -> test -> deploy).

      🚨 5. MODO PRODUÇÃO
      * Lembre-se sempre de que o sistema pode estar online, então estabilidade de rede e integridade de dados são prioridades máximas.

      📌 FORMATO DE RESPOSTA RECOMENDADO PARA CODE REVIEW / DEBUG:
      ### 🧠 Diagnóstico
      (resumo do problema)

      ### ❌ Problemas encontrados
      (lista objetiva)

      ### 🛠️ Correção sugerida
      (blocos de código ou explicação direta)

      ### ⚠️ Risco em produção
      (se aplicável)

      ### 🚀 Melhorias recomendadas
      (opções extras de performance ou modularização)


      ================================================================================
      Especialidade B: AGENTE DE APRENDIZADO ACELERADO E RACIOCÍNIO LÓGICO AVANÇADO
      ================================================================================
      Ativado para esclarecer dúvidas gerais, teoria, novos conceitos, aprendizado em programação e estruturas lógicas.

      ⚡ 1. MODO DE APRENDIZADO RÁPIDO
      * Explicar de forma simples primeiro (nível básico/analogias) adaptando ao nível atual (${db.userProgress.level.toUpperCase()}).
      * Depois evoluir para nível intermediário.
      * E finalizar com nível avançado (visão técnica, profissional ou arquitetura interna).

      🧠 2. RACIOCÍNIO LÓGICO
      * Quebrar problemas lógicos ou conceituais em etapas pequenas.
      * Mostrar "como pensar" e estruturar o intelecto, e não receber só a resposta pronta.
      * Usar exemplos práticos ricos do mundo real e explicar os porquês das coisas.

      🔁 3. SISTEMA DE EVOLUÇÃO (LEARNING LOOP)
      * Detectar o nível de compreensão do usuário.
      * Sugerir o próximo passo de aprendizado com clareza.
      * Sempre que apropriado, crie mini desafios ou exercícios rápidos de fixação para reforçar o conhecimento.

      ⚙️ 4. MODO ENGENHEIRO DE LÓGICA
      * Estruture os pensamentos como: Entrada ➔ Análise ➔ Hipóteses ➔ Solução ➔ Resultado.
      * Evitar respostas superficiais ou vagas. Pensar como cientista, mentor de software e professor ao mesmo tempo.

      📌 FORMATO DE RESPOSTA RECOMENDADO PARA APRENDIZADO / TUTORIA:
      ### 🧠 Nível atual detectado
      (ex: iniciante/intermediário/avançado)

      ### 📚 Explicação adaptada
      (conteúdo personalizado ao nível)

      ### 🔍 Exemplo prático
      (código ou situação real)

      ### ⚙️ Como isso funciona internamente
      (visão lógica/técnica)

      ### 🚀 Próximo passo
      (próximo aprendizado recomendado)

      ### 🧪 Mini desafio
      (exercício curto para fixação do conhecimento)


      ================================================================================
      💾 REGRAS CRÍTICAS DE PERSISTÊNCIA NA MEMÓRIA SQLITE:
      ================================================================================
      Como você acompanha a evolução do aluno localmente no banco, quando identificar que houve progresso técnico, novas descobertas, ou novos erros observados, você DEVE escrever no final absoluto da mensagem (na última linha) o bloco compacto de persistência:
      
      [UPDATE_PROGRESS]{"level": "nível_novo", "topic": "novo_módulo_ou_tópico_estudado", "mistakes": ["novo_erro_se_cometeu"], "achievements": ["conquista_nova_destravada"], "notes": "resumo_curto_do_progresso_ou_foco"}

      Orientações:
      - O campo "level" DEVE ser: "iniciante", "intermediário" ou "avançado".
      - Mantenha descrições curtas e empolgantes de até 3-4 palavras para as conquistas/erros.
      - Garanta que este bloco JSON seja perfeitamente válido, compacto e inserido em linha única no fim.

      ================================================================================
      DIRETRIZES DE SAÍDA GERAIS:
      ================================================================================
      - Responda em português de forma natural, amigável e extremamente objetiva.
      - Use formatação rica em Markdown (títulos, negrito, blocos de código com linguagem explícita).
      - Seja direto e focado no assunto, pensando sempre como um dev sênior mentor de alta performance.
    `;

    const messagesPayload: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    // Read sliced conversation history (last 4 messages) to feed memory context efficiently on mobile without slowing down
    const recentMessages = conversation.messages.slice(-4);
    recentMessages.forEach((msg) => {
      if (msg.user_message) {
        messagesPayload.push({ role: "user", content: msg.user_message });
      }
      if (msg.ai_response) {
        messagesPayload.push({ role: "assistant", content: msg.ai_response });
      }
    });

    // Append active user prompt (plus file metadata text to provide contextual understanding on Qwen)
    let activePrompt = message;
    if (file) {
      activePrompt = `[Usuário anexou um arquivo chamado: "${file.name}" (tipo: ${file.type}, tamanho: ${file.size} bytes)]\n\nMensagem: ${message}`;
    }
    messagesPayload.push({ role: "user", content: activePrompt });

    // 1️⃣ High Priority: Attempt reading with continuous stream from standard local llama.cpp server endpoint at port selectedPort
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (err) {}
    }, 120000); // 120 seconds for low-latency/longer CPU processing on mobile devices safely

    try {
      console.log(`[Llama Manager] Tentando se conectar com stream do llama-server local em http://127.0.0.1:${selectedPort}...`);
      const llamaResponse = await fetch(`http://127.0.0.1:${selectedPort}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messagesPayload,
          temperature: 0.7,
          stream: true // Enable streaming at server level
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (llamaResponse.ok && llamaResponse.body) {
        fetchedFromLlama = true;
        simulatedTools.push({ icon: "⚡", label: `Processado localmente via llama.cpp (Porta ${selectedPort})` });
        res.write(`data: ${JSON.stringify({ type: "tools", tools: simulatedTools })}\n\n`);

        const reader = llamaResponse.body;
        let buffer = "";

        for await (const chunk of reader as any) {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // remainder

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                const char = parsed.choices?.[0]?.delta?.content || "";
                if (char) {
                  aiReply += char;
                  res.write(`data: ${JSON.stringify({ type: "content", content: char })}\n\n`);
                }
              } catch (e) {
                // partial chunk skip gracefully
              }
            }
          }
        }

        // flush final remaining buffer line
        if (buffer.trim().startsWith("data: ")) {
          const dataStr = buffer.trim().slice(6).trim();
          if (dataStr !== "[DONE]") {
            try {
              const parsed = JSON.parse(dataStr);
              const char = parsed.choices?.[0]?.delta?.content || "";
              if (char) {
                aiReply += char;
                res.write(`data: ${JSON.stringify({ type: "content", content: char })}\n\n`);
              }
            } catch (e) {}
          }
        }
        console.log(`[Llama Manager] SUCESSO: Stream completado de llama-server (${selectedModel})!`);
      } else {
        console.warn(`[Llama Manager] llama-server retornou status HTTP de erro ou no body: ${llamaResponse.status}`);
      }
    } catch (llamaError: any) {
      clearTimeout(timeoutId);
      console.error("[Llama Manager Fetch Stream Error]:", llamaError);
      console.log("[Llama Manager] llama-server local não pôde ser alcançado nesta requisição de streaming. Redirecionando para fallback...");
    }

    // 2️⃣ Fallback: If llama-server is not reachable, stream fallback response
    if (!fetchedFromLlama) {
      try {
        if (ai) {
          const systemInstruction = systemPrompt;
          let contents: any = message;
          if (file && file.data) {
            const isImage = file.type.startsWith("image/");
            if (isImage) {
              const base64Data = file.data.split(",")[1] || file.data;
              contents = {
                parts: [
                  { inlineData: { mimeType: file.type, data: base64Data } },
                  { text: `O usuário enviou esta imagem acompanhada de: "${message}"` }
                ]
              };
            } else {
              contents = `O usuário anexou o arquivo "${file.name}" (conteúdo: "${file.data}").\nMensagem: ${message}`;
            }
          }

          simulatedTools.push({ icon: "☁️", label: "Processado via nuvem hibrida (Falha de conexão GGUF local)" });
          res.write(`data: ${JSON.stringify({ type: "tools", tools: simulatedTools })}\n\n`);

          const genAIResponseStream = await ai.models.generateContentStream({
            model: "gemini-3.5-flash",
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            }
          });

          for await (const chunk of genAIResponseStream) {
            const char = chunk.text || "";
            if (char) {
              aiReply += char;
              res.write(`data: ${JSON.stringify({ type: "content", content: char })}\n\n`);
            }
          }
        } else {
          console.log("Simulando resposta local offline em tempo real...");
          const fullMock = getMockLocalResponse(message, file);
          
          // Split mock responses into small units to type beautifully
          const mockChunks = fullMock.match(/[^ ]+ *| +/g) || [fullMock];
          for (const element of mockChunks) {
            aiReply += element;
            res.write(`data: ${JSON.stringify({ type: "content", content: element })}\n\n`);
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        }
      } catch (error: any) {
        console.error("Erro ao chamar o fallback em streaming:", error);
        const errText = `⚠️ **Erro de Comunicação Local**\nOcorreu um erro ao processar o seu prompt no llama.cpp local.\n\nDetalhes do erro: \`${error.message || error}\`\n\n*Nota: Certifique-se de que o backend está ativo e o arquivo do modelo GGUF foi carregado corretamente na porta correspondente.*`;
        aiReply = errText;
        res.write(`data: ${JSON.stringify({ type: "content", content: errText })}\n\n`);
      }
    }

    // Add extra decorative tools if empty
    if (simulatedTools.length === 0) {
      simulatedTools.push({ icon: "🧠", label: "Memória SQLite atualizada" });
    }

    // Process progress database updates and clean raw markdown if appended by the AI model
    let cleanedReply = aiReply;
    const progressRegex = /\[UPDATE_PROGRESS\]\s*(\{[\s\S]*?\})/i;
    const match = aiReply.match(progressRegex);
    if (match) {
      try {
        const parsedProgress = JSON.parse(match[1]);
        if (!db.userProgress) {
          db.userProgress = {
            id: "user-1",
            topic: "Lógica Geral",
            level: "iniciante",
            last_interaction: new Date().toISOString(),
            mistakes: [],
            achievements: [],
            notes: ""
          };
        }
        if (parsedProgress.level) db.userProgress.level = parsedProgress.level;
        if (parsedProgress.topic) db.userProgress.topic = parsedProgress.topic;
        if (parsedProgress.mistakes && Array.isArray(parsedProgress.mistakes)) {
          db.userProgress.mistakes = Array.from(new Set([...db.userProgress.mistakes, ...parsedProgress.mistakes])).slice(-8);
        }
        if (parsedProgress.achievements && Array.isArray(parsedProgress.achievements)) {
          db.userProgress.achievements = Array.from(new Set([...db.userProgress.achievements, ...parsedProgress.achievements])).slice(-8);
        }
        if (parsedProgress.notes) db.userProgress.notes = parsedProgress.notes;
        db.userProgress.last_interaction = new Date().toISOString();
        console.log("[SQLite Memória] Auto-evolução do estudante salva de forma permanente.");
      } catch (e) {
        console.error("[SQLite Memória] Erro ao tratar JSON de progresso:", e);
      }
      cleanedReply = aiReply.replace(progressRegex, "").trim();
    } else {
      // Offline fallback: simulate auto progress to let the user play with things!
      if (!db.userProgress) {
        db.userProgress = {
          id: "user-1",
          topic: "Lógica Geral",
          level: "iniciante",
          last_interaction: new Date().toISOString(),
          mistakes: [],
          achievements: [],
          notes: ""
        };
      }
      db.userProgress.last_interaction = new Date().toISOString();
      if (lowerMsg.includes("erro") || lowerMsg.includes("muda") || lowerMsg.includes("bug")) {
        db.userProgress.mistakes = Array.from(new Set([...db.userProgress.mistakes, "Explorou erros lógicos"])).slice(-8);
      } else {
        db.userProgress.achievements = Array.from(new Set([...db.userProgress.achievements, "Enviou mensagem local"])).slice(-8);
      }
    }

    // Save message pair in database
    const newMsg: Message = {
      id: "msg_" + Math.random().toString(36).substr(2, 9),
      user_message: message,
      ai_response: cleanedReply,
      timestamp: new Date().toISOString(),
      tools: simulatedTools.length > 0 ? simulatedTools : undefined,
      file: file ? { name: file.name, size: file.size, type: file.type } : undefined
    };

    conversation.messages.push(newMsg);
    writeDB(db);

    // Send final done signal carrying full metadata for instant synchronization
    res.write(`data: ${JSON.stringify({ type: "done", id: newMsg.id, reply: cleanedReply, tools: simulatedTools })}\n\n`);
    res.end();
  });

  // ==========================================
  // STATIC ASSET SERVING & VITE MIDDWARE
  // ==========================================

  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite Development Middleware montado com sucesso.");
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Servindo arquivos estáticos de produção do diretório /dist.");
  }

  // Use PORT 3000 and 0.0.0.0
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

// Helper for offline mock response when API key is missing
function getMockLocalResponse(userMessage: string, file?: any): string {
  const msg = userMessage.toLowerCase();
  
  if (file) {
    return `Recebi o seu anexo **${file.name}** (${file.type}, ${Math.round(file.size / 1024)} KB)!\n\nComo estou rodando em modo de demonstração local offline, analisei simuladamente o seu arquivo. Se você estivesse usando meu modelo \`llama-3-8b-instruct.Q4_K_M.gguf\` com a GPU ativa, este arquivo estaria agora indexado na nossa base SQLite local. Como posso ajudar com ele?`;
  }

  if (msg.includes("ola") || msg.includes("olá") || msg.includes("oi") || msg.includes("como vai")) {
    return `Olá humano! Sou o **Agente de IA Local de Alta Performance**.\n\nEscrevendo do seu próprio computador! Graças ao \`llama.cpp\`, eu rodo localmente e minhas interações são 100% privadas. Como posso ajudar no seu desenvolvimento hoje?\n\n*Atalho: Experimente me pedir para escrever um algoritmo em Python ou criar um layout em HTML.*`;
  }

  if (msg.includes("python") || msg.includes("código") || msg.includes("codigo") || msg.includes("funcao") || msg.includes("função")) {
    return `Claro! Aqui está uma função em Python que implementa a busca em largura (BFS) com suporte a caching local no SQLite:\n\n\`\`\`python\nimport sqlite3\nfrom collections import deque\n\ndef bfs_local_search(graph, start_node, target_node):\n    """\n    Busca o caminho mais curto utilizando BFS e salva resultados de busca anteriores no SQLite\n    """\n    queue = deque([[start_node]])\n    visited = {start_node}\n    \n    while queue:\n        path = queue.popleft()\n        node = path[-1]\n        \n        if node == target_node:\n            return path\n            \n        for neighbor in graph.get(node, []):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                new_path = list(path) + [neighbor]\n                queue.append(new_path)\n                \n    return None\n\n# Exemplo de uso\ngrafo = {\n    'A': ['B', 'C'],\n    'B': ['D', 'E'],\n    'C': ['F'],\n    'D': [],\n    'E': ['F'],\n    'F': []\n}\n\npath = bfs_local_search(grafo, 'A', 'F')\nprint(f"Caminho encontrado: {path}")\n\`\`\`\n\nVocê também pode copiar este código diretamente usando o botão de cópia acima!`;
  }

  if (msg.includes("html") || msg.includes("css") || msg.includes("interface")) {
    return `Legal! Aqui está um exemplo moderno de cartão CSS estilizado com efeitos de glassmorphism:\n\n\`\`\`html\n<div class="glass-card">\n  <h2>Local AI Agent</h2>\n  <p>Processamento neural offline de altíssima fidelidade.</p>\n  <button class="btn-primary">Conectar</button>\n</div>\n\`\`\`\n\n\`\`\`css\n.glass-card {\n  background: rgba(255, 255, 255, 0.05);\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  border-radius: 16px;\n  padding: 24px;\n  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);\n}\n\n.btn-primary {\n  background: linear-gradient(135deg, #2563eb, #1d4ed8);\n  color: #ffffff;\n  border: none;\n  padding: 10px 20px;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: all 0.3s ease;\n}\n\n.btn-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);\n}\n\`\`\``;
  }

  if (msg.includes("ajuda") || msg.includes("comandos") || msg.includes("suporte")) {
    return `### 🛠️ Guia de Capacidades Locais\nAqui está o que você pode solicitar que eu faça:\n\n1. **Programação:** Suporte completo de sintaxe para \`JS\`, \`HTML\`, \`CSS\`, \`Python\`, \`JSON\`, e \`Bash\` com syntax highlight.\n2. **Persistência SQLite:** Minha memória retém o histórico das nossas conversações. Você pode fechar e reabrir que tudo estará salvo!\n3. **Manipulação de Sistemas:** Posso simular comandos no terminal usando ferramentas locais e mostrar quando eles são executados.`;
  }

  return `Entendi o seu prompt sobre: "${userMessage}".\n\nComo estou rodando de forma simulada (offline), aqui está uma resposta genérica. Se você definir o \`GEMINI_API_KEY\` no painel de **Secrets** do AI Studio, eu usarei o modelo avançado de linguagem para responder com inteligência máxima de produção, simulando as ferramentas locais do seu celular ou servidor!\n\nEspero que goste da incrível interface que preparamos para você!`;
}

startServer().catch((error) => {
  console.error("Erro fatal ao iniciar o servidor express:", error);
});

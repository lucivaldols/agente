/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Local JSON DB file paths to simulate SQLite persistence
const DB_PATH = path.join(process.cwd(), "chat_history.json");

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

interface DatabaseSchema {
  conversations: Record<string, Conversation>;
  activeConversationId: string;
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
          ai_response: "Olá! Sou o seu **Agente de IA Local** rodando via `llama.cpp` + `SQLite`. O que você gostaria de explorar hoje? Posso ajudar com códigos, análise de logs, salvamento de arquivos e muito mais! 🧠✨",
          timestamp: new Date().toISOString(),
          tools: [
            { icon: "🧠", label: "Memória SQLite inicializada" },
            { icon: "⚡", label: "llama.cpp carregado (int4)" }
          ]
        }
      ]
    }
  },
  activeConversationId: "default-session"
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

async function startServer() {
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
    const { message, conversationId, file } = req.body;
    if (!message) {
      return res.status(400).json({ error: "A mensagem é obrigatória." });
    }

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

    // Auto update title if still default or empty list
    if (conversation.messages.length === 0) {
      conversation.title = message.substring(0, 40) + (message.length > 40 ? "..." : "");
    }

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

    let aiReply = "";

    try {
      if (ai) {
        // Query Gemini with system context simulating a local llama.cpp environment
        const systemInstruction = `
          Você é o Agente de IA Local de Alta Performance rodando no servidor Linux do usuário via llama.cpp + banco de dados SQLite.
          Suas respostas são enviadas para uma interface de chat premium estilo ChatGPT/OpenWebUI.
          
          Regras de Resposta:
          1. Responda em português de forma natural, amigável e profissional.
          2. Suas respostas devem conter formatação rica em Markdown (títulos, negrito, tabelas) quando apropriado.
          3. Caso responda com códigos (de qualquer linguagem como Javascript, HTML, CSS, Python, JSON, Bash, Shell), utilize perfeitamente blocos markdown de código, especificando a respectiva linguagem (ex: \`\`\`python ... \`\`\`).
          4. Adote um tom de assistente local rodando diretamente na máquina física dele. Se ele pedir para gerar arquivos ou executar tarefas do sistema, aja como se você tivesse executado ou tivesse suporte total de sistema operacional móvel/servidor.
        `;

        let contents: any = message;
        if (file && file.data) {
          // If a file is uploaded, feed it to Gemini too as custom context or inline data
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
            // Text or code file
            contents = `O usuário anexou o arquivo "${file.name}" (conteúdo: "${file.data}").\nMensagem: ${message}`;
          }
        }

        const genAIResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          }
        });

        aiReply = genAIResponse.text || "Sem resposta gerada.";
      } else {
        // Mock fallback to allow usage even when no core API key is given
        console.log("Simulando resposta local offline...");
        aiReply = getMockLocalResponse(message, file);
      }
    } catch (error: any) {
      console.error("Erro ao chamar o modelo:", error);
      aiReply = `⚠️ **Erro de Comunicação Local**\nOcorreu um erro ao processar o seu prompt no llama.cpp local.\n\nDetalhes do erro: \`${error.message || error}\`\n\n*Nota: Certifique-se de que o backend está ativo e o arquivo do modelo GGUF foi carregado corretamente.*`;
    }

    // Add random basic tools if none were explicitly triggered to demonstrate the premium tool cards feature
    if (simulatedTools.length === 0 && Math.random() > 0.6) {
      const defaultTools = [
        { icon: "🧠", label: "Memória SQLite atualizada" },
        { icon: "⚙️", label: "Contexto recuperado do SQLite" },
        { icon: "⚡", label: "llama.cpp velocidade: 42.5 Tok/s" }
      ];
      const randomTool = defaultTools[Math.floor(Math.random() * defaultTools.length)];
      simulatedTools.push(randomTool);
    }

    // Save message pair in database
    const newMsg: Message = {
      id: "msg_" + Math.random().toString(36).substr(2, 9),
      user_message: message,
      ai_response: aiReply,
      timestamp: new Date().toISOString(),
      tools: simulatedTools.length > 0 ? simulatedTools : undefined,
      file: file ? { name: file.name, size: file.size, type: file.type } : undefined
    };

    conversation.messages.push(newMsg);
    writeDB(db);

    // Return exact model structure {"reply": "..."} plus extra visual fields
    res.json({
      reply: aiReply,
      id: newMsg.id,
      tools: newMsg.tools,
      file: newMsg.file
    });
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

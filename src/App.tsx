/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Paperclip,
  X,
  Sparkles,
  Code,
  Copy,
  Check,
  Terminal,
  Brain,
  ChevronRight,
  Info,
  Settings,
  Square,
  Plus,
  Trash2,
  Cpu,
  Database,
  Wifi,
  Award,
  BookOpen,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  MessageSquare,
  ArrowRight
} from "lucide-react";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCard } from "./components/ToolCard";
import { Conversation, Message, FileData, UserProgress } from "./types";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Conversational state variables
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return localStorage.getItem("active_conversation_id") || "default-session";
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [fileDraft, setFileDraft] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  // Progress profile metrics
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);

  // Configuration variables
  const [configPort, setConfigPort] = useState<number>(() => {
    const saved = localStorage.getItem("llama_port");
    return saved ? parseInt(saved, 10) : 8080;
  });
  const [configModel, setConfigModel] = useState<string>(() => {
    return localStorage.getItem("llama_model") || "tinyllama";
  });

  // Keep configuration in local storage
  useEffect(() => {
    localStorage.setItem("llama_port", configPort.toString());
  }, [configPort]);

  useEffect(() => {
    localStorage.setItem("llama_model", configModel);
  }, [configModel]);

  // DOM Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  // Load user progress profile from SQLite database
  const fetchProgress = async () => {
    try {
      const res = await fetch("/api/user-progress");
      if (res.ok) {
        const data = await res.json();
        setUserProgress(data);
      }
    } catch (err) {
      console.error("Erro ao obter progresso do SQLite:", err);
    }
  };

  // Reset progress profile
  const handleResetProgress = async () => {
    if (!confirm("Tem certeza de que deseja redefinir o seu progresso de aprendizado no SQLite?")) {
      return;
    }
    try {
      const res = await fetch("/api/user-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "Lógica Geral",
          level: "iniciante",
          mistakes: [],
          achievements: ["Iniciou a jornada de aprendizado"],
          notes: "Ficha de progresso reiniciada pelo usuário."
        })
      });
      if (res.ok) {
        const data = await res.json();
        setUserProgress(data);
      }
    } catch (err) {
      console.error("Erro ao resetar progresso:", err);
    }
  };

  // Load chat session lists
  const fetchConversations = async (selectActiveId?: string) => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        if (data.length > 0) {
          const savedActiveId = localStorage.getItem("active_conversation_id");
          const exists = data.some((c: any) => c.id === savedActiveId);
          const defaultId = selectActiveId || (exists && savedActiveId ? savedActiveId : data[0].id);
          setActiveConversationId(defaultId);
        } else {
          setActiveConversationId("default-session");
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    }
  };

  // Load active conversation message content
  const fetchHistory = async (convId: string) => {
    try {
      const res = await fetch(`/history?conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  // Pre-boot hooks
  useEffect(() => {
    fetchConversations();
    fetchProgress();
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Update session selection
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("active_conversation_id", activeConversationId);
      if (activeAbortControllerRef.current) {
        console.log("[App] Abortando conexão ativa para mudar de conversa.");
        try {
          activeAbortControllerRef.current.abort();
        } catch (e) {}
      }
      fetchHistory(activeConversationId);
    }
  }, [activeConversationId]);

  // Smooth auto-scroll behavior
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Self-height resizing textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputMessage]);

  // Add a new conversation session
  const handleNewChat = async () => {
    try {
      const resp = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Conversa ${conversations.length + 1}` })
      });
      if (resp.ok) {
        const newSession = await resp.json();
        setActiveConversationId(newSession.id);
        fetchConversations(newSession.id);
        setMessages([]);
      }
    } catch (err) {
      console.error("Erro ao criar nova conversa:", err);
    }
  };

  // Delete a specific conversation session
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const resp = await fetch(`/api/conversations/${id}`, {
        method: "DELETE"
      });
      if (resp.ok) {
        const nextId = id === activeConversationId ? undefined : activeConversationId;
        fetchConversations(nextId);
      }
    } catch (err) {
      console.error("Erro ao deletar conversa:", err);
    }
  };

  // Drag-and-drop mechanics definition
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const parseFileInput = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setFileDraft({
        name: file.name,
        size: file.size,
        type: file.type,
        data: reader.result as string
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseFileInput(e.dataTransfer.files[0]);
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseFileInput(e.target.files[0]);
    }
  };

  // Send message and stream result response from backend
  const handleSendMessage = async () => {
    if (isLoading) return;

    const now = Date.now();
    if (now - lastSendTimeRef.current < 800) {
      console.warn("[App] Envio rejeitado por debounce de proteção.");
      return;
    }
    lastSendTimeRef.current = now;

    const messageText = inputMessage.trim();
    if (!messageText && !fileDraft) return;

    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch (e) {}
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    const temporaryUserMsg: Message = {
      id: msgId,
      user_message: messageText || `Arquivo anexo: ${fileDraft?.name}`,
      ai_response: "",
      timestamp: new Date().toISOString(),
      file: fileDraft ? { ...fileDraft, data: undefined } : undefined
    };

    setMessages((prev) => [...prev, temporaryUserMsg]);
    setInputMessage("");
    const filePayload = fileDraft;
    setFileDraft(null);
    setIsLoading(true);

    let accumulatedResponse = "";

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText || "Analise o arquivo anexo",
          conversationId: activeConversationId,
          file: filePayload,
          port: configPort,
          model: configModel,
          messageId: msgId,
          streamId: "stream_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Servidor respondeu com erro ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) {
        throw new Error("Canal de stream indisponível.");
      }

      let doneReading = false;
      let currentTools: any[] = [];
      let buffer = "";

      while (!doneReading) {
        const { value, done } = await reader.read();
        doneReading = done;
        if (value) {
          buffer += decoder.decode(value, { stream: !doneReading });
          
          let lineEndIndex;
          while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, lineEndIndex).trim();
            buffer = buffer.slice(lineEndIndex + 1);

            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(dataStr);
                
                if (parsed.type === "tools") {
                  currentTools = parsed.tools || [];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId
                        ? { ...m, tools: currentTools }
                        : m
                    )
                  );
                } else if (parsed.type === "content") {
                  accumulatedResponse += parsed.content;
                  const visibleResponse = accumulatedResponse.split("[UPDATE_PROGRESS]")[0];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId
                        ? { ...m, ai_response: visibleResponse }
                        : m
                    )
                  );
                } else if (parsed.type === "done") {
                  const finalReply = parsed.reply || accumulatedResponse;
                  const finalTools = parsed.tools || currentTools;
                  const visibleFinalReply = finalReply.split("[UPDATE_PROGRESS]")[0];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId
                        ? {
                            ...m,
                            id: parsed.id || m.id,
                            ai_response: visibleFinalReply,
                            tools: finalTools
                          }
                        : m
                    )
                  );
                }
              } catch (e) {
                // Skip parsing split issues
              }
            }
          }
        }
      }

      fetchConversations(activeConversationId);
      fetchProgress();
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[App] Requisição interrompida visualmente.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  ai_response: accumulatedResponse 
                    ? accumulatedResponse.split("[UPDATE_PROGRESS]")[0] + "\n\n*🛑 Stream interrompido pelo usuário*"
                    : "*🛑 Stream interrompido pelo usuário*"
                }
              : m
          )
        );
      } else {
        console.error("Erro na comunicação:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  ai_response: accumulatedResponse
                    ? accumulatedResponse.split("[UPDATE_PROGRESS]")[0] + `\n\n⚠️ **Conexão interrompida**\nDetalhes: \`${err.message || err}\``
                    : `⚠️ **Falha na conexão com llama.cpp**\nVerifique se o seu servidor local llama-server está ativo na porta \`${configPort}\`.\n\nDetalhes: \`${err.message || err}\``
                }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }
    }
  };

  // Keyboard events
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Visual copy triggers
  const handleCopyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const starterPrompts = [
    {
      title: "Algoritmo em Python",
      prompt: "Escreva uma função clássica em Python para ordenar uma lista usando o QuickSort, bem documentada.",
      icon: <Code className="text-blue-400" size={14} />
    },
    {
      title: "Comando Shell",
      prompt: "Como posso grep-ar arquivos recursively por um IP específico no diretório de logs /var/log/nginx/ no Linux?",
      icon: <Terminal className="text-emerald-400" size={14} />
    },
    {
      title: "SQLite & Llama",
      prompt: "Explique como funciona a integração de persistência e memória SQLite local com o llama.cpp.",
      icon: <Brain className="text-indigo-400" size={14} />
    }
  ];

  return (
    <div id="ai-studio-root" className="flex h-screen bg-[#0a0a0a] font-sans text-gray-200 overflow-hidden">
      
      {/* LEFT COLUMN: Clean Integrated Configuration & History Panel */}
      <aside className="hidden lg:flex flex-col w-80 xl:w-96 bg-[#0f0f11] border-r border-white/5 flex-shrink-0 overflow-y-auto">
        
        {/* Title logo space */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-inner">
              <Cpu size={16} className="text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display text-white tracking-wide">Agente de IA</h1>
              <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">Ambiente Local Privado</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
            <span className="text-[9px] font-mono font-semibold text-emerald-400">ONLINE</span>
          </div>
        </div>

        <div className="p-4 space-y-6 flex-1">
          {/* SECTION 1: Configuração do llama.cpp & Endpoint */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-gray-450 tracking-wider font-mono flex items-center gap-1.5">
                <Settings size={12} className="text-indigo-400" /> Servidor llama.cpp
              </span>
              <span className="text-[9px] font-mono text-gray-500">v1/chat/completions</span>
            </div>

            <div className="bg-[#151518] border border-white/5 rounded-xl p-3.5 space-y-4 shadow-sm">
              {/* Port selector */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium text-gray-400 font-mono">Porta do Servidor:</span>
                  <span className="text-[10px] font-mono text-indigo-400 px-1 rounded bg-indigo-500/5">localhost</span>
                </div>
                
                <div className="flex gap-1.5">
                  {[8080, 9090, 3000].map((portVal) => (
                    <button
                      key={portVal}
                      type="button"
                      onClick={() => setConfigPort(portVal)}
                      className={`flex-1 py-1 text-[10px] font-mono font-medium rounded border transition cursor-pointer
                        ${configPort === portVal
                          ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
                          : "bg-[#1b1b1f] border-white/5 text-gray-400 hover:text-gray-200"}`}
                    >
                      {portVal}
                    </button>
                  ))}
                </div>

                <input
                  type="number"
                  value={configPort}
                  onChange={(e) => setConfigPort(parseInt(e.target.value, 10) || 8080)}
                  placeholder="Porta Personalizada"
                  className="w-full bg-[#1b1b1f] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 font-mono"
                  min="1"
                  max="65535"
                />
              </div>

              {/* Model identifier */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium text-gray-400 font-mono">Modelo GGUF (Identidade):</span>
                  <span className="text-[9px] font-mono text-amber-400 uppercase">GGUF</span>
                </div>

                <div className="flex gap-1.5">
                  {["tinyllama", "qwen2-1.5b", "llama-3-8b"].map((modelVal) => (
                    <button
                      key={modelVal}
                      type="button"
                      onClick={() => setConfigModel(modelVal)}
                      className={`flex-1 py-1 text-[10px] font-medium rounded border transition cursor-pointer truncate
                        ${configModel === modelVal
                          ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
                          : "bg-[#1b1b1f] border-white/5 text-gray-400 hover:text-gray-200"}`}
                    >
                      {modelVal}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={configModel}
                  onChange={(e) => setConfigModel(e.target.value)}
                  placeholder="Nome do Modelo"
                  className="w-full bg-[#1b1b1f] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 font-mono"
                />
              </div>

              {/* URL Display */}
              <div className="pt-2 border-t border-white/[0.03] text-[9.5px] font-mono text-gray-500 flex justify-between">
                <span>URL Endpoint:</span>
                <span className="text-gray-400">http://127.0.0.1:{configPort}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Conversas & Histórico (SQLite) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-gray-450 tracking-wider font-mono flex items-center gap-1.5">
                <MessageSquare size={12} className="text-indigo-400" /> Conversas Recentes
              </span>
              
              {/* Quick new chat trigger */}
              <button
                onClick={handleNewChat}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition cursor-pointer flex items-center justify-center"
                title="Nova conversa"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* List container */}
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {conversations.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-gray-500 font-mono">
                  Nenhum histórico ativo
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition select-none text-xs font-medium
                        ${isActive
                          ? "bg-white/5 text-white"
                          : "text-gray-400 hover:bg-[#151518] hover:text-gray-200"}`}
                    >
                      <MessageSquare size={12} className={isActive ? "text-indigo-400 flex-shrink-0" : "text-gray-550 flex-shrink-0"} />
                      <span className="flex-1 truncate">{conv.title}</span>
                      <button
                        onClick={(e) => handleDeleteChat(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer flex-shrink-0"
                        title="Deletar sessão"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SECTION 3: Evolução do Aluno */}
          {userProgress && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-gray-450 tracking-wider font-mono flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-emerald-400" /> Evolução de Lógica
                </span>
                
                <button
                  onClick={handleResetProgress}
                  className="p-1 text-gray-550 hover:text-rose-405 hover:bg-rose-500/5 rounded transition cursor-pointer"
                  title="Resetar evolução"
                >
                  <RotateCcw size={11} />
                </button>
              </div>

              <div className="bg-[#151518] border border-white/5 rounded-xl p-3.5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                    <BookOpen size={11} className="text-gray-500" /> Nível do aluno:
                  </span>
                  
                  {userProgress.level === "iniciante" && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md uppercase border border-emerald-500/20">
                      Iniciante
                    </span>
                  )}
                  {userProgress.level === "intermediário" && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md uppercase border border-blue-500/20">
                      Intermediário
                    </span>
                  )}
                  {userProgress.level === "avançado" && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-md uppercase border border-amber-500/20">
                      Avançado
                    </span>
                  )}
                </div>

                {/* Progress Visual Mini-Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full
                        ${userProgress.level === "avançado" ? "bg-amber-500 w-full" : userProgress.level === "intermediário" ? "bg-blue-500 w-2/3" : "bg-emerald-500 w-1/3"}`}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>Tópico: {userProgress.topic || "Lógica"}</span>
                    <span>{userProgress.level === "avançado" ? "100%" : userProgress.level === "intermediário" ? "66%" : "33%"}</span>
                  </div>
                </div>

                {/* Badges and achievements */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <div className="bg-[#1c1c21] p-1.5 rounded border border-white/5 flex flex-col justify-center">
                    <span className="text-[8px] text-gray-500 font-mono uppercase">🏆 Conquistas</span>
                    <span className="text-[11px] font-bold text-gray-250 mt-0.5 flex items-center gap-1">
                      <Award size={10} className="text-amber-400" /> {userProgress.achievements?.length || 0}
                    </span>
                  </div>
                  <div className="bg-[#1c1c21] p-1.5 rounded border border-white/5 flex flex-col justify-center">
                    <span className="text-[8px] text-gray-500 font-mono uppercase">⚠️ Erros</span>
                    <span className="text-[11px] font-bold text-gray-250 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={10} className={userProgress.mistakes?.length > 0 ? "text-rose-450" : "text-gray-500"} /> {userProgress.mistakes?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Database Sync Legend Footer */}
        <div className="p-4 border-t border-white/5 bg-[#0f0f11] text-[10px] font-mono text-gray-500 flex justify-between items-center">
          <span className="flex items-center gap-1"><Database size={11} className="text-gray-600" /> SQLite Ativo</span>
          <span>RAM / CPU local</span>
        </div>
      </aside>

      {/* RIGHT COLUMN: Minimalist & Clean Chat Canvas */}
      <main className="flex-1 flex flex-col h-full bg-[#0a0a0a] relative overflow-hidden" onDragEnter={handleDrag}>
        
        {/* Dynamic Drag Filter Overlay */}
        {dragActive && (
          <div
            className="absolute inset-0 bg-indigo-600/10 backdrop-blur-sm border-2 border-dashed border-indigo-500 rounded-2xl m-4 flex flex-col items-center justify-center z-30 transition-all cursor-copy"
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="w-12 h-12 bg-indigo-500/20 border border-indigo-500 flex items-center justify-center rounded-xl mb-2 text-indigo-400 animate-bounce">
              <Paperclip size={20} />
            </div>
            <p className="font-display font-semibold text-sm text-white">Solte o arquivo aqui</p>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Disponível para anexar de forma privada no chat</p>
          </div>
        )}

        {/* Spacious Layout Top Header */}
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a]/85 backdrop-blur-md z-20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="text-indigo-400" size={14} />
            <span className="text-xs font-semibold tracking-wide font-display text-white">
              {conversations.find((c) => c.id === activeConversationId)?.title || "ChatGPT Local"}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse ml-1.5" />
          </div>

          <div className="flex items-center gap-4">
            {/* Port & Model Legend for MD screens */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-gray-400">
              <span className="bg-[#121214] px-2 py-0.5 rounded border border-white/5 text-indigo-400 font-medium">Porta: {configPort}</span>
              <span className="bg-[#121214] px-2 py-0.5 rounded border border-white/5 text-amber-400 font-medium font-sans">Modelo: {configModel}</span>
            </div>
            
            {/* Quick action to add new conversation in high resolution */}
            <button
              onClick={handleNewChat}
              className="lg:hidden p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition flex items-center gap-1.5 text-xs font-medium border border-white/5"
            >
              <Plus size={13} />
              <span>Novo Chat</span>
            </button>
          </div>
        </header>

        {/* Scrollable conversation history */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-12 space-y-6">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            
            {messages.length === 0 ? (
              /* ONBOARDING FLOW PANEL if zero text units exist */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="py-16 text-center space-y-6"
              >
                <div className="inline-flex justify-center items-center">
                  <div className="w-11 h-11 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
                    <Brain size={20} className="animate-pulse" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-lg md:text-xl font-bold font-display text-white tracking-tight">
                    Agente de IA Offline
                  </h2>
                  <p className="text-gray-400 text-xs max-w-sm mx-auto leading-relaxed">
                    Sua interface local privada integrada com o llama.cpp local e monitor de progresso em SQLite.
                  </p>
                </div>

                {/* Suggestions layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto pt-4 text-left">
                  {starterPrompts.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setInputMessage(item.prompt)}
                      className="group p-3.5 bg-[#121215] border border-white/5 rounded-xl hover:border-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="p-1.5 bg-[#1a1a20] rounded border border-white/5">
                          {item.icon}
                        </div>
                        <ArrowRight size={12} className="text-gray-600 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-gray-200">{item.title}</h4>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {item.prompt}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5 text-[9px] font-mono text-gray-500">
                  <Info size={9} />
                  <span>Nenhum dado é enviado para a nuvem externa</span>
                </div>
              </motion.div>
            ) : (
              /* ACTIVE STREAM MESSAGE DISPLAY ROW */
              <div className="space-y-6">
                {messages.map((item) => (
                  <div key={item.id} className="space-y-4 animate-fade-in">
                    
                    {/* User speech layout (Right alignment) */}
                    <div className="flex justify-end">
                      <div className="bg-[#151518] border border-white/5 px-4.5 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] text-xs md:text-sm leading-relaxed text-gray-150 shadow-sm flex flex-col gap-1.5">
                        <div className="whitespace-pre-wrap selection:bg-indigo-550 select-text">
                          {item.user_message}
                        </div>
                        
                        {item.file && (
                          <div className="mt-1 inline-flex items-center gap-1 bg-black/20 text-[10px] font-mono py-0.5 px-1.5 rounded border border-white/5">
                            <span>📎 {item.file.name}</span>
                            <span className="opacity-55 text-[9px]">({Math.round(item.file.size / 1024)} KB)</span>
                          </div>
                        )}
                        
                        <span className="text-[8.5px] font-mono text-gray-500 self-end">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {/* AI Speech layout (Left alignment) */}
                    {item.ai_response && (
                      <div className="flex gap-3 items-start mr-8">
                        <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-800/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-xs font-semibold shadow-sm select-none">
                          IA
                        </div>

                        <div className="flex-1 space-y-3.5">
                          {/* Markdown parsing canvas output */}
                          <MarkdownRenderer content={item.ai_response} />

                          {/* Built-in local tool triggers visual indicators */}
                          {item.tools && item.tools.length > 0 && (
                            <div className="pt-1 flex flex-wrap gap-1.5">
                              {item.tools.map((tc, idx) => (
                                <ToolCard key={idx} icon={tc.icon} label={tc.label} text={tc.text} />
                              ))}
                            </div>
                          )}

                          {/* Quick details copy layout bar */}
                          <div className="flex items-center gap-4 pt-1.5 border-t border-white/[0.03] text-[10px] font-mono select-none">
                            <button
                              onClick={() => handleCopyMessage(item.ai_response, item.id)}
                              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition cursor-pointer"
                              title="Copiar texto"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check size={11} className="text-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>
                            <span className="text-gray-600 ml-auto">
                              {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Thinking / Loader visual indicator details */}
                {isLoading && (
                  <div className="flex gap-3 items-start mr-8 animate-pulse">
                    <div className="w-7 h-7 rounded-lg bg-[#121215] border border-white/5 flex items-center justify-center text-gray-500 flex-shrink-0 text-xs font-semibold select-none">
                      IA
                    </div>
                    <div className="flex-1 bg-[#121215]/40 border border-white/[0.01] rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                        <span>Agente gerando resposta...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Sleek footer input bar area */}
        <div className="px-6 py-4 md:px-12 flex-shrink-0 z-10 border-t border-white/[0.02] bg-[#0a0a0a]">
          <div className="max-w-3xl mx-auto w-full space-y-3">
            
            {/* Attachment preview if standard draft payload is present */}
            {fileDraft && (
              <div className="inline-flex items-center gap-2.5 bg-[#151518] border border-white/10 rounded-xl px-2.5 py-1.5 animate-fade-in shadow-lg">
                <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 flex items-center justify-center">
                  <Paperclip size={12} />
                </div>
                <div className="min-w-0 pr-1">
                  <p className="text-[10px] font-semibold text-gray-250 truncate max-w-xs">{fileDraft.name}</p>
                  <p className="text-[9px] text-gray-500 font-mono mt-0.5">{Math.round(fileDraft.size / 1024)} KB</p>
                </div>
                <button
                  onClick={() => setFileDraft(null)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Excluir arquivo anexo"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Core input card layout containing trigger buttons */}
            <div className="relative bg-[#121214] border border-white/5 rounded-xl p-2 shadow-inner focus-within:border-white/15 transition-all">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pergunte ao seu Agente Local ou arraste um arquivo anexo aqui..."
                className="w-full bg-transparent border-0 text-gray-100 placeholder-gray-500 focus:ring-0 outline-none text-xs md:text-sm resize-none py-1.5 px-1 focus:outline-none min-h-[30px] max-h-[180px] select-text"
                disabled={isLoading}
              />

              <div className="h-8 flex items-center justify-between border-t border-white/[0.02] pt-1.5 mt-1">
                
                {/* Manual file attach trigger */}
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 hover:bg-white/5 active:scale-95 text-gray-450 hover:text-gray-200 rounded transition cursor-pointer flex items-center gap-1 text-[10px] uppercase font-mono tracking-wide"
                    title="Anexar arquivo"
                  >
                    <Paperclip size={13} />
                    <span>Anexar</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleManualUpload}
                    className="hidden"
                  />
                </div>

                {/* Main submit button with stopping trigger control integrated */}
                {isLoading ? (
                  <button
                    onClick={() => {
                      if (activeAbortControllerRef.current) {
                        try {
                          activeAbortControllerRef.current.abort();
                        } catch (e) {}
                      }
                    }}
                    className="h-6 px-3 rounded-md flex items-center justify-center gap-1.5 text-[10.5px] font-semibold select-none transition cursor-pointer bg-rose-600 hover:bg-rose-700 text-white shadow active:scale-95 duration-150"
                    title="Parar de gerar"
                  >
                    <Square size={10} className="fill-white" />
                    <span>Parar</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() && !fileDraft}
                    className={`h-6 px-3 rounded-md flex items-center justify-center gap-1.5 text-[10.5px] font-semibold select-none transition cursor-pointer
                      ${(!inputMessage.trim() && !fileDraft)
                        ? "bg-white/5 text-gray-500 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow active:scale-95"}`}
                  >
                    <Send size={10} />
                    <span>Enviar</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[9px] text-center text-gray-600 font-mono tracking-wide selection:bg-transparent">
              llama.cpp local: <strong className="text-indigo-400 font-bold">{configModel}.gguf</strong> • Porta: <strong className="text-indigo-400 font-bold">{configPort}</strong> • SQLite Memória • Privado
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

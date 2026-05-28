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
  ArrowRight,
  Sliders,
  ChevronLeft,
  ChevronDown
} from "lucide-react";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCard } from "./components/ToolCard";
import { Conversation, Message, FileData, UserProgress } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { fetchEventSource } from "@microsoft/fetch-event-source";

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
  
  // UI Panels state
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(true); // Seletor de lado ajustável
  const [isHistoryDropdownOpen, setIsHistoryDropdownOpen] = useState<boolean>(false);

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
        setIsHistoryDropdownOpen(false);
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
    if (now - lastSendTimeRef.current < 500) {
      console.warn("[App] Envio rejeitado por debounce de proteção contra cliques rápidos.");
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
    let currentTools: any[] = [];
    let isCompleted = false;

    try {
      await fetchEventSource("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({
          message: messageText || "Analise o arquivo anexo",
          conversationId: activeConversationId,
          file: filePayload,
          port: configPort,
          model: configModel,
          messageId: msgId,
          streamId: "stream_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
        }),
        signal: abortController.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`Servidor respondeu com código de erro ${response.status}`);
          }
        },
        onmessage(msg) {
          const dataStr = msg.data;
          if (dataStr === "[DONE]") return;

          try {
            const parsed = JSON.parse(dataStr);
            
            if (parsed.type === "tools") {
              currentTools = parsed.tools || [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, tools: currentTools } : m
                )
              );
            } else if (parsed.type === "content") {
              accumulatedResponse += parsed.content;
              const visibleResponse = accumulatedResponse.split("[UPDATE_PROGRESS]")[0];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, ai_response: visibleResponse } : m
                )
              );
            } else if (parsed.type === "done") {
              isCompleted = true;
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
            // Ignore parse errors from chunk boundaries
          }
        },
        onclose() {
          console.log("[App] Canais SSE concluídos com sucesso.");
          isCompleted = true;
          abortController.abort();
        },
        onerror(err) {
          if (isCompleted) {
            return;
          }
          console.error("[App] Erro capturado no canal do SSE:", err);
          throw err; // Propaga o erro para impedir ciclos infinitos do fetch-event-source
        }
      });

      fetchConversations(activeConversationId);
      fetchProgress();
    } catch (err: any) {
      if (err.name === "AbortError" || err.message === "AbortError" || err.message?.includes("user aborted")) {
        if (isCompleted) {
          console.log("[App] Stream finalizado com sucesso.");
          return;
        }
        console.log("[App] Geração interrompida voluntariamente pelo usuário.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  ai_response: accumulatedResponse 
                    ? accumulatedResponse.split("[UPDATE_PROGRESS]")[0] + "\n\n*🛑 Resposta interrompida.*"
                    : "*🛑 Resposta interrompida pelo usuário.*"
                }
              : m
          )
        );
      } else {
        console.error("Erro de canal de streaming:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  ai_response: accumulatedResponse
                    ? accumulatedResponse.split("[UPDATE_PROGRESS]")[0] + `\n\n⚠️ **Conexão perdida**\nO canal com o backend local foi cortado. Detalhes: \`${err.message || err}\``
                    : `⚠️ **Falha ao conectar com o Servidor Local GGUF**\nCertifique-se de que o seu \`llama-server\` local está ativo na porta \`${configPort}\`.\n\nDetalhes: \`${err.message || err}\``
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
      icon: <Code className="text-indigo-400" size={14} />
    },
    {
      title: "Comando Shell",
      prompt: "Como posso grep-ar arquivos recursively por um IP específico no diretório de logs /var/log/nginx/ no Linux?",
      icon: <Terminal className="text-emerald-400" size={14} />
    },
    {
      title: "SQLite & Llama",
      prompt: "Explique como funciona a integração de persistência e memória SQLite local com o llama.cpp.",
      icon: <Brain className="text-amber-400" size={14} />
    }
  ];

  return (
    <div id="ai-studio-root" className="flex h-screen bg-[#070708] font-sans text-gray-200 overflow-hidden leading-relaxed">
      
      {/* CENTRAL MAIN VIEW: Focused, Clean & Private Chat Canvas */}
      <main className="flex-1 flex flex-col h-full bg-[#070708] relative overflow-hidden" onDragEnter={handleDrag}>
        
        {/* Drag File Overlay */}
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
            <p className="font-semibold text-sm text-white">Solte o arquivo para anexar</p>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">O arquivo será lido com segurança na sessão</p>
          </div>
        )}

        {/* Top Minimal Header */}
        <header className="h-14 border-b border-white/[0.04] flex items-center justify-between px-4 md:px-8 bg-[#0a0a0c]/85 backdrop-blur-md z-20 flex-shrink-0 select-none">
          
          {/* Seção Esquerda: Seletor de Sessões Minimalista (dropdown) */}
          <div className="flex items-center gap-3 relative">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Sparkles size={14} className="animate-pulse" />
              </div>
              <span className="text-xs font-semibold text-white tracking-wide font-display hidden sm:inline">IA Local</span>
            </div>

            <span className="text-gray-600">|</span>

            {/* Dropdown de Históricos para eliminar barra fixa lateral */}
            <div className="relative">
              <button
                onClick={() => setIsHistoryDropdownOpen(!isHistoryDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 rounded-lg text-xs font-medium text-gray-300 transition-all cursor-pointer active:scale-95"
              >
                <MessageSquare size={13} className="text-indigo-400" />
                <span className="max-w-[120px] md:max-w-[200px] truncate">
                  {conversations.find((c) => c.id === activeConversationId)?.title || "Selecione o Chat"}
                </span>
                <ChevronDown size={11} className={`text-gray-500 transition-transform duration-200 ${isHistoryDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {isHistoryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsHistoryDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 mt-2 w-72 bg-[#0c0c0e] border border-white/[0.08] shadow-2xl rounded-xl z-40 p-2 overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-2 pb-1.5 border-b border-white/[0.03] mb-1">
                        <span className="text-[10px] font-bold text-gray-500 font-mono tracking-wider uppercase">HISTÓRICO ATIVO</span>
                        <button
                          onClick={handleNewChat}
                          className="flex items-center gap-1 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-semibold rounded border border-indigo-500/25 transition cursor-pointer"
                        >
                          <Plus size={10} />
                          <span>Novo Chat</span>
                        </button>
                      </div>

                      <div className="space-y-0.5 max-h-64 overflow-y-auto">
                        {conversations.length === 0 ? (
                          <div className="text-center py-6 text-[11px] text-gray-500 font-mono">Nenhuma conversa recente</div>
                        ) : (
                          conversations.map((conv) => {
                            const isCurrent = conv.id === activeConversationId;
                            return (
                              <div
                                key={conv.id}
                                onClick={() => {
                                  setActiveConversationId(conv.id);
                                  setIsHistoryDropdownOpen(false);
                                }}
                                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none text-xs
                                  ${isCurrent ? "bg-white/5 text-white font-medium" : "text-gray-400 hover:bg-[#121215] hover:text-gray-200"}`}
                              >
                                <span className="truncate flex-1 pr-2">{conv.title}</span>
                                <button
                                  onClick={(e) => handleDeleteChat(conv.id, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer flex-shrink-0"
                                  title="Deletar sessão"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Central status / Info */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-gray-500 font-mono tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" /> Llama.cpp Local Ativo
            </span>
          </div>

          {/* Seção Direita: Botão de abrir/fechar Configuração e Perfil */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border
                ${isConfigOpen
                  ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/20"
                  : "bg-white/[0.03] text-gray-400 border-white/5 hover:text-gray-200 hover:bg-white/[0.07]"}`}
              title="Configurações & Painel de Evolução"
            >
              <Sliders size={13} />
              <span>Painel</span>
            </button>
          </div>
        </header>

        {/* Scrollable conversation history */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8 space-y-6">
          <div className="max-w-2xl mx-auto w-full space-y-6">
            
            {messages.length === 0 ? (
              /* ONBOARDING FLOW PANEL if zero text units exist */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="py-16 text-center space-y-6"
              >
                <div className="inline-flex justify-center items-center mb-1">
                  <div className="w-11 h-11 bg-indigo-650/10 border border-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400">
                    <Brain size={20} className="animate-pulse" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base md:text-lg font-bold font-display text-white tracking-tight">
                    Agente de IA Offline & Tutor de Lógica
                  </h2>
                  <p className="text-gray-400 text-xs max-w-sm mx-auto leading-relaxed">
                    Sua interface limpa e privada integrada com llama.cpp / GGUF local e suporte a progresso em SQLite.
                  </p>
                </div>

                {/* Suggestions layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto pt-6 text-left">
                  {starterPrompts.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setInputMessage(item.prompt)}
                      className="group p-3.5 bg-[#0b0b0d] border border-white/[0.04] rounded-xl hover:border-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="p-1 px-1.5 bg-[#121215] rounded border border-white/5">
                          {item.icon}
                        </div>
                        <ArrowRight size={11} className="text-gray-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-semibold text-gray-300">{item.title}</h4>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                          {item.prompt}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5 text-[9px] font-mono text-gray-600 pt-2 select-none">
                  <Info size={9} />
                  <span>Todos os dados são armazenados localmente</span>
                </div>
              </motion.div>
            ) : (
              /* ACTIVE STREAM MESSAGE DISPLAY ROW */
              <div className="space-y-6">
                {messages.map((item) => (
                  <div key={item.id} className="space-y-3.5 animate-fade-in select-text">
                    
                    {/* User message block */}
                    <div className="flex justify-end select-text">
                      <div className="bg-[#101013] border border-white/[0.04] px-4 py-2.5 rounded-2xl rounded-tr-xs max-w-[85%] text-xs md:text-[13px] leading-relaxed text-gray-250 shadow-sm flex flex-col gap-1.5">
                        <div className="whitespace-pre-wrap selection:bg-indigo-550 select-text font-serif">
                          {item.user_message}
                        </div>
                        
                        {item.file && (
                          <div className="mt-1 inline-flex items-center gap-1.5 bg-black/30 text-[9.5px] font-mono py-0.5 px-1.5 rounded border border-white/5 select-none">
                            <span>📎 {item.file.name}</span>
                            <span className="opacity-50 text-[8.5px]">({Math.round(item.file.size / 1024)} KB)</span>
                          </div>
                        )}
                        
                        <span className="text-[8.5px] font-mono text-gray-600 self-end select-none">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {/* Assistant message block */}
                    {item.ai_response && (
                      <div className="flex gap-3.5 items-start mr-6 select-text">
                        <div className="w-6 h-6 rounded-md bg-indigo-950/40 border border-indigo-900/35 flex items-center justify-center text-indigo-400 flex-shrink-0 text-[10px] font-bold shadow-sm select-none">
                          IA
                        </div>

                        <div className="flex-1 space-y-3.5 select-text">
                          {/* Markdown parsing content */}
                          <div className="prose prose-invert prose-sm max-w-none text-xs md:text-[13px] leading-relaxed text-gray-200 select-text">
                            <MarkdownRenderer content={item.ai_response} />
                          </div>

                          {/* Render custom tool badges if any */}
                          {item.tools && item.tools.length > 0 && (
                            <div className="pt-0.5 flex flex-wrap gap-1.5 select-none">
                              {item.tools.map((tc, idx) => (
                                <ToolCard key={idx} icon={tc.icon} label={tc.label} text={tc.text} />
                              ))}
                            </div>
                          )}

                          {/* Copy / Details link header */}
                          <div className="flex items-center gap-4 pt-2 border-t border-white/[0.03] text-[9.5px] font-mono select-none">
                            <button
                              onClick={() => handleCopyMessage(item.ai_response, item.id)}
                              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition cursor-pointer font-semibold"
                              title="Copiar texto de resposta"
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

                {/* Thinking / Loader Indicator */}
                {isLoading && (
                  <div className="flex gap-3.5 items-start mr-6 select-none animate-pulse">
                    <div className="w-6 h-6 rounded-md bg-[#0c0c0f] border border-white/[0.04] flex items-center justify-center text-gray-500 flex-shrink-0 text-[10px] font-bold select-none">
                      IA
                    </div>
                    <div className="flex-1 bg-[#0c0c0f]/50 border border-white/[0.02] rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-gray-550">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                        <span>Gerando tokens em tempo real...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Footer input text control area */}
        <div className="p-4 md:p-6 flex-shrink-0 z-10 border-t border-white/[0.02] bg-[#070708]">
          <div className="max-w-2xl mx-auto w-full space-y-3">
            
            {/* Attachment Draft status visual bubble */}
            {fileDraft && (
              <div className="inline-flex items-center gap-2.5 bg-[#0e0e11] border border-white/10 rounded-xl px-2.5 py-1.5 animate-fade-in shadow-xl select-none">
                <div className="p-1 px-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 flex items-center justify-center">
                  <Paperclip size={11} />
                </div>
                <div className="min-w-0 pr-1">
                  <p className="text-[10px] font-semibold text-gray-300 truncate max-w-xs">{fileDraft.name}</p>
                  <p className="text-[9px] text-gray-550 font-mono mt-0.5">{Math.round(fileDraft.size / 1024)} KB</p>
                </div>
                <button
                  onClick={() => setFileDraft(null)}
                  className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Limpar anexo"
                >
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Core Textarea / Attachment Container */}
            <div className="relative bg-[#0d0d10] border border-white/[0.04] rounded-xl p-2 shadow-inner focus-within:border-white/[0.12] transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pergunte ao seu Agente Local ou arraste um anexo aqui..."
                className="w-full bg-transparent border-0 text-gray-100 placeholder-gray-500 focus:ring-0 outline-none text-xs md:text-[13px] resize-none py-1.5 px-1 focus:outline-none min-h-[30px] max-h-[160px] select-text font-serif leading-relaxed"
                disabled={isLoading}
              />

              <div className="h-8 flex items-center justify-between border-t border-white/[0.02] pt-1.5 mt-1 select-none">
                
                {/* Manual File input click handler */}
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 hover:bg-white/5 active:scale-95 text-gray-500 hover:text-gray-350 rounded transition cursor-pointer flex items-center gap-1 text-[9.5px] uppercase font-mono tracking-wide"
                    title="Anexar arquivo privado"
                  >
                    <Paperclip size={12} />
                    <span>Anexar</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleManualUpload}
                    className="hidden"
                  />
                </div>

                {/* Submitting button trigger with Stop feature integrated */}
                {isLoading ? (
                  <button
                    onClick={() => {
                      if (activeAbortControllerRef.current) {
                        try {
                          activeAbortControllerRef.current.abort();
                        } catch (e) {}
                      }
                    }}
                    className="h-6 px-3 rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold select-none transition cursor-pointer bg-rose-600 hover:bg-rose-700 text-white shadow active:scale-95 duration-100"
                    title="Interromper geração"
                  >
                    <Square size={9} className="fill-white animate-pulse" />
                    <span>Parar</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() && !fileDraft}
                    className={`h-6 px-3 rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold select-none transition cursor-pointer
                      ${(!inputMessage.trim() && !fileDraft)
                        ? "bg-white/[0.03] text-gray-600 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow active:scale-95"}`}
                  >
                    <Send size={9} />
                    <span>Enviar</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[9px] text-center text-gray-600 font-mono tracking-wide select-none">
              Iniciado via <strong className="text-gray-500">{configModel}.gguf</strong> • SQLite Ativo • Privado
            </p>
          </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR: Config & Student Evolution Dashboard Drawer */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="hidden lg:flex flex-col bg-[#0b0b0d] border-l border-white/[0.05] h-full flex-shrink-0 z-10 overflow-y-auto select-none"
          >
            {/* Header side drawer */}
            <div className="p-4.5 border-b border-white/[0.04] flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-widest text-indigo-400 font-mono flex items-center gap-1.5">
                <Settings size={13} /> Área de Configuração
              </span>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 text-gray-500 hover:text-white hover:bg-white/5 rounded transition cursor-pointer"
                title="Recolher painel"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="p-4.5 space-y-6 flex-1">
              {/* Llama Server config parameters */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase tracking-wide">
                  <span>Conexão llama.cpp</span>
                  <span>Porta default: 8080</span>
                </div>

                <div className="bg-[#101013] border border-white/[0.04] rounded-xl p-3.5 space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-mono">Porta do Servidor Local:</label>
                    <div className="flex gap-1.5">
                      {[8080, 9090, 3000].map((portVal) => (
                        <button
                          key={portVal}
                          onClick={() => setConfigPort(portVal)}
                          className={`flex-1 py-1 text-[10px] font-mono font-semibold rounded border transition cursor-pointer
                            ${configPort === portVal
                              ? "bg-indigo-500/15 border-indigo-500/35 text-indigo-400"
                              : "bg-[#141418] border-white/5 text-gray-500 hover:text-gray-300"}`}
                        >
                          {portVal}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={configPort}
                      onChange={(e) => setConfigPort(parseInt(e.target.value, 10) || 8080)}
                      className="w-full bg-[#141418] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500/30 font-mono"
                      min="1"
                      max="65535"
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] text-gray-400 font-mono">Modelo GGUF (ID):</label>
                    <div className="flex gap-1.5">
                      {["tinyllama", "qwen2-1.5b", "llama-3-8b"].map((modelVal) => (
                        <button
                          key={modelVal}
                          onClick={() => setConfigModel(modelVal)}
                          className={`flex-1 py-1 text-[10.5px] font-medium rounded border transition cursor-pointer truncate
                            ${configModel === modelVal
                              ? "bg-indigo-500/15 border-indigo-500/35 text-indigo-400"
                              : "bg-[#141418] border-white/5 text-gray-500 hover:text-gray-300"}`}
                        >
                          {modelVal}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={configModel}
                      onChange={(e) => setConfigModel(e.target.value)}
                      className="w-full bg-[#141418] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500/30 font-mono"
                    />
                  </div>

                  <div className="pt-2 border-t border-white/[0.02] text-[9px] font-mono text-gray-600 flex justify-between">
                    <span>Host Endpoint:</span>
                    <span>http://127.0.0.1:{configPort}</span>
                  </div>
                </div>
              </div>

              {/* Student progress profile in SQLite */}
              {userProgress && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase tracking-wide">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={12} className="text-emerald-400" /> Perfil de Evolução
                    </span>
                    <button
                      onClick={handleResetProgress}
                      className="p-1 hover:bg-rose-500/10 rounded transition text-gray-500 hover:text-rose-455 cursor-pointer"
                      title="Reiniciar ficha de evolução"
                    >
                      <RotateCcw size={11} />
                    </button>
                  </div>

                  <div className="bg-[#101013] border border-white/[0.04] rounded-xl p-3.5 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-500 font-mono uppercase">Nível Atual:</span>
                      
                      {userProgress.level === "iniciante" && (
                        <span className="text-[8px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md uppercase border border-emerald-500/20">
                          Iniciante
                        </span>
                      )}
                      {userProgress.level === "intermediário" && (
                        <span className="text-[8px] font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md uppercase border border-indigo-500/20">
                          Intermediário
                        </span>
                      )}
                      {userProgress.level === "avançado" && (
                        <span className="text-[8px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md uppercase border border-amber-500/20">
                          Avançado
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="w-full bg-white/[0.03] h-1 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full
                            ${userProgress.level === "avançado" ? "bg-amber-500 w-full" : userProgress.level === "intermediário" ? "bg-indigo-500 w-2/3" : "bg-emerald-500 w-1/3"}`}
                        />
                      </div>
                      <div className="flex justify-between text-[8px] font-mono text-gray-650">
                        <span>Tópico em Estudo:</span>
                        <span className="text-gray-400">{userProgress.topic || "Lógica"}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center pt-1.5">
                      <div className="bg-[#141418] p-2 rounded-lg border border-white/5">
                        <span className="text-[8.5px] text-gray-500 font-mono uppercase block">Conquistas</span>
                        <span className="text-xs font-bold text-gray-300 mt-1 inline-flex items-center gap-1">
                          <Award size={11} className="text-amber-500" /> {userProgress.achievements?.length || 0}
                        </span>
                      </div>
                      <div className="bg-[#141418] p-2 rounded-lg border border-white/5">
                        <span className="text-[8.5px] text-gray-500 font-mono uppercase block">Erros Lógicos</span>
                        <span className="text-xs font-bold text-gray-300 mt-1 inline-flex items-center gap-1">
                          <AlertTriangle size={11} className={userProgress.mistakes?.length > 0 ? "text-rose-450" : "text-gray-500"} /> {userProgress.mistakes?.length || 0}
                        </span>
                      </div>
                    </div>

                    {userProgress.achievements && userProgress.achievements.length > 0 && (
                      <div className="pt-2.5 border-t border-white/[0.02] text-[9.5px] font-mono text-gray-500 truncate" title={userProgress.achievements[userProgress.achievements.length - 1]}>
                        <span className="text-amber-400">★</span> Última: {userProgress.achievements[userProgress.achievements.length - 1]}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sync database metadata footer */}
            <div className="p-4.5 border-t border-white/[0.04] bg-[#0b0b0d] text-[9.5px] font-mono text-gray-600 flex justify-between select-none">
              <span className="flex items-center gap-1"><Database size={11} className="text-gray-700" /> Histórico persistido</span>
              <span>SQLite</span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

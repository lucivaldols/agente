/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Paperclip,
  X,
  Menu,
  Sparkles,
  Code,
  Copy,
  Check,
  Terminal,
  Brain,
  ChevronRight,
  Info,
  Settings,
  Square
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCard } from "./components/ToolCard";
import { Conversation, Message, FileData, UserProgress } from "./types";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return localStorage.getItem("active_conversation_id") || "default-session";
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [fileDraft, setFileDraft] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);

  const [configPort, setConfigPort] = useState<number>(() => {
    const saved = localStorage.getItem("llama_port");
    return saved ? parseInt(saved, 10) : 8080;
  });
  const [configModel, setConfigModel] = useState<string>(() => {
    return localStorage.getItem("llama_model") || "tinyllama";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem("llama_port", configPort.toString());
  }, [configPort]);

  useEffect(() => {
    localStorage.setItem("llama_model", configModel);
  }, [configModel]);

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

  // Reset progress database back to initiator baseline values
  const handleResetProgress = async () => {
    if (!confirm("Tem certeza que deseja resetar o seu progresso e histórico de aprendizado no SQLite?")) {
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

  // Load chat session list from backend SQLite proxy
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

  // Load selected message history of active conversation
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

  // Run on startup
  useEffect(() => {
    fetchConversations();
    fetchProgress();
    return () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Sync conversation content when selection updates
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("active_conversation_id", activeConversationId);
      // Se houver stream ativo e o usuário trocar de conversa, aborte a conexão de forma limpa!
      if (activeAbortControllerRef.current) {
        console.log("[App] Abortando stream ativo ao trocar de sessão de conversa.");
        try {
          activeAbortControllerRef.current.abort();
        } catch (e) {}
      }
      fetchHistory(activeConversationId);
    }
  }, [activeConversationId]);

  // Handle auto-scroll on new responses
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Textarea auto-resize height management
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  // Initiate New Conversation Session
  const handleNewChat = async () => {
    try {
      const resp = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Nova Conversa ${conversations.length + 1}` })
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

  // Delete specific conversation session
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

  // Handle Drag-and-Drop upload signals
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Helper converting file to base64 draft representation
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

  // Submit trigger to backend `/chat` endpoint
  const handleSendMessage = async () => {
    // 1. Lock de envio (concorrência total): impede o disparo se um stream já estiver ativo
    if (isLoading) return;

    // 2. Debounce temporal de 800ms contra cliques em loops ou dobles-clicks
    const now = Date.now();
    if (now - lastSendTimeRef.current < 800) {
      console.warn("[App] Envio cancelado pelo debounce protetor de cliques.");
      return;
    }
    lastSendTimeRef.current = now;

    const messageText = inputMessage.trim();
    if (!messageText && !fileDraft) return;

    // Cancela qualquer requisição residual por segurança antes de inicializar a nova transmissão
    if (activeAbortControllerRef.current) {
      console.log("[App] Abortando conexão pendente residual.");
      try {
        activeAbortControllerRef.current.abort();
      } catch (e) {}
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    // Ready a optimistic user message node in local state
    const temporaryUserMsg: Message = {
      id: msgId,
      user_message: messageText || `Arquivo enviado: ${fileDraft?.name}`,
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
        throw new Error(`Servidor respondeu com código de erro ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) {
        throw new Error("Corpo da resposta do stream não está disponível.");
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
                // Ignore parsing chunk split issues
              }
            }
          }
        }
      }

      // Refresh conversations list in case title shifted
      fetchConversations(activeConversationId);
      fetchProgress();
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[App] Requisição abortada pelo usuário de forma limpa.");
        // Preserve whatever partial response we got
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
        console.error("Erro ao enviar mensagem:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  ai_response: accumulatedResponse
                    ? accumulatedResponse.split("[UPDATE_PROGRESS]")[0] + `\n\n⚠️ **Conexão encerrada com erro**\nDetalhes: \`${err.message || err}\``
                    : `⚠️ **Erro local de processamento**\nNão foi possível obter resposta do servidor local. Verifique se o host está ativo.\n\nDetalhes: \`${err.message || err}\``
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

  // Multi-line submission key handler: Submit on Enter, paragraph newline on Shift+Enter
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Copy whole message blocks cleanly
  const handleCopyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Starter Prompts Cards to assist testing
  const starterPrompts = [
    {
      title: "Algoritmo em Python",
      prompt: "Escreva uma função clássica em Python para ordenar uma lista usando o QuickSort, bem documentada.",
      icon: <Code className="text-blue-400" size={16} />
    },
    {
      title: "Comando Shell",
      prompt: "Como posso grep-ar arquivos recursively por um IP específico no diretório de logs /var/log/nginx/ no Linux?",
      icon: <Terminal className="text-emerald-400" size={16} />
    },
    {
      title: "Como funciona a memória?",
      prompt: "Explique como funciona a integração de persistência e memória SQLite local com o llama.cpp.",
      icon: <Brain className="text-brand-500" size={16} />
    }
  ];

  return (
    <div id="ai-studio-root" className="flex h-screen bg-[#0d0d0d] font-sans text-gray-200 overflow-hidden">
      
      {/* Sidebar Controller */}
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={setActiveConversationId}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        userProgress={userProgress}
        onResetProgress={handleResetProgress}
      />

      {/* Main chat window container */}
      <main className="flex-1 flex flex-col h-full bg-[#0d0d0d] relative overflow-hidden" onDragEnter={handleDrag}>
        
        {/* Dynamic Drag Overlay Backdrop */}
        {dragActive && (
          <div
            className="absolute inset-0 bg-brand-600/10 backdrop-blur-md border-[3px] border-dashed border-brand-500 rounded-2xl m-3 flex flex-col items-center justify-center z-30 transition-all cursor-copy"
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 bg-brand-500/20 border border-brand-500 flex items-center justify-center rounded-2xl mb-3 text-brand-500 animate-bounce">
              <Paperclip size={28} />
            </div>
            <p className="font-display font-bold text-lg text-white">Solte o arquivo aqui</p>
            <p className="text-xs text-slate-400 font-mono mt-1">Imagens, códigos, bancos ou logs de extensão geral</p>
          </div>
        )}

        {/* Global Toolbar Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 bg-[#0d0d0d]/80 backdrop-blur-md z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.03] transition cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="text-brand-500 animate-pulse" size={18} />
              <span className="text-sm font-bold font-display text-white">
                {conversations.find((c) => c.id === activeConversationId)?.title || "ChatGPT Local"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-white/5 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              <span className="text-[10px] font-bold font-mono text-slate-300 tracking-wide uppercase">
                SQLite memória ativa
              </span>
            </div>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.04] active:scale-95 transition cursor-pointer flex items-center gap-1.5 border border-white/5 bg-slate-900/40 text-xs font-semibold"
              title="Configurações do llama.cpp"
              id="settings-trigger-btn"
            >
              <Settings size={15} className="text-brand-500" />
              <span>Configurações</span>
            </button>
          </div>
        </header>

        {/* Dynamic Scroll Window Container */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            
            {messages.length === 0 ? (
              /* ONBOARDING HERO STATE */
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="py-12 md:py-16 text-center space-y-8"
              >
                <div className="inline-flex space-x-1.5 justify-center items-center scale-110">
                  <div className="w-12 h-12 bg-gradient-to-tr from-brand-600 to-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-brand-500/10">
                    <Brain size={24} className="animate-spin-slow" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl md:text-3xl font-extrabold font-display text-white tracking-tight">
                    Agente de IA Local
                  </h2>
                  <p className="text-slate-400 text-xs md:text-sm max-w-md mx-auto">
                    Suas conversas são processadas localmente e armazenadas de forma segura em um banco SQLite. 
                    Experimente uma das sugestões para ver as ferramentas locais em ação!
                  </p>
                </div>

                {/* Suggestions Grid list */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto pt-6 text-left">
                  {starterPrompts.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setInputMessage(item.prompt)}
                      className="group p-4 bg-slate-900/40 border border-white/5 rounded-2xl hover:bg-slate-900 hover:border-white/10 active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between space-y-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="p-2 bg-slate-950 border border-white/5 rounded-lg">
                          {item.icon}
                        </div>
                        <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{item.title}</h4>
                        <p className="text-[11px] text-slate-400 leading-normal mt-1 h-12 overflow-hidden truncate-multiline">
                          {item.prompt}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500 py-1 px-3 bg-slate-900/30 border border-white/5 rounded-full">
                  <Info size={10} />
                  <span>Nenhum dado sai do seu dispositivo</span>
                </div>
              </motion.div>
            ) : (
              /* ACTIVE MESSAGE DIALOG FLOW */
              <div className="space-y-6">
                {messages.map((item) => (
                  <div key={item.id} className="space-y-4 animate-fade-in">
                    
                    {/* User message block - aligned right */}
                    <div className="flex justify-end">
                      <div className="bg-[#262626] px-5 py-3 rounded-2xl rounded-tr-sm max-w-[75%] text-sm leading-relaxed text-gray-200 flex flex-col gap-1.5 border border-white/5 shadow-md">
                        <div className="text-sm font-sans whitespace-pre-wrap selection:bg-brand-500">
                          {item.user_message}
                        </div>
                        
                        {/* Display attached file metadata */}
                        {item.file && (
                          <div className="mt-1 inline-flex items-center gap-1 bg-black/25 text-[11px] font-mono py-1 px-2 rounded border border-white/5">
                            <span>📎 {item.file.name}</span>
                            <span className="opacity-60 text-[9px]">({Math.round(item.file.size / 1024)} KB)</span>
                          </div>
                        )}
                        <span className="text-[10px] text-slate-350 self-end opacity-70 mt-1">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {/* AI Response block - aligned left */}
                    {item.ai_response && (
                      <div className="flex gap-3 items-start mr-6">
                        {/* AI avatar frame */}
                        <div className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 flex-shrink-0 text-sm shadow font-display font-semibold">
                          AI
                        </div>

                        {/* Speech card layout */}
                        <div className="flex-1 space-y-4 bg-transparent border-0 rounded-none p-0">
                          
                          {/* Markdown parsing outlet */}
                          <MarkdownRenderer content={item.ai_response} />

                          {/* Visual Tool cards container */}
                          {item.tools && item.tools.length > 0 && (
                            <div className="pt-2 flex flex-wrap gap-2">
                              {item.tools.map((tc, idx) => (
                                <ToolCard key={idx} icon={tc.icon} label={tc.label} text={tc.text} />
                              ))}
                            </div>
                          )}

                          {/* Extra copy layout bar */}
                          <div className="flex items-center gap-3 pt-2.5 border-t border-white/[0.03] text-xs">
                            <button
                              onClick={() => handleCopyMessage(item.ai_response, item.id)}
                              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                              title="Copiar resposta inteira"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check size={12} className="text-emerald-400" />
                                  <span className="text-emerald-400">Copiada</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>Copiar</span>
                                </>
                              )}
                            </button>
                            <span className="text-[10px] font-mono text-slate-600 ml-auto">
                              {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Processing/Loading animation box */}
                {isLoading && (
                  <div className="flex gap-3 items-start mr-6 animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-slate-500 flex-shrink-0 text-sm font-semibold">
                      AI
                    </div>
                    <div className="flex-1 bg-slate-900/20 border border-white/[0.01] rounded-2xl rounded-tl-none p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                        <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" />
                        <span>llama.cpp pensando...</span>
                      </div>
                      
                      {/* Typing indicator placeholder bars */}
                      <div className="space-y-1.5">
                        <div className="h-3 w-[85%] bg-slate-900/80 rounded" />
                        <div className="h-3 w-[50%] bg-slate-900/80 rounded" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Dynamic bottom file dashboard and input zone controller */}
        <div className="px-4 py-4 md:px-8 flex-shrink-0 z-10">
          <div className="max-w-3xl mx-auto w-full space-y-2">
            
            {/* Show attachment drafting preview if any files exist in draft */}
            {fileDraft && (
              <div className="inline-flex items-center gap-3 bg-slate-900/90 border border-white/10 rounded-xl px-3 py-2 animate-fade-in shadow-xl">
                <div className="p-2 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-400">
                  <Paperclip size={16} />
                </div>
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-slate-200 truncate max-w-sm">{fileDraft.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{Math.round(fileDraft.size / 1024)} KB</p>
                </div>
                <button
                  onClick={() => setFileDraft(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Remover anexo"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Core message text box input drawer */}
            <div className="relative bg-[#212121] border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-blue-500 transition-all">
              
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pergunte ao seu Agente Local ou arraste um arquivo aqui..."
                className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 focus:ring-0 outline-none text-sm md:text-base resize-none py-1.5 focus:outline-none min-h-[36px] max-h-[200px]"
                disabled={isLoading}
              />

              <div className="h-9 flex items-center justify-between border-t border-white/[0.03] pt-1.5 mt-1.5">
                
                {/* Upload File button link layout */}
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-white/5 active:scale-95 text-slate-450 hover:text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider font-semibold"
                    title="Anexar arquivo"
                  >
                    <Paperclip size={15} />
                    <span className="hidden sm:inline">Anexar</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleManualUpload}
                    className="hidden"
                  />
                </div>

                {/* Process send button element */}
                {isLoading ? (
                  <button
                    onClick={() => {
                      if (activeAbortControllerRef.current) {
                        try {
                          activeAbortControllerRef.current.abort();
                        } catch (e) {}
                      }
                    }}
                    className="h-8 px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold select-none transition-all cursor-pointer bg-red-650 hover:bg-red-700 text-white shadow-lg active:scale-95 duration-200"
                    title="Parar de gerar resposta"
                  >
                    <Square size={12} className="fill-white" />
                    <span>Parar</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() && !fileDraft}
                    className={`h-8 px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold select-none transition-all cursor-pointer
                      ${(!inputMessage.trim() && !fileDraft)
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-brand-600 hover:bg-brand-700 text-white shadow-lg active:scale-95"}`}
                  >
                    <Send size={12} />
                    <span>Enviar</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-center text-slate-600 font-mono">
              Modelo local: <strong className="text-brand-400 font-bold">{configModel}.gguf</strong> • Porta ativa: <strong className="text-emerald-400 font-bold">{configPort}</strong> • SQLite Memória • PWA pronto
            </p>
          </div>
        </div>
      </main>

      {/* Configuration Slide-Over Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              id="settings-backdrop"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#161616] p-6 shadow-2xl z-10"
              id="settings-modal-card"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-400">
                    <Settings size={18} />
                  </div>
                  <h3 className="font-display font-bold text-base text-white">Configurações de Conexão</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Fechar"
                  id="settings-close-btn"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form Content */}
              <div className="space-y-5">
                {/* Port Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
                    Porta do Servidor llama-server:
                  </label>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Selecione ou insira a porta local na qual o seu serviço <code className="text-slate-300">llama.cpp</code> está respondendo.
                  </p>
                  
                  <div className="flex gap-2">
                    {/* Prestyled Quick Ports */}
                    {[8080, 9090, 3000].map((portVal) => (
                      <button
                        key={portVal}
                        type="button"
                        onClick={() => setConfigPort(portVal)}
                        className={`flex-1 py-1.5 px-2 text-xs font-mono font-medium rounded-lg border transition cursor-pointer
                          ${configPort === portVal
                            ? "bg-brand-500/10 border-brand-500 text-brand-400"
                            : "bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/15"}`}
                      >
                        Porta {portVal}
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    value={configPort}
                    onChange={(e) => setConfigPort(parseInt(e.target.value, 10) || 8080)}
                    placeholder="Ex: 8080"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    min="1"
                    max="65535"
                    id="input-port-setting"
                  />
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
                    Identidade do Modelo GGUF:
                  </label>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Selecione um dos modelos sugeridos ou digite o nome exato carregado por seu comando.
                  </p>

                  <div className="flex gap-2">
                    {/* Prestyled Quick Models */}
                    {["tinyllama", "qwen2-1.5b", "llama-3-8b"].map((modelVal) => (
                      <button
                        key={modelVal}
                        type="button"
                        onClick={() => setConfigModel(modelVal)}
                        className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition cursor-pointer truncate
                          ${configModel === modelVal
                            ? "bg-brand-500/10 border-brand-500 text-brand-400"
                            : "bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/15"}`}
                      >
                        {modelVal}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={configModel}
                    onChange={(e) => setConfigModel(e.target.value)}
                    placeholder="Nome do Modelo (ex: tinyllama)"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    id="input-model-setting"
                  />
                </div>

                {/* LLM Context Limit Tips Panel */}
                <div className="p-3 bg-brand-500/5 border border-brand-500/10 rounded-xl space-y-1.5">
                  <h4 className="text-[11px] font-bold font-mono text-brand-400 uppercase tracking-wide flex items-center gap-1">
                    💡 Dica de Tamanho de Contexto (Context Size)
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Se você receber erros informando que a requisição excede os tokens disponíveis (ex: 512 tokens), inicie seu servidor GGUF com o parâmetro de contexto ampliado:
                  </p>
                  <pre className="text-[9px] font-mono bg-black/40 p-1.5 rounded text-slate-300 overflow-x-auto border border-white/5">
                    ./llama-server -m modelo.gguf -c 2048 -t 4
                  </pre>
                  <p className="text-[9px] text-slate-500">
                    O agente agora encolhe dinamicamente o histórico e o prompt de sistema do llama.cpp local para caber mesmo sob limites restritos.
                  </p>
                </div>
              </div>

              {/* Status and Actions */}
              <div className="mt-8 pt-4 border-t border-white/5 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-white/5">
                  <span>URL do Endpoint:</span>
                  <span className="text-brand-400 font-semibold truncate select-all">
                    http://127.0.0.1:{configPort}/v1
                  </span>
                </div>
                
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-medium text-sm rounded-xl transition cursor-pointer hover:shadow-lg shadow-brand-500/15"
                  id="save-settings-btn"
                >
                  Salvar e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

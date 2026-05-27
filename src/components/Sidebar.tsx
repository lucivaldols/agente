/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MessageSquare, Plus, Trash2, Cpu, Database, Wifi, Award, BookOpen, AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { UserProgress } from "../types";

interface SidebarProps {
  conversations: Array<{ id: string; title: string; createdAt: string }>;
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  isOpen: boolean;
  onClose: () => void;
  userProgress: UserProgress | null;
  onResetProgress: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDeleteChat,
  isOpen,
  onClose,
  userProgress,
  onResetProgress,
}) => {
  return (
    <>
      {/* Mobile background backdrop overlay when sidebar is open */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-[#171717] border-r border-white/5 flex flex-col z-50 transform transition-transform duration-300 ease-out lg:relative lg:transform-none lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Sidebar Header with Brand/Local indicators */}
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Cpu size={18} className="animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display text-white tracking-wide">
                Agent Local
              </h1>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-mono font-medium uppercase tracking-wider">
                  llama.cpp: Online
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button: New Conversation */}
        <div className="p-4 flex-shrink-0">
          <button
            onClick={() => {
              onNewChat();
               onClose();
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-[0.98] text-sm font-medium text-white cursor-pointer"
          >
            <span className="text-sm font-medium">Nova conversa</span>
            <Plus size={16} className="text-slate-350" />
          </button>
        </div>

        {/* Sessions scroll container */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Conversas Recentes
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 font-mono">
              Nenhuma conversa salva
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv.id);
                    onClose();
                  }}
                  className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all duration-150 select-none text-sm font-medium
                    ${isActive
                      ? "bg-white/5 text-white border-l-2 border-blue-500"
                      : "border-l-2 border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
                >
                  <MessageSquare
                    size={15}
                    className={isActive ? "text-blue-500 flex-shrink-0" : "text-gray-500 flex-shrink-0"}
                  />
                  
                  <span className="flex-1 truncate">
                    {conv.title}
                  </span>

                  {/* Immediate delete button overlay */}
                  <button
                    onClick={(e) => onDeleteChat(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 cursor-pointer"
                    title="Excluir conversa"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Student Evolution Panel */}
        {userProgress && (
          <div className="mx-3 my-2 p-3.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col gap-2.5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-400" /> Evolução do Aluno
              </span>
              <button 
                onClick={onResetProgress}
                title="Resetar ficha de evolução"
                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                <RotateCcw size={11} />
              </button>
            </div>

            {/* Level Badge and Progress Indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {userProgress.level === "iniciante" && (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> Iniciante
                  </span>
                )}
                {userProgress.level === "intermediário" && (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" /> Intermediário
                  </span>
                )}
                {userProgress.level === "avançado" && (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" /> Avançado
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-400">
                {userProgress.level === "iniciante" ? "33%" : userProgress.level === "intermediário" ? "66%" : "100%"}
              </span>
            </div>

            {/* Custom progress bar */}
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ease-out rounded-full ${
                  userProgress.level === "iniciante" 
                    ? "bg-emerald-500 w-1/3" 
                    : userProgress.level === "intermediário" 
                      ? "bg-blue-500 w-2/3" 
                      : "bg-amber-500 w-full"
                }`}
              />
            </div>

            {/* Content Active Study */}
            <div className="flex items-start gap-1.5 pt-0.5">
              <BookOpen size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-slate-500 font-mono">Tópico Ativo</div>
                <div className="text-xs font-semibold text-slate-200 truncate">{userProgress.topic || "Lógica Geral"}</div>
              </div>
            </div>

            {/* Stats count grid */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[11px]">
              {/* Medalhas/Conquistas count */}
              <div className="px-2 py-1.5 bg-white/[0.01] border border-white/5 rounded-lg flex flex-col justify-center">
                <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wide">🏆 Conquistas</span>
                <span className="font-bold text-slate-200 font-sans flex items-center gap-1 mt-0.5">
                  <Award size={12} className="text-amber-400 flex-shrink-0" /> {userProgress.achievements?.length || 0}
                </span>
              </div>
              
              {/* Dificuldades count */}
              <div className="px-2 py-1.5 bg-white/[0.01] border border-white/5 rounded-lg flex flex-col justify-center">
                <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wide">⚠️ Erros</span>
                <span className="font-bold text-slate-250 font-sans flex items-center gap-1 mt-0.5">
                  <AlertTriangle size={12} className={userProgress.mistakes?.length > 0 ? "text-rose-400 flex-shrink-0" : "text-slate-500 flex-shrink-0"} /> {userProgress.mistakes?.length || 0}
                </span>
              </div>
            </div>

            {/* Last Award text */}
            {userProgress.achievements && userProgress.achievements.length > 0 && (
              <div className="text-[9px] text-slate-400 truncate border-t border-white/5 pt-2 font-mono flex items-center gap-1">
                <span className="text-amber-400">★</span> {userProgress.achievements[userProgress.achievements.length - 1]}
              </div>
            )}
          </div>
        )}

        {/* Hardware Status Footer Panel */}
        <div className="p-4 border-t border-white/5 bg-[#171717] space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Database size={11} className="text-slate-500" /> Memória:
            </span>
            <span className="text-slate-250 font-semibold">SQLite ATIVO</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Cpu size={11} className="text-slate-500" /> Host local:
            </span>
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              <Wifi size={11} /> 127.0.0.1
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};

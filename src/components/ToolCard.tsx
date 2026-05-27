/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";

interface ToolCardProps {
  icon: string;
  label: string;
  text?: string;
}

export const ToolCard: React.FC<ToolCardProps> = ({ icon, label, text }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl max-w-sm"
    >
      <div className="bg-blue-600 p-1.5 rounded-md text-lg text-white flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-200">
          {label}
        </p>
        <p className="text-[10px] text-gray-400 font-mono truncate">
          {text || "Operação realizada com sucesso no SQLite."}
        </p>
      </div>
      <div className="flex items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      </div>
    </motion.div>
  );
};

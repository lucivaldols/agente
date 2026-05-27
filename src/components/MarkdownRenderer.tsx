/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css"; // High-contrast dark syntax theme

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Configure marked for safe custom rendering
  const parsedHtml = marked.parse(content, {
    gfm: true,
    breaks: true,
  }) as string;

  useEffect(() => {
    if (!containerRef.current) return;

    // Apply syntax highlighting
    containerRef.current.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });

    // Programmatically inject copy buttons into each pre block
    containerRef.current.querySelectorAll("pre").forEach((preElement) => {
      // Check if button already exists to prevent duplicate insertion
      if (preElement.querySelector(".copy-btn-container")) return;

      // Extract raw code string
      const codeElement = preElement.querySelector("code");
      const rawCode = codeElement ? codeElement.innerText : "";

      // Create visual wrapper header inside pre block
      preElement.style.position = "relative";
      preElement.style.paddingTop = "36px"; // allocate space for the header bar

      const headerBar = document.createElement("div");
      headerBar.className = "copy-btn-container absolute top-0 left-0 right-0 h-9 bg-[#2d2d2d] border-b border-white/5 flex items-center justify-between px-4 text-xs font-mono text-slate-400 select-none rounded-t";
      
      // Attempt to extract programming language from standard classes (e.g. language-python)
      let detectedLang = "code";
      if (codeElement) {
        const classes = Array.from(codeElement.classList) as string[];
        const langClass = classes.find((c: string) => c.startsWith("language-"));
        if (langClass) {
          detectedLang = langClass.replace("language-", "").toUpperCase();
        }
      }

      const langSpan = document.createElement("span");
      langSpan.innerText = detectedLang;
      langSpan.className = "font-semibold text-slate-300 uppercase tracking-wider text-[10px]";
      headerBar.appendChild(langSpan);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "hover:text-white transition-colors duration-150 py-1 px-2.5 rounded bg-slate-800/50 hover:bg-slate-800 border border-white/5 font-sans flex items-center gap-1.5 cursor-pointer";
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copiar</span>
      `;

      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(rawCode).then(() => {
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="text-emerald-400">Copiado!</span>
          `;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>Copiar</span>
            `;
          }, 2000);
        }).catch((err) => {
          console.error("Falha ao copiar código:", err);
        });
      });

      headerBar.appendChild(copyBtn);
      preElement.appendChild(headerBar);
    });
  }, [content, parsedHtml]);

  return (
    <div
      ref={containerRef}
      className="prose prose-invert max-w-none text-slate-100 text-sm md:text-base leading-relaxed break-words space-y-3
        prose-p:leading-relaxed prose-p:my-2
        prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:m-0 prose-pre:mt-2
        prose-code:text-emerald-300 prose-code:bg-slate-900/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-[13px] prose-code:border prose-code:border-white/5
        prose-a:text-brand-500 hover:prose-a:underline
        prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5
        prose-li:my-1
        prose-table:border-collapse prose-table:w-full prose-table:my-4
        prose-th:border prose-th:border-white/10 prose-th:bg-slate-900/50 prose-th:p-2 prose-th:text-xs prose-th:font-semibold
        prose-td:border prose-td:border-white/10 prose-td:p-2 prose-td:text-xs md:prose-td:text-sm"
      dangerouslySetInnerHTML={{ __html: parsedHtml }}
    />
  );
};
